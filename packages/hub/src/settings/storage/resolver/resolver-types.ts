
import type { VfdMetricTheme } from "../../resolved-settings";
import type {
    StoredGlobalSettings,
    StoredWidgetSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";

/** Inputs used to resolve stored widget settings into app-owned settings. */
export interface ResolveStoredWidgetSettingsOptions {
    readonly storedWidgetSettings: StoredWidgetSettings;
    readonly storedGlobalSettings?: StoredGlobalSettings | undefined;
    readonly runtime?: ResolveStoredSettingsRuntimeContext | undefined;
}

/** Runtime facts that can affect resolved defaults without being persisted. */
export interface ResolveStoredSettingsRuntimeContext {
    readonly isWindows?: boolean;
    readonly runtimeMaximumDownloadSpeedMegabitsPerSecond?: number | undefined;
    readonly runtimeMaximumUploadSpeedMegabitsPerSecond?: number | undefined;
    readonly runtimeMaximumDiskReadThroughputMebibytesPerSecond?: number | undefined;
    readonly runtimeMaximumDiskWriteThroughputMebibytesPerSecond?: number | undefined;
    readonly runtimeMaximumGpuPowerWatts?: number | undefined;
    /** A theme every widget wears over its own, such as the one an OpenXLR display skin calls for. */
    readonly followedTheme?: VfdMetricTheme | undefined;
}
