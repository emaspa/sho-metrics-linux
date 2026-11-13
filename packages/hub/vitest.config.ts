import { defineConfig } from "vitest/config";

export default defineConfig({
    esbuild: {
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
            },
        },
    },
    test: {
        coverage: {
            exclude: [
                "src/**/*.test.ts",
                "src/**/*.pi.test.tsx",
                "src/**/*.type-test.ts",
                "src/**/*.d.ts",
                "src/generated/**",
                "src/property-inspector/testing/**",
            ],
            include: [
                "src/**/*.ts",
                "src/**/*.tsx",
            ],
            provider: "v8",
        },
        environment: "node",
        // Widgets follow an OpenXLR display skin; tests must not depend on
        // the skin the machine running them wears.
        env: {
            OPENXLR_SKIN: "broadcast",
        },
        exclude: [
            "node_modules/**",
            "src/**/*.pi.test.tsx",
        ],
        fileParallelism: false,
        include: [
            "src/**/*.test.ts",
        ],
        isolate: false,
        pool: "threads",
    },
});
