import { helperMessages } from "../../i18n/message-groups/widgets";
import type { I18n } from "../../i18n/react";
import type { SourceClientStatus } from "../../runtime/sources/source-client";
import type { PropertyInspectorPlatform } from "../inspector/platform";

interface HelperStatusGuidanceOptions {
    readonly i18n: I18n;
    readonly installSubject: "catalogMetrics" | "thisMetric";
    /** Host platform; Linux gets guidance naming its own package and unit. */
    readonly platform?: PropertyInspectorPlatform;
}

/**
 * Maps helper source status to ordinary PI next-action copy.
 *
 * Keep this separate from DEBUG status labels: ordinary PI copy tells users
 * what to do next, while DEBUG compresses source state for support context.
 */
export function resolveHelperStatusGuidanceText(
    sourceStatus: SourceClientStatus | undefined,
    options: HelperStatusGuidanceOptions,
): string | undefined {
    if (sourceStatus?.state !== "unavailable") {
        return undefined;
    }

    const isLinux = options.platform === "linux";

    switch (sourceStatus.reason) {
        case "helperNotInstalled":
            return options.i18n.t(
                isLinux
                    ? helperMessages.helperNotInstalledGuidanceLinux
                    : helperMessages.helperNotInstalledGuidance,
                {
                    subject: options.i18n.t(options.installSubject === "catalogMetrics"
                        ? helperMessages.helperInstallCatalogMetrics
                        : helperMessages.helperInstallThisMetric),
                },
            );
        case "helperStopped":
            return options.i18n.t(isLinux
                ? helperMessages.helperStoppedGuidanceLinux
                : helperMessages.helperStoppedGuidance);
        case "protocolMismatch":
            return options.i18n.t(isLinux
                ? helperMessages.helperProtocolMismatchGuidanceLinux
                : helperMessages.helperProtocolMismatchGuidance);
        default:
            return options.i18n.t(isLinux
                ? helperMessages.helperDiagnosticsGuidanceLinux
                : helperMessages.helperDiagnosticsGuidance);
    }
}
