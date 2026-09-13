import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../logging/node-logger";
import type {
    WindowsHelperServiceStatus,
    WindowsHelperServiceStatusReader,
} from "./windows-helper-service-status";

const log = logger.for("Source:WindowsHelper");
const execFileAsync = promisify(execFile);

/**
 * systemd user unit of the Linux helper daemon.
 *
 * Installed by shometrics-linux-helper as `~/.config/systemd/user/`
 * `shometrics-linux-helper.service`.
 */
export const LINUX_HELPER_SERVICE_UNIT = "shometrics-linux-helper.service";

/** Minimal command-probe seam over `execFile` for tests. */
export interface SystemdStatusProbe {
    (command: string, args: readonly string[]): Promise<{ stdout: string }>;
}

const systemdStatusProbe: SystemdStatusProbe = (command, args) => execFileAsync(command, [...args]);

/**
 * Reads Linux helper daemon status from the user's systemd instance.
 *
 * Same contract as the Windows reader: answer from the service manager
 * without touching the gRPC socket, so "not installed", "installed but
 * stopped", and "running" stay distinguishable for PI guidance copy.
 */
export function createLinuxHelperServiceStatusReader(
    unitName: string = LINUX_HELPER_SERVICE_UNIT,
    probe: SystemdStatusProbe = systemdStatusProbe,
): WindowsHelperServiceStatusReader {
    return {
        async readStatus(): Promise<WindowsHelperServiceStatus> {
            let stdout: string;
            try {
                // `systemctl --user show` exits non-zero for unknown units on
                // some systemd versions, so read the error's stdout too.
                const result = await probe(
                    "systemctl",
                    ["--user", "show", unitName, "--property=LoadState,ActiveState"],
                );
                stdout = result.stdout;
            } catch (error) {
                const errorStdout = readErrorStdout(error);
                if (errorStdout === undefined) {
                    log.atWarn()
                        .everyMs("linux-service-status-query-failed", 30000)
                        .log(() => `Linux helper service status query failed: ${String(error)}`);
                    return "unknown";
                }
                stdout = errorStdout;
            }

            return parseSystemdUnitStatus(stdout);
        },
    };
}

/** Maps `systemctl show` LoadState/ActiveState output onto helper status. */
export function parseSystemdUnitStatus(stdout: string): WindowsHelperServiceStatus {
    const properties = new Map<string, string>();
    for (const line of stdout.split("\n")) {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex > 0) {
            properties.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1).trim());
        }
    }

    if (properties.get("LoadState") === "not-found") {
        return "notInstalled";
    }

    if (properties.get("ActiveState") === "active") {
        return "running";
    }

    if (properties.has("LoadState")) {
        // Unit file exists but the daemon is inactive, activating, or failed.
        return "installedStopped";
    }

    return "unknown";
}

/** Selects the packaged default helper service status reader for a platform. */
export function createDefaultHelperServiceStatusReader(
    platform: NodeJS.Platform,
    windowsReader: WindowsHelperServiceStatusReader,
): WindowsHelperServiceStatusReader {
    return platform === "linux"
        ? createLinuxHelperServiceStatusReader()
        : windowsReader;
}

function readErrorStdout(error: unknown): string | undefined {
    const stdout = typeof error === "object" && error !== null && "stdout" in error
        ? (error as { stdout?: unknown }).stdout
        : undefined;

    return typeof stdout === "string" && stdout.includes("=") ? stdout : undefined;
}
