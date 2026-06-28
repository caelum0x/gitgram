import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the AITM MCP server package.
 *
 * Tests live under `src/__tests__` and exercise the tool/prompt/resource
 * registrars by building a real `McpServer` and inspecting its internal
 * registries — no external services are contacted. A package-local config is
 * required so vitest does not inherit the parent `aitimemachine/vitest.config.ts`
 * include glob (`tests/**`), which does not match this package's layout.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
    },
  },
});
