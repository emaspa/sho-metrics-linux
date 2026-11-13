import { describe, expect, it } from "vitest";

import {
    parseSkinColor,
    readOpenXlrSkinState,
    resolveOpenXlrSkinPaths,
    resolveFollowedSkinFromTokens,
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
        expect(resolveFollowedSkinFromTokens(amberDisplayTokens)).toEqual({ kind: "display", theme: "vfd-amber" });
        expect(resolveFollowedSkinFromTokens({ "Ox.Text.Primary": "#30e0f0", "Ox.Text.Ghost": "#0b2328" }))
            .toEqual({ kind: "display", theme: "vfd-blue" });
        expect(resolveFollowedSkinFromTokens({ "Ox.Text.Primary": "#50e070", "Ox.Text.Ghost": "#0c2616" }))
            .toEqual({ kind: "display", theme: "vfd-classic" });
    });

    it("wears any other skin as flat paint in its colours", () => {
        expect(resolveFollowedSkinFromTokens({
            "Ox.Card.Background": "#222222",
            "Ox.Text.Primary": "#e6e6e6",
            "Ox.Text.Muted": "#8c8c8c",
            "Ox.Meter.Track": "#141414",
            "Ox.Meter.Fill": "#4ade80",
            "Ox.Meter.Warning": "#facc15",
            "Ox.Meter.Hot": "#ef4444",
            "Ox.Meter.WarningLevel": 0.7,
            "Ox.Meter.HotLevel": 0.9,
            "Ox.Text.Ghost": "#00000000",
        })).toEqual({
            kind: "palette",
            palette: {
                background: "#222222",
                primaryText: "#e6e6e6",
                mutedText: "#8c8c8c",
                track: "#141414",
                meterFill: "#4ade80",
                meterWarning: "#facc15",
                meterHot: "#ef4444",
                meterWarningPercent: 70,
                meterHotPercent: 90,
            },
        });
    });

    it("blends translucent colours and refuses crossed thresholds", () => {
        const followedSkin = resolveFollowedSkinFromTokens({
            "Ox.Card.Background": "#80ffffff",
            "Ox.Meter.WarningLevel": 0.95,
            "Ox.Meter.HotLevel": 0.5,
        });
        expect(followedSkin.kind).toBe("palette");
        if (followedSkin.kind === "palette") {
            expect(followedSkin.palette.background).toBe("#808080");
            expect(followedSkin.palette.meterWarningPercent).toBe(70);
            expect(followedSkin.palette.meterHotPercent).toBe(90);
        }
    });

    it("follows nothing without OpenXLR settings", () => {
        expect(readOpenXlrSkinState(paths, createReader({}), undefined))
            .toEqual({ skinId: "broadcast", followedSkin: undefined });
    });

    it("wears Broadcast when OpenXLR holds no skin choice", () => {
        const followedSkin = readOpenXlrSkinState(paths, createReader({ [paths.preferencesFile]: {} }), undefined)
            .followedSkin;
        expect(followedSkin?.kind === "palette" && followedSkin.palette.background).toBe("#222222");
    });

    it("follows OpenXLR's built-in display skins by id", () => {
        const reader = createReader({ [paths.preferencesFile]: { skin: "vfd-classic" } });
        expect(readOpenXlrSkinState(paths, reader, undefined).followedSkin)
            .toEqual({ kind: "display", theme: "vfd-classic" });
        expect(readOpenXlrSkinState(paths, createReader({ [paths.preferencesFile]: { skin: "hifi" } }), undefined)
            .followedSkin?.kind).toBe("palette");
    });

    it("prefers a live palette from a running OpenXLR window", () => {
        const livePalette = { schema: 1, skin: "custom", pid: 42, tokens: amberDisplayTokens };
        const documents = {
            [paths.preferencesFile]: { skin: "custom" },
            [paths.livePaletteFile]: livePalette,
        };
        expect(readOpenXlrSkinState(paths, createReader(documents, [42]), undefined).followedSkin)
            .toEqual({ kind: "display", theme: "vfd-amber" });
        // A dead window's palette is ignored; an unknown skin wears the default colours.
        expect(readOpenXlrSkinState(paths, createReader(documents), undefined).followedSkin?.kind)
            .toBe("palette");
    });

    it("lets a local skin package replace a built-in skin", () => {
        const skinFile = `${paths.skinRoots[0] ?? ""}/vfd-amber/skin.json`;
        const reader = createReader({
            [paths.preferencesFile]: { skin: "vfd-amber" },
            [skinFile]: { schema: 1, tokens: { "Ox.Text.Primary": "#e6e6e6" } },
        });
        expect(readOpenXlrSkinState(paths, reader, undefined).followedSkin?.kind).toBe("palette");
    });

    it("uses an explicit skin id over the saved choice", () => {
        const reader = createReader({ [paths.preferencesFile]: { skin: "broadcast" } });
        expect(readOpenXlrSkinState(paths, reader, "vfd-blue").followedSkin)
            .toEqual({ kind: "display", theme: "vfd-blue" });
    });
});
