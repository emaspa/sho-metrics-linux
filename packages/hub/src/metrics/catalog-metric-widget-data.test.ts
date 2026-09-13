import assert from "node:assert/strict";
import { test } from "vitest";
import { MetricUnit } from "../runtime/sources/metric-source";
import type { WidgetData } from "../view-rendering/widget-data";
import {
    buildCatalogMetricScaledWidgetData,
    formatCatalogMetricFreshWidgetData,
} from "./catalog-metric-widget-data";

test("catalog metric widget data formats hertz values across display ranges", () => {
    assertFormattedHertz(800, "800", "Hz");
    assertFormattedHertz(50_000, "50", "KHz");
    assertFormattedHertz(3_600_000, "3.6", "MHz");
    assertFormattedHertz(500_000_000, "500", "MHz");
    assertFormattedHertz(3_600_000_000, "3.6", "GHz");
});

test("catalog metric widget data formats electrical units with one decimal", () => {
    assertFormattedElectrical(MetricUnit.AMPERES, 8.94, "8.9", "A");
    assertFormattedElectrical(MetricUnit.VOLTS, 12.16, "12.2", "V");
    assertFormattedElectrical(MetricUnit.WATTS, 42, "42.0", "W");
});

test("catalog metric widget data leaves other units unchanged", () => {
    const widgetData = buildWidgetData({
        current: 1200,
        unit: "RPM",
        displayValue: "1200",
    });

    assert.equal(formatCatalogMetricFreshWidgetData({
        widgetData,
        unit: MetricUnit.REVOLUTIONS_PER_MINUTE,
        category: "other",
    }), widgetData);
});

test("catalog metric fixed scale leaves negative readings on the zero baseline", () => {
    const widgetData = buildCatalogMetricScaledWidgetData({
        widgetData: buildWidgetData({ current: -12, history: [-12.2, -11.8] }),
        maximumValue: 20,
    });

    assert.equal(widgetData.current, -12);
    assert.deepEqual(widgetData.history, [-12.2, -11.8]);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 20,
    });
});

function assertFormattedElectrical(
    unit: MetricUnit,
    current: number,
    displayValue: string,
    unitText: string,
): void {
    const widgetData = formatCatalogMetricFreshWidgetData({
        widgetData: buildWidgetData({ current }),
        unit,
        category: "other",
    });

    assert.equal(widgetData.current, current);
    assert.equal(widgetData.displayValue, displayValue);
    assert.equal(widgetData.unit, unitText);
}

function assertFormattedHertz(current: number, displayValue: string, unit: string): void {
    const widgetData = formatCatalogMetricFreshWidgetData({
        widgetData: buildWidgetData({ current }),
        unit: MetricUnit.HERTZ,
        category: "cpu",
    });

    assert.equal(widgetData.current, current);
    assert.equal(widgetData.displayValue, displayValue);
    assert.equal(widgetData.unit, unit);
}

function buildWidgetData(options: Partial<WidgetData>): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        label: options.label ?? "Metric",
        unit: options.unit ?? "Hz",
        displayValue: options.displayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}
