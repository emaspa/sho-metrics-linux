import { describe, expect, it } from "vitest";

import {
    parseSkinColor,
    readOpenXlrSkinState,
    resolveOpenXlrSkinPaths,
    resolveVfdThemeFromSkinTokens,
    type OpenXlrSkinReader,
} from "./openxlr-skin-follower";

const paths = resolveOpenXlrSkinPaths({ XDG_DATA_DIRS: "/usr/share" }, "/home/tester");

function createReader(
    documents: Record<string, unknown>,
    aliveProcessIds: readonly number[] = [],
): OpenXlrSkinReader {
    return {
        readJson: file => documents[file] as Record<string, unknown> | undefined,
        exists: file => file in documents,
        isProcessAlive: processId => aliveProcessIds.includes(processId),
    };
}

const amberDisplayTokens = {
    "Ox.Text.Primary": "#ffff9634",
    "Ox.Text.Ghost": "#ff281308",
};

describe("OpenXLR skin follower", () => {
    it("resolves XDG paths", () => {
        expect(paths).toEqual({
            preferencesFile: "/home/tester/.config/openxlr/ui.json",
            livePaletteFile: "/home/tester/.config/openxlr/deck-palette.json",
            skinRoots: ["/home/tester/.local/share/openxlr/skins", "/usr/share/openxlr/skins"],
        });
    });

    it("reads alpha-first 8-digit colours and named colours", () => {
        expect(parseSkinColor("#80ff9634")).toEqual({ red: 255, green: 150, blue: 52, alpha: 128 });
        expect(parseSkinColor("#4ade80")).toEqual({ red: 74, green: 222, blue: 128, alpha: 255 });
        expect(parseSkinColor("transparent")?.alpha).toBe(0);
        expect(parseSkinColor({
            type: "linear",
            stops: [{ offset: 0, color: "#3fe6ff" }, { offset: 1, color: "#000000" }],
        })).toEqual({ red: 63, green: 230, blue: 255, alpha: 255 });
        expect(parseSkinColor("not-a-colour")).toBeUndefined();
    });

    it("picks the VFD theme nearest a display skin's lit colour", () => {
        expect(resolveVfdThemeFromSkinTokens(amberDisplayTokens)).toBe("vfd-amber");
        expect(resolveVfdThemeFromSkinTokens({ "Ox.Text.Primary": "#30e0f0", "Ox.Text.Ghost": "#0b2328" }))
            .toBe("vfd-blue");
        expect(resolveVfdThemeFromSkinTokens({ "Ox.Text.Primary": "#50e070", "Ox.Text.Ghost": "#0c2616" }))
            .toBe("vfd-classic");
    });

    it("ignores skins without unlit segment cells", () => {
        expect(resolveVfdThemeFromSkinTokens({ "Ox.Text.Primary": "#e6e6e6" })).toBeUndefined();
        expect(resolveVfdThemeFromSkinTokens({ "Ox.Text.Primary": "#e6e6e6", "Ox.Text.Ghost": "#00000000" }))
            .toBeUndefined();
    });

    it("follows nothing without OpenXLR settings", () => {
        expect(readOpenXlrSkinState(paths, createReader({}), undefined))
            .toEqual({ skinId: "broadcast", followedTheme: undefined });
    });

    it("follows OpenXLR's built-in display skins by id", () => {
        const reader = createReader({ [paths.preferencesFile]: { skin: "vfd-classic" } });
        expect(readOpenXlrSkinState(paths, reader, undefined).followedTheme).toBe("vfd-classic");
        expect(readOpenXlrSkinState(paths, createReader({ [paths.preferencesFile]: { skin: "hifi" } }), undefined)
            .followedTheme).toBeUndefined();
    });

    it("prefers a live palette from a running OpenXLR window", () => {
        const livePalette = { schema: 1, skin: "custom", pid: 42, tokens: amberDisplayTokens };
        const documents = {
            [paths.preferencesFile]: { skin: "custom" },
            [paths.livePaletteFile]: livePalette,
        };
        expect(readOpenXlrSkinState(paths, createReader(documents, [42]), undefined).followedTheme)
            .toBe("vfd-amber");
        expect(readOpenXlrSkinState(paths, createReader(documents), undefined).followedTheme)
            .toBeUndefined();
    });

    it("lets a local skin package replace a built-in skin", () => {
        const skinFile = `${paths.skinRoots[0] ?? ""}/vfd-amber/skin.json`;
        const reader = createReader({
            [paths.preferencesFile]: { skin: "vfd-amber" },
            [skinFile]: { schema: 1, tokens: { "Ox.Text.Primary": "#e6e6e6" } },
        });
        expect(readOpenXlrSkinState(paths, reader, undefined).followedTheme).toBeUndefined();
    });

    it("uses an explicit skin id over the saved choice", () => {
        const reader = createReader({ [paths.preferencesFile]: { skin: "broadcast" } });
        expect(readOpenXlrSkinState(paths, reader, "vfd-blue").followedTheme).toBe("vfd-blue");
    });
});
