import assert from "node:assert/strict";
import { test } from "vitest";
import { supportsHelperSourceOnPlatform } from "./helper-source-platform-capabilities";

test("helper source is supported on Windows and Linux only", () => {
    assert.equal(supportsHelperSourceOnPlatform("win32"), true);
    assert.equal(supportsHelperSourceOnPlatform("linux"), true);
    assert.equal(supportsHelperSourceOnPlatform("darwin"), false);
    assert.equal(supportsHelperSourceOnPlatform("other"), false);
    assert.equal(supportsHelperSourceOnPlatform("freebsd"), false);
});
