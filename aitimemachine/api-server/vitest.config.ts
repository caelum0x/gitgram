import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Run test files sequentially to avoid port conflicts
    sequence: {
      concurrent: false,
    },
    // Single-threaded to share mocked module state
    fileParallelism: false,
  },
});
