import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Some tests fan out many concurrent supertest requests (each spins up an
    // ephemeral server). On a loaded single-threaded worker near the end of a
    // long run, that fan-out can exceed 15s without anything being wrong. Give
    // tests headroom so environmental slowness doesn't produce false failures.
    testTimeout: 30000,
    // The app's module graph (~150 TS files) is transform-compiled lazily on
    // the first createTestApp() call. A cold transform can exceed 15s, which
    // would spuriously time out the beforeAll hook that imports the app. Give
    // hooks extra headroom so the one-time cold import never fails the suite.
    hookTimeout: 60000,
    // Run test files sequentially to avoid port conflicts
    sequence: {
      concurrent: false,
    },
    // Single-threaded to share mocked module state
    fileParallelism: false,
  },
});
