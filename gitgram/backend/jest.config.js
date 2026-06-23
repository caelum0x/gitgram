module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
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

