/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      }
    ]
  },
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  forceExit: true,
  detectOpenHandles: true,
  verbose: true
};