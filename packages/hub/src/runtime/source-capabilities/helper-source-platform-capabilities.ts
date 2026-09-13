import type { MetricSupportPlatform } from "./metric-support-platform";

/**
 * Reports whether the gRPC helper source can run on a platform.
 *
 * The helper is an independently versioned ShoMetrics-owned process that
 * speaks the MetricSourceService contract. On Windows it is the packaged
 * LibreHardwareMonitor-backed service over a named pipe; on Linux it is the
 * community helper daemon (shometrics-linux-helper) over a unix socket,
 * reading hwmon, LACT, and MangoHud.
 *
 * This is static platform capability, not a probe of whether the helper is
 * installed or running. Availability probing stays in the source client.
 *
 * Historical note: fields and identifiers named `isWindows` / `windows-helper`
 * predate Linux support and keep their names for stored-settings and contract
 * compatibility. Their meaning at the gates listed below is "helper-capable
 * platform", answered by this function.
 */
export function supportsHelperSourceOnPlatform(platform: MetricSupportPlatform): boolean {
    return platform === "win32" || platform === "linux";
}
