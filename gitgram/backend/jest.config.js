module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // The end-to-end suite (tests/e2e/*.e2e.test.ts) runs the REAL Express app
  // against a REAL Postgres + Redis and has its own config (jest.e2e.config.js,
  // run via `npm run test:e2e`). Excluding it here keeps the default unit /
  // integration run deterministic — it must not require Docker datastores and
  // must not collide on ports when run in parallel.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/e2e/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@trpc/server(.*)$': '<rootDir>/tests/__mocks__/@trpc/server$1',
    '^../trpc/adapter$': '<rootDir>/tests/__mocks__/trpcAdapter',
    '^../../trpc/adapter$': '<rootDir>/tests/__mocks__/trpcAdapter',
    '^./trpc/adapter$': '<rootDir>/tests/__mocks__/trpcAdapter',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};

