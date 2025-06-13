/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Basic configuration
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000, // Global test timeout (30 seconds)
  
  // Module resolution - NO SQLITE MOCK for integration tests
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^\\.\/database$': '<rootDir>/src/__mocks__/database',
    '^.*FileSystemChunkStorage$': '<rootDir>/src/__mocks__/FileSystemChunkStorage',
    '\\.(bin|data|wasm)$': '<rootDir>/src/__mocks__/fileMock.js',
    '^../../../../test/mocks/crypto-js$': '<rootDir>/../shared/__mocks__/crypto-js',
    '^../../../client/src/utils/(.*)$': '<rootDir>/../client/src/utils/$1',
    // Try container path first, then local path
    '^../../../shared/crypto/(.*)$': ['<rootDir>/shared/crypto/$1', '<rootDir>/../shared/crypto/$1'],
    '^crypto-js$': '<rootDir>/../shared/__mocks__/crypto-js',
    // NOTE: NO sqlite3 mock mapping for integration tests - use real SQLite
  },
  
  // Transform settings
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  
  // File extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Ignore patterns
  transformIgnorePatterns: [
    '/node_modules/(?!(chalk|ansi-styles|strip-ansi|ansi-regex|supports-color)/)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Mock handling
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  resetModules: false, // Don't reset modules for integration tests
  
  // Test matching - ONLY integration tests
  testMatch: ['**/__tests__/integration/*.test.ts'],
  
  // Coverage
  collectCoverage: false, // Disable coverage for integration tests
  
  // Node.js options for memory management
  maxWorkers: 1, // Use single worker to avoid memory conflicts
  workerIdleMemoryLimit: '512MB',
};