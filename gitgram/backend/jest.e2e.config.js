/**
 * Jest configuration for the END-TO-END suite.
 *
 * Unlike the default jest.config.js (which mocks Prisma, Redis, and external
 * services via tests/setup.ts), this config runs the REAL Express app against
 * a REAL PostgreSQL + Redis. It exercises full user flows over HTTP using
 * supertest, catching cross-service regressions and route-wiring breaks that
 * the mocked unit/integration suite cannot.
 *
 * Required services (provision via docker-compose.test.yml or CI services):
 *   - PostgreSQL reachable at DATABASE_URL
 *   - Redis reachable at REDIS_URL (optional but recommended for full coverage)
 *
 * Run with:  npm run test:e2e
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  // E2E flows touch the network and database — give them room and run serially
  // so suites share a clean, deterministic database state.
  testTimeout: 60000,
  maxWorkers: 1,
  globalSetup: '<rootDir>/tests/e2e/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/e2e/globalTeardown.ts',
  // Runs inside each worker before the app module graph loads.
  setupFiles: ['<rootDir>/tests/e2e/setupEnv.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // @octokit/* ships as native ESM which Jest's CommonJS runtime cannot load.
    // The real GitHub API is never called in E2E (no token configured), so map
    // octokit to a lightweight stub that satisfies the import without ESM.
    '^@octokit/rest$': '<rootDir>/tests/e2e/__stubs__/octokit.ts',
  },
};
