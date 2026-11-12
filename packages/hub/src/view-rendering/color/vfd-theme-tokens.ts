export type VfdThemeName = "vfd-amber" | "vfd-blue" | "vfd-classic";

export interface VfdMeterZone {
    /** Percent of full scale where this colour takes over. */
    readonly fromPercent: number;
    readonly color: string;
}

export interface VfdPalette {
    readonly background: string;
    /** Phosphor core. */
    readonly lit: string;
    readonly litRgbChannels: string;
    /** Unlit 7-segment cells behind the smoked filter. */
    readonly ghost: string;
    /** Printed, non-emissive legends. */
    readonly silk: string;
    readonly frame: string;
    readonly frameRgbChannels: string;
    /** Light bleeding around the panel. */
    readonly spill: string;
    /** Glass reflection tint. */
    readonly sheen: string;
    /**
     * First three rows of the feColorMatrix that turns a lit colour into its
     * halo. Each maps this palette's core and meter zones onto the halo colours
     * of vfd-clock-opendeck/tools/vfd_palette.py.
     */
    readonly haloMatrixRows: string;
    /** Meter colours above the lit zone, in ascending order. */
    readonly zones: readonly VfdMeterZone[];
}

// Colours follow the VFD Clock keys (vfd-clock-opendeck/tools/vfd_palette.py),
// which follow OpenXLR's Hi-Fi and Broadcast skins and the InfoPanel VFD
// profiles: one phosphor colour, then red for the top 30% of every meter on
// amber and blue, and yellow from 70% and red from 90% on classic green.
export const VFD_PALETTES = {
    "vfd-amber": {
        background: "#090503",
        lit: "#ff9634",
        litRgbChannels: "255,150,52",
        ghost: "#281308",
        silk: "#a85622",
        frame: "#4a2610",
        frameRgbChannels: "74,38,16",
        spill: "#5a2308",
        sheen: "#ffdcbe",
        // Green cut to 56% and blue removed: amber (255,150,52) becomes
        // (255,84,0) and red (255,59,47) a deep red.
        haloMatrixRows: "1 0 0 0 0  0 0.56 0 0 0  0 0 0 0 0",
        zones: [{ fromPercent: 70, color: "#ff3b2f" }],
    },
    "vfd-blue": {
        background: "#03080b",
        lit: "#3fe6ff",
        litRgbChannels: "63,230,255",
        ghost: "#0b2328",
        silk: "#3294a6",
        frame: "#0e3842",
        frameRgbChannels: "14,56,66",
        spill: "#042846",
        sheen: "#beeeff",
        // Cyan (63,230,255) to (0,120,255), red (255,59,47) to (255,12,0).
        haloMatrixRows: "1.054 -0.088 -0.181 0 0  -0.058 0.236 0.272 0 0  -0.228 0.511 0.595 0 0",
        zones: [{ fromPercent: 70, color: "#ff3b2f" }],
    },
    "vfd-classic": {
        background: "#030905",
        lit: "#4ade80",
        litRgbChannels: "74,222,128",
        ghost: "#0c2616",
        silk: "#3ca060",
        frame: "#123e22",
        frameRgbChannels: "18,62,34",
        spill: "#063c18",
        sheen: "#c8ffd7",
        // Green (74,222,128) to (0,200,60), yellow (250,204,21) to (255,150,0),
        // red (239,68,68) to (255,20,10).
        haloMatrixRows: "1.223 -0.215 -0.335 0 0  -0.19 0.969 -0.008 0 0  -0.092 0.071 0.398 0 0",
        zones: [
            { fromPercent: 70, color: "#facc15" },
            { fromPercent: 90, color: "#ef4444" },
        ],
    },
} as const satisfies Record<VfdThemeName, VfdPalette>;
