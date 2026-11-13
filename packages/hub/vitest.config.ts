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
        // Widgets follow OpenXLR's skin; tests run as if OpenXLR were not
        // installed, whatever the machine running them has.
        env: {
            OPENXLR_SKIN: "",
            XDG_CONFIG_HOME: "test-results/no-openxlr/config",
            XDG_DATA_HOME: "test-results/no-openxlr/data",
            XDG_DATA_DIRS: "test-results/no-openxlr/data-dirs",
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
