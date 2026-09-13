import assert from "node:assert/strict";
import { test } from "vitest";
import { formatMessage } from "../../i18n/format";
import type { I18n } from "../../i18n/react";
import type { SourceClientStatus } from "../../runtime/sources/source-client";
import { resolveHelperStatusGuidanceText } from "./helper-status-guidance";

const testI18n: I18n = {
    locale: "en",
    t: (message, values) => formatMessage("en", message, values),
    rich: () => null,
};

function unavailable(reason: string): SourceClientStatus {
    return { state: "unavailable", reason: reason as SourceClientStatus["reason"] };
}

test("helper guidance names the Linux package, unit, and journal on Linux", () => {
    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("helperNotInstalled"), {
            i18n: testI18n,
            installSubject: "catalogMetrics",
            platform: "linux",
        }),
        "Install the sho-metrics-source-linux helper package to use advanced sensors.",
    );
    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("helperStopped"), {
            i18n: testI18n,
            installSubject: "thisMetric",
            platform: "linux",
        }),
        "Start the helper: systemctl --user start shometrics-linux-helper.service",
    );
    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("protocolMismatch"), {
            i18n: testI18n,
            installSubject: "thisMetric",
            platform: "linux",
        }),
        "Update sho-metrics-source-linux and the plugin to the latest versions.",
    );
    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("pipeMissing"), {
            i18n: testI18n,
            installSubject: "thisMetric",
            platform: "linux",
        }),
        "Check helper logs: journalctl --user -u shometrics-linux-helper",
    );
});

test("helper guidance keeps the Windows copy on Windows and by default", () => {
    const windowsText = "Install ShoMetrics Helper to use advanced sensors.";
    const options = { i18n: testI18n, installSubject: "catalogMetrics" } as const;

    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("helperNotInstalled"), { ...options, platform: "win32" }),
        windowsText,
    );
    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("helperNotInstalled"), options),
        windowsText,
    );
    assert.equal(
        resolveHelperStatusGuidanceText(unavailable("helperStopped"), { ...options, platform: "win32" }),
        "Start ShoMetrics Helper from ShoMetrics Control Panel.",
    );
});

test("helper guidance stays silent for states that are not unavailable", () => {
    assert.equal(
        resolveHelperStatusGuidanceText({ state: "available" }, {
            i18n: testI18n,
            installSubject: "catalogMetrics",
            platform: "linux",
        }),
        undefined,
    );
    assert.equal(
        resolveHelperStatusGuidanceText(undefined, {
            i18n: testI18n,
            installSubject: "catalogMetrics",
            platform: "linux",
        }),
        undefined,
    );
});
