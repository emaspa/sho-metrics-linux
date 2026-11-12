import assert from "node:assert/strict";
import { test } from "vitest";
import { vfdAmberStyle } from "./vfd-amber";

const PAINTS = { background: "#090503", backgroundFill: undefined, surface: "#ff9634" };

function transform(bodySvg: string): string {
    assert.ok(vfdAmberStyle.transformBody);
    return vfdAmberStyle.transformBody(bodySvg, PAINTS);
}

test("lit seven-segment readings get an unlit 88 copy underneath", () => {
    const reading = `<text id="value" x="72" y="84" dominant-baseline="middle"><tspan font-family="'DSEG7 Classic'" fill="#ff9634" filter="url(#vfd-value-glow)">-4.5</tspan><tspan dx="4" font-family="'DSEG14 Classic'" fill="#ff9634">%</tspan></text>`;

    assert.equal(
        transform(reading),
        `<text fill="none" x="72" y="84" dominant-baseline="middle"><tspan fill="#281308" font-family="'DSEG7 Classic'">88.8</tspan><tspan fill="none" dx="4" font-family="'DSEG14 Classic'">%</tspan></text>${reading}`,
    );
});

test("dark bar numbers, headings, and other faces stay as they are", () => {
    const darkBarNumber = `<text x="1" y="2" font-family="'DSEG7 Classic'" fill="#111827">20</text>`;
    const heading = `<text x="1" y="2" font-family="'DSEG14 Classic'" fill="#ff9634">CPU</text>`;
    const inter = `<text x="1" y="2" font-family="'Inter'" fill="#ffffff">40</text>`;

    assert.equal(transform(darkBarNumber), darkBarNumber);
    assert.equal(transform(heading), heading);
    assert.equal(transform(inter), inter);
});
