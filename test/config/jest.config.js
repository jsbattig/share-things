module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  rootDir: '../../',
  testMatch: [
    '**/client/src/__tests__/**/*.test.ts',
    '**/server/src/__tests__/**/*.test.ts',
    '**/test/e2e/**/*.test.ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/test/tsconfig.json',
      diagnostics: {
        warnOnly: true
      }
    }]
  },
  forceExit: true,
  detectOpenHandles: true,
  verbose: true
};