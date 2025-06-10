module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Map shared crypto imports to use our mock
    '^../shared/crypto$': '<rootDir>/src/__mocks__/shared-crypto.ts',
    '^../shared/crypto/(.*)$': '<rootDir>/src/__mocks__/shared-crypto.ts',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  coverageReporters: ['text', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/src/setupTests.ts',
  ],
  testMatch: [
    '**/__tests__/**/*.test.(ts|tsx)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Set NODE_ENV to test for crypto environment detection
  globals: {
    'process.env.NODE_ENV': 'test'
  },
};