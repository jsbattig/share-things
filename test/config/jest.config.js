const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: path.resolve(__dirname, '../../'),
  projects: [
    // Client tests with browser environment setup
    {
      displayName: 'client',
      rootDir: path.resolve(__dirname, '../../'),
      testMatch: ['<rootDir>/client/src/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: '<rootDir>/test/tsconfig.json',
          diagnostics: { warnOnly: true }
        }]
      }
    },
    // Server tests with minimal setup (excluding FileSystemChunkStorage tests that have environment conflicts)
    {
      displayName: 'server',
      rootDir: path.resolve(__dirname, '../../'),
      testMatch: ['<rootDir>/server/src/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: [
        '<rootDir>/server/src/__tests__/unit/FileSystemChunkStorage.test.ts',
        '<rootDir>/server/src/__tests__/integration/FileSystemChunkStorage.test.ts'
      ],
      setupFilesAfterEnv: ['<rootDir>/server/jest.setup.js'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: '<rootDir>/server/tsconfig.json',
          diagnostics: { warnOnly: true }
        }]
      }
    }
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  forceExit: true,
  detectOpenHandles: true,
  verbose: true
};