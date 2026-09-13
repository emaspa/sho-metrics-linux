import assert from "node:assert/strict";
import { test } from "vitest";
import {
    DEFAULT_LINUX_HELPER_SOCKET_DIRECTORY,
    DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME,
    buildHelperGrpcTargetForPlatform,
    buildLinuxHelperSocketGrpcTarget,
    buildWindowsNamedPipeGrpcTarget,
} from "./windows-helper-grpc-transport";

test("windows helper target is the named pipe grpc form", () => {
    assert.equal(
        buildWindowsNamedPipeGrpcTarget("ShoMetrics.Source.Windows.Grpc.v1"),
        "unix:\\\\.\\pipe\\ShoMetrics.Source.Windows.Grpc.v1",
    );
});

test("linux helper target is the unix socket grpc form", () => {
    assert.equal(
        buildLinuxHelperSocketGrpcTarget(DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME),
        `unix://${DEFAULT_LINUX_HELPER_SOCKET_DIRECTORY}/${DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME}`,
    );
});

test("helper target selects the endpoint form by platform", () => {
    assert.equal(
        buildHelperGrpcTargetForPlatform("Endpoint.v1", "win32"),
        buildWindowsNamedPipeGrpcTarget("Endpoint.v1"),
    );
    assert.equal(
        buildHelperGrpcTargetForPlatform("Endpoint.v1", "linux"),
        buildLinuxHelperSocketGrpcTarget("Endpoint.v1"),
    );
    assert.equal(
        buildHelperGrpcTargetForPlatform("Endpoint.v1", "darwin"),
        buildWindowsNamedPipeGrpcTarget("Endpoint.v1"),
    );
});
