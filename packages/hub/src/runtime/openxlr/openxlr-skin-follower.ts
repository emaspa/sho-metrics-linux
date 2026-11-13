import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { logger } from "../../logging/node-logger";
import type { VfdMetricTheme } from "../../settings/resolved-settings";
import { VFD_PALETTES } from "../../view-rendering/color/vfd-theme-tokens";

// OpenXLR (the Wave XLR mixer) keeps its skin choice in its settings and, while
// its window is open, publishes the skin's colours for deck plugins. Widgets
// follow a skin that draws a vacuum fluorescent display (one that sets unlit
// segment cells in Ox.Text.Ghost) by wearing the VFD theme nearest its lit
// colour. Any other skin, or no OpenXLR at all, leaves every widget's own theme.
// The reading rules match skin-palette.mjs in the OpenXLR deck plugin.

const log = logger.for("OpenXlrSkinFollower");

const MAX_DOCUMENT_BYTES = 256 * 1024;
const RELOAD_DEBOUNCE_MILLISECONDS = 50;
const MAX_SKIN_ROOT_COUNT = 32;
// The skin OpenXLR wears while its settings hold no choice.
const OPENXLR_STARTING_SKIN_ID = "broadcast";
const OPENXLR_FALLBACK_SKIN_ID = "default";
// OpenXLR's own display skins, for when no package or live palette describes them.
const BUILT_IN_DISPLAY_SKIN_THEMES: Readonly<Record<string, VfdMetricTheme>> = {
    "vfd-amber": "vfd-amber",
    "vfd-blue": "vfd-blue",
    "vfd-classic": "vfd-classic",
};
const NAMED_COLOR_HEX: Readonly<Record<string, string>> = {
    black: "#000000ff",
    white: "#ffffffff",
    transparent: "#00000000",
    red: "#ff0000ff",
    green: "#008000ff",
    blue: "#0000ffff",
    yellow: "#ffff00ff",
    gray: "#808080ff",
    grey: "#808080ff",
};

interface SkinColor {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
}

type JsonObject = Readonly<Record<string, unknown>>;

export interface OpenXlrSkinPaths {
    readonly preferencesFile: string;
    readonly livePaletteFile: string;
    readonly skinRoots: readonly string[];
}

export function resolveOpenXlrSkinPaths(
    env: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = os.homedir(),
): OpenXlrSkinPaths {
    const configHome = env.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
    const dataHome = env.XDG_DATA_HOME || path.join(homeDirectory, ".local/share");
    const dataDirectories = (env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":").filter(Boolean);
    const preferencesFile = path.join(configHome, "openxlr", "ui.json");
    return {
        preferencesFile,
        livePaletteFile: path.join(path.dirname(preferencesFile), "deck-palette.json"),
        skinRoots: [...new Set([dataHome, ...dataDirectories])]
            .slice(0, MAX_SKIN_ROOT_COUNT)
            .map(root => path.join(root, "openxlr", "skins")),
    };
}

function isValidSkinId(skinId: unknown): skinId is string {
    return typeof skinId === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(skinId);
}

/** Reads a skin colour token: a hex or named colour, or a gradient's first stop. */
export function parseSkinColor(value: unknown): SkinColor | undefined {
    const colorText = readGradientFirstStop(value) ?? value;
    if (typeof colorText !== "string") {
        return undefined;
    }

    const named = NAMED_COLOR_HEX[colorText.toLowerCase()];
    const hexText = named ?? colorText;
    if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(hexText)) {
        return undefined;
    }

    let digits = hexText.slice(1);
    if (digits.length <= 4) {
        digits = [...digits].map(digit => digit + digit).join("");
    }
    // Avalonia writes alpha first; the named table is written alpha last.
    if (digits.length === 8 && named === undefined) {
        digits = digits.slice(2) + digits.slice(0, 2);
    }
    const channel = (offset: number): number => Number.parseInt(digits.slice(offset, offset + 2), 16);
    return {
        red: channel(0),
        green: channel(2),
        blue: channel(4),
        alpha: digits.length === 8 ? channel(6) : 255,
    };
}

function readGradientFirstStop(value: unknown): unknown {
    if (!isJsonObject(value) || (value.type !== "linear" && value.type !== "radial")) {
        return undefined;
    }
    const stops = value.stops;
    if (!Array.isArray(stops) || stops.length < 2 || stops.length > 16) {
        return null;
    }
    const firstStop: unknown = stops[0];
    return isJsonObject(firstStop) ? firstStop.color : null;
}

/**
 * The VFD theme a skin's colour tokens call for, or undefined when the skin
 * does not draw a display.
 */
export function resolveVfdThemeFromSkinTokens(tokens: JsonObject | undefined): VfdMetricTheme | undefined {
    const ghostColor = parseSkinColor(tokens?.["Ox.Text.Ghost"]);
    if (!ghostColor || ghostColor.alpha === 0) {
        return undefined;
    }
    const litColor = parseSkinColor(tokens?.["Ox.Text.Primary"]);
    if (!litColor) {
        return undefined;
    }

    let nearestTheme: VfdMetricTheme | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [themeName, palette] of Object.entries(VFD_PALETTES) as [VfdMetricTheme, { lit: string }][]) {
        const paletteLitColor = parseSkinColor(palette.lit);
        if (!paletteLitColor) {
            continue;
        }
        const distance = (litColor.red - paletteLitColor.red) ** 2
            + (litColor.green - paletteLitColor.green) ** 2
            + (litColor.blue - paletteLitColor.blue) ** 2;
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestTheme = themeName;
        }
    }
    return nearestTheme;
}

export interface OpenXlrSkinReader {
    readJson(file: string): JsonObject | undefined;
    exists(file: string): boolean;
    isProcessAlive(processId: number): boolean;
}

export const nodeOpenXlrSkinReader: OpenXlrSkinReader = {
    readJson(file) {
        let fileDescriptor: number | undefined;
        try {
            // Nonblocking open plus fstat refuses pipes without waiting for a writer.
            fileDescriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
            const fileInfo = fs.fstatSync(fileDescriptor);
            if (!fileInfo.isFile() || fileInfo.size > MAX_DOCUMENT_BYTES) {
                return undefined;
            }
            const buffer = Buffer.alloc(Math.min(fileInfo.size + 1, MAX_DOCUMENT_BYTES + 1));
            const byteCount = fs.readSync(fileDescriptor, buffer, 0, buffer.length, 0);
            if (byteCount > MAX_DOCUMENT_BYTES) {
                return undefined;
            }
            const document: unknown = JSON.parse(buffer.subarray(0, byteCount).toString("utf8"));
            return isJsonObject(document) ? document : undefined;
        } catch {
            return undefined;
        } finally {
            if (fileDescriptor !== undefined) {
                fs.closeSync(fileDescriptor);
            }
        }
    },
    exists(file) {
        try {
            fs.lstatSync(file);
            return true;
        } catch {
            return false;
        }
    },
    isProcessAlive(processId) {
        try {
            process.kill(processId, 0);
            return true;
        } catch {
            return false;
        }
    },
};

export interface OpenXlrSkinState {
    readonly skinId: string;
    readonly followedTheme: VfdMetricTheme | undefined;
}

/** Works out which skin OpenXLR wears and the VFD theme it calls for. */
export function readOpenXlrSkinState(
    paths: OpenXlrSkinPaths,
    reader: OpenXlrSkinReader,
    skinIdOverride: string | undefined,
): OpenXlrSkinState {
    let skinId: unknown = skinIdOverride ?? reader.readJson(paths.preferencesFile)?.skin;
    if (skinId === undefined || skinId === null || skinId === "") {
        skinId = OPENXLR_STARTING_SKIN_ID;
    }
    const validSkinId = isValidSkinId(skinId) ? skinId : OPENXLR_FALLBACK_SKIN_ID;

    const livePalette = skinIdOverride === undefined ? reader.readJson(paths.livePaletteFile) : undefined;
    const livePaletteProcessId = livePalette?.pid;
    if (livePalette?.schema === 1 && livePalette.skin === validSkinId
        && typeof livePaletteProcessId === "number" && Number.isSafeInteger(livePaletteProcessId)
        && livePaletteProcessId > 0 && reader.isProcessAlive(livePaletteProcessId)
        && isJsonObject(livePalette.tokens)) {
        return { skinId: validSkinId, followedTheme: resolveVfdThemeFromSkinTokens(livePalette.tokens) };
    }

    if (validSkinId !== OPENXLR_FALLBACK_SKIN_ID) {
        for (const skinRoot of paths.skinRoots) {
            const skinFile = path.join(skinRoot, validSkinId, "skin.json");
            // An existing local package wins over the built-in skin even when
            // its document is invalid, as in OpenXLR.
            if (reader.exists(skinFile)) {
                const skinDocument = reader.readJson(skinFile);
                const tokens = skinDocument?.schema === 1 && isJsonObject(skinDocument.tokens)
                    ? skinDocument.tokens
                    : undefined;
                return { skinId: validSkinId, followedTheme: resolveVfdThemeFromSkinTokens(tokens) };
            }
        }
    }

    return { skinId: validSkinId, followedTheme: BUILT_IN_DISPLAY_SKIN_THEMES[validSkinId] };
}

class OpenXlrSkinFollower {
    private state: OpenXlrSkinState | undefined;
    private readonly listeners = new Set<() => void>();
    private watchers: fs.FSWatcher[] = [];
    private reloadTimer: NodeJS.Timeout | undefined;
    private readonly paths = resolveOpenXlrSkinPaths();

    /** The VFD theme OpenXLR's skin calls for, or undefined to keep each widget's theme. */
    followedTheme(): VfdMetricTheme | undefined {
        if (process.platform !== "linux") {
            return undefined;
        }
        if (!this.state) {
            this.reload();
        }
        return this.state?.followedTheme;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    dispose(): void {
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = undefined;
        }
        for (const watcher of this.watchers) {
            watcher.close();
        }
        this.watchers = [];
    }

    private reload(): void {
        const previousTheme = this.state?.followedTheme;
        const nextState = readOpenXlrSkinState(this.paths, nodeOpenXlrSkinReader, process.env.OPENXLR_SKIN || undefined);
        const isFirstRead = this.state === undefined;
        this.state = nextState;
        this.watch(nextState.skinId);
        if (isFirstRead || previousTheme !== nextState.followedTheme) {
            log.info(() => `openXlrSkin skin=${nextState.skinId} followedTheme=${nextState.followedTheme ?? "none"}`);
        }
        if (!isFirstRead && previousTheme !== nextState.followedTheme) {
            for (const listener of this.listeners) {
                listener();
            }
        }
    }

    private watch(skinId: string): void {
        this.dispose();
        const watchedNamesByFolder = new Map<string, Set<string>>();
        const skinFiles = skinId === OPENXLR_FALLBACK_SKIN_ID
            ? []
            : this.paths.skinRoots.map(skinRoot => path.join(skinRoot, skinId, "skin.json"));
        for (const file of [this.paths.preferencesFile, this.paths.livePaletteFile, ...skinFiles]) {
            // A missing folder is watched from its nearest existing parent so
            // that installing OpenXLR or a skin package is noticed.
            let folder = path.dirname(file);
            while (!fs.existsSync(folder) && path.dirname(folder) !== folder) {
                folder = path.dirname(folder);
            }
            const nextPathPart = path.relative(folder, file).split(path.sep)[0] ?? "";
            const watchedNames = watchedNamesByFolder.get(folder) ?? new Set<string>();
            watchedNames.add(nextPathPart);
            watchedNamesByFolder.set(folder, watchedNames);
        }

        for (const [folder, watchedNames] of watchedNamesByFolder) {
            try {
                const watcher = fs.watch(folder, { persistent: false }, (_eventType, fileName) => {
                    if (fileName !== null && !watchedNames.has(fileName.toString())) {
                        return;
                    }
                    this.scheduleReload();
                });
                watcher.on("error", () => watcher.close());
                this.watchers.push(watcher);
            } catch {
                // An inaccessible folder cannot be watched.
            }
        }
    }

    private scheduleReload(): void {
        if (this.reloadTimer) {
            return;
        }
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = undefined;
            this.reload();
        }, RELOAD_DEBOUNCE_MILLISECONDS);
        this.reloadTimer.unref();
    }
}

export const openXlrSkinFollower = new OpenXlrSkinFollower();

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
