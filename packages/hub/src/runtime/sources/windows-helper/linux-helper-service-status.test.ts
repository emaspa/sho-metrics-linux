import assert from "node:assert/strict";
import { test } from "vitest";
import {
    LINUX_HELPER_SERVICE_UNIT,
    createDefaultHelperServiceStatusReader,
    createLinuxHelperServiceStatusReader,
    parseSystemdUnitStatus,
} from "./linux-helper-service-status";
import type { WindowsHelperServiceStatusReader } from "./windows-helper-service-status";

test("systemd unit status maps active to running", () => {
    assert.equal(
        parseSystemdUnitStatus("LoadState=loaded\nActiveState=active\n"),
        "running",
    );
});

test("systemd unit status maps not-found to notInstalled", () => {
    assert.equal(
        parseSystemdUnitStatus("LoadState=not-found\nActiveState=inactive\n"),
        "notInstalled",
    );
});

test("systemd unit status maps loaded but inactive to installedStopped", () => {
    assert.equal(
        parseSystemdUnitStatus("LoadState=loaded\nActiveState=inactive\n"),
        "installedStopped",
    );
    assert.equal(
        parseSystemdUnitStatus("LoadState=loaded\nActiveState=failed\n"),
        "installedStopped",
    );
    assert.equal(
        parseSystemdUnitStatus("LoadState=loaded\nActiveState=activating\n"),
        "installedStopped",
    );
});

test("systemd unit status maps unreadable output to unknown", () => {
    assert.equal(parseSystemdUnitStatus(""), "unknown");
    assert.equal(parseSystemdUnitStatus("garbage"), "unknown");
});

test("linux helper status reader queries the user systemd instance", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const reader = createLinuxHelperServiceStatusReader(
        LINUX_HELPER_SERVICE_UNIT,
        async (command: string, args: readonly string[]) => {
            calls.push({ command, args });
            return {
                stdout: "LoadState=loaded\nActiveState=active\n",
                stderr: "",
            };
        },
    );

    assert.equal(await reader.readStatus(), "running");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "systemctl");
    assert.deepEqual(calls[0]?.args, [
        "--user",
        "show",
        LINUX_HELPER_SERVICE_UNIT,
        "--property=LoadState,ActiveState",
    ]);
});

test("linux helper status reader falls back to error stdout", async () => {
    // Older systemd exits non-zero for unknown units but still prints the
    // properties, so the not-installed answer must survive the rejection.
    const reader = createLinuxHelperServiceStatusReader(
        LINUX_HELPER_SERVICE_UNIT,
        async () => {
            const error = new Error("Command failed") as Error & { stdout?: string };
            error.stdout = "LoadState=not-found\nActiveState=inactive\n";
            throw error;
        },
    );

    assert.equal(await reader.readStatus(), "notInstalled");
});

test("linux helper status reader reports unknown when the probe fails", async () => {
    const reader = createLinuxHelperServiceStatusReader(
        LINUX_HELPER_SERVICE_UNIT,
        async () => {
            throw new Error("spawn systemctl ENOENT");
        },
    );

    assert.equal(await reader.readStatus(), "unknown");
});

test("default helper status reader passes through the Windows reader off Linux", () => {
    const windowsReader: WindowsHelperServiceStatusReader = {
        readStatus: async () => "running",
    };

    assert.equal(createDefaultHelperServiceStatusReader("win32", windowsReader), windowsReader);
    assert.equal(createDefaultHelperServiceStatusReader("darwin", windowsReader), windowsReader);
    assert.notEqual(createDefaultHelperServiceStatusReader("linux", windowsReader), windowsReader);
});
