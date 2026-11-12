import type { KeySize } from "../../view-rendering/widget-data";
import {
    VFD_LABEL_GLOW_FILTER_ID,
    VFD_METRIC_GLOW_FILTER_ID,
    VFD_SUBTLE_GLOW_FILTER_ID,
    VFD_VALUE_GLOW_FILTER_ID,
} from "../../view-rendering/rasterize/render-svg-effects";
import { parseHexColor, resolveRelativeLuminance } from "../../shared/color-utils";
import { VFD_PALETTES, type VfdPalette, type VfdThemeName } from "../../view-rendering/color/vfd-theme-tokens";
import { renderFullBleedThemeBackground, type ThemeStyle } from "./theme-style";

// Geometry follows the InfoPanel VFD profiles and the VFD Clock keys
// (vfd-clock-opendeck/tools/gen_keys.py), authored on a 144 px key.
const VFD_REFERENCE_SIZE = 144;
const VFD_PANEL_RADIUS = 12;
// The clock keys inset their frame by 5 px; metric rings reach the key edge,
// so here the frame hugs the panel.
const VFD_FRAME_INSET = 1;
const VFD_FRAME_RADIUS = 11;
const VFD_FRAME_WIDTH = 2;
const VFD_SPILL_OPACITY = 0.2;
const VFD_SHEEN_OPACITY = 0.07;
const VFD_MESH_PITCH = 3;
const VFD_MESH_ROW_OPACITY = 0.27;
const VFD_MESH_COLUMN_OPACITY = 0.18;
const VFD_SEVEN_SEGMENT_FAMILY_PATTERN = /font-family="[^"]*DSEG7 Classic/u;
const VFD_TEXT_ELEMENT_PATTERN = /<text\b[\s\S]*?<\/text>/gu;
const VFD_LIT_CELL_PATTERN = /[0-9A-Za-z-]/gu;
// Dense bars print readings in dark ink on the lit bar; those get no ghost.
const VFD_DARK_INK_LUMINANCE = 0.1;

interface VfdGlowSettings {
    readonly id: string;
    readonly tightBlur: number;
    readonly wideBlur: number;
    readonly wideOpacity: number;
    readonly region: string;
}

// The halo is the lit colour through the palette's halo matrix. resvg 2.6
// panics on an arithmetic feComposite of differently sized blur results, so the
// halo is merged under the core instead of added like InfoPanel's SkiaSharp
// Plus blend.
const VFD_GLOW_SETTINGS: readonly VfdGlowSettings[] = [
    {
        id: VFD_VALUE_GLOW_FILTER_ID,
        tightBlur: 0.6,
        wideBlur: 3.2,
        wideOpacity: 0.85,
        region: `x="-40%" y="-70%" width="180%" height="240%"`,
    },
    {
        id: VFD_LABEL_GLOW_FILTER_ID,
        tightBlur: 0.4,
        wideBlur: 1.8,
        wideOpacity: 0.6,
        region: `x="-32%" y="-54%" width="164%" height="208%"`,
    },
    {
        id: VFD_METRIC_GLOW_FILTER_ID,
        tightBlur: 0.5,
        wideBlur: 2.6,
        wideOpacity: 0.75,
        region: `x="-30%" y="-42%" width="160%" height="184%"`,
    },
    {
        id: VFD_SUBTLE_GLOW_FILTER_ID,
        tightBlur: 0.3,
        wideBlur: 1.4,
        wideOpacity: 0.45,
        region: `x="-24%" y="-30%" width="148%" height="160%"`,
    },
];

export const vfdAmberStyle = createVfdStyle("vfd-amber");
export const vfdBlueStyle = createVfdStyle("vfd-blue");
export const vfdClassicStyle = createVfdStyle("vfd-classic");

/**
 * VFD style: a vacuum fluorescent display behind smoked glass. Phosphor text
 * with an additive halo, a dim frame, light spill, the fine control-grid mesh,
 * and a faint glass sheen.
 */
function createVfdStyle(themeName: VfdThemeName): ThemeStyle {
    const palette: VfdPalette = VFD_PALETTES[themeName];

    return {
        styleId: themeName,

        renderDefs(keySize) {
            const idPrefix = vfdIdPrefix(keySize);
            const scale = vfdScale(keySize);
            const meshPitch = VFD_MESH_PITCH * scale;
            const meshLine = Math.max(scale, 0.5);

            return `
                <radialGradient id="${idPrefix}-spill" cx="50%" cy="58%" r="62%">
                    <stop offset="0%" stop-color="${palette.spill}" stop-opacity="${VFD_SPILL_OPACITY}" />
                    <stop offset="100%" stop-color="${palette.spill}" stop-opacity="0" />
                </radialGradient>
                <linearGradient id="${idPrefix}-sheen" x1="0" y1="0" x2="0.35" y2="1">
                    <stop offset="0%" stop-color="${palette.sheen}" stop-opacity="${VFD_SHEEN_OPACITY}" />
                    <stop offset="38%" stop-color="${palette.sheen}" stop-opacity="${VFD_SHEEN_OPACITY * 0.35}" />
                    <stop offset="60%" stop-color="${palette.sheen}" stop-opacity="0" />
                </linearGradient>
                <pattern id="${idPrefix}-mesh" x="0" y="0" width="${meshPitch}" height="${meshPitch}"
                    patternUnits="userSpaceOnUse">
                    <rect x="0" y="0" width="${meshPitch}" height="${meshLine}"
                        fill="#000000" fill-opacity="${VFD_MESH_ROW_OPACITY}" />
                    <rect x="0" y="${meshLine}" width="${meshLine}" height="${meshPitch - meshLine}"
                        fill="#000000" fill-opacity="${VFD_MESH_COLUMN_OPACITY}" />
                </pattern>
                ${VFD_GLOW_SETTINGS.map(glow => renderVfdGlowFilter(glow, palette.haloMatrixRows)).join("")}
            `;
        },

        renderBackground(keySize, paints) {
            const idPrefix = vfdIdPrefix(keySize);

            return `
                ${renderFullBleedThemeBackground(keySize, paints)}
                <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                    rx="${VFD_PANEL_RADIUS * vfdScale(keySize)}" fill="${paints.background}" />
                <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                    rx="${VFD_PANEL_RADIUS * vfdScale(keySize)}" fill="url(#${idPrefix}-spill)" />
            `;
        },

        renderPanelOverlay(keySize) {
            return `
                <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                    fill="url(#${vfdIdPrefix(keySize)}-mesh)" />
            `;
        },

        transformBody(bodySvg) {
            return bodySvg.replace(VFD_TEXT_ELEMENT_PATTERN, textElement =>
                isLitSevenSegmentText(textElement)
                    ? `${renderVfdGhostText(textElement, palette.ghost)}${textElement}`
                    : textElement);
        },

        renderOverlay(keySize: KeySize) {
            const scale = vfdScale(keySize);
            const inset = VFD_FRAME_INSET * scale;
            const strokeWidth = VFD_FRAME_WIDTH * scale;

            return `
                <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                    fill="url(#${vfdIdPrefix(keySize)}-sheen)" />
                <rect x="${inset}" y="${inset}"
                    width="${keySize.width - inset * 2}" height="${keySize.height - inset * 2}"
                    rx="${VFD_FRAME_RADIUS * scale}" fill="none"
                    stroke="${palette.frame}" stroke-width="${strokeWidth}" />
            `;
        },
    };
}

function isLitSevenSegmentText(textElement: string): boolean {
    if (!VFD_SEVEN_SEGMENT_FAMILY_PATTERN.test(textElement)) {
        return false;
    }

    const fills = Array.from(textElement.matchAll(/\sfill="(#[0-9a-fA-F]{3,8})"/gu), match => match[1]);
    return !fills.some(fill => {
        const color = parseHexColor(fill);
        return color !== undefined && resolveRelativeLuminance(color) < VFD_DARK_INK_LUMINANCE;
    });
}

/**
 * Copies a text element that holds a DSEG7 reading into its unlit segments.
 *
 * Every DSEG cell is the same width, so turning each digit, letter, and minus
 * into "8" keeps the copy on the same cells, decimal points and textLength
 * included. Runs in other faces, such as the DSEG14 unit, stay in the copy to
 * keep the spacing but are not painted. Ids and filters are dropped so the copy
 * neither glows nor duplicates an id; clip paths stay so it clips like the
 * reading.
 */
function renderVfdGhostText(textElement: string, ghostColor: string): string {
    const isSevenSegmentStack: boolean[] = [];

    return textElement
        .split(/(<[^>]+>)/u)
        .map(token => {
            if (token.startsWith("</")) {
                isSevenSegmentStack.pop();
                return token;
            }

            if (token.startsWith("<")) {
                const parentIsSevenSegment = isSevenSegmentStack.at(-1) ?? false;
                const isSevenSegment = /font-family="/u.test(token)
                    ? VFD_SEVEN_SEGMENT_FAMILY_PATTERN.test(token)
                    : parentIsSevenSegment;

                if (!token.endsWith("/>")) {
                    isSevenSegmentStack.push(isSevenSegment);
                }

                return token
                    .replace(/\s(?:id|filter|fill|stroke[a-z-]*)="[^"]*"/gu, "")
                    .replace(/^<(\w+)/u, `<$1 fill="${isSevenSegment ? ghostColor : "none"}"`);
            }

            return isSevenSegmentStack.at(-1) === true
                ? token.replace(VFD_LIT_CELL_PATTERN, "8")
                : token;
        })
        .join("");
}

function renderVfdGlowFilter(glow: VfdGlowSettings, haloMatrixRows: string): string {
    return `
        <filter id="${glow.id}" ${glow.region} color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.wideBlur}" result="wideBlur" />
            <feColorMatrix in="wideBlur" type="matrix"
                values="${haloMatrixRows}  0 0 0 ${glow.wideOpacity} 0" result="halo" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.tightBlur}" result="tightBlur" />
            <feMerge>
                <feMergeNode in="halo" />
                <feMergeNode in="tightBlur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    `;
}

function vfdScale(keySize: KeySize): number {
    return Math.min(keySize.width, keySize.height) / VFD_REFERENCE_SIZE;
}

function vfdIdPrefix(keySize: KeySize): string {
    return `vfd-${keySize.width}-${keySize.height}`;
}
