module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/apps'],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.test.ts',
    '**/?(*.)(spec|test).(js|ts)'
  ],
  collectCoverageFrom: [
    'apps/**/*.{js,ts}',
    '!apps/**/node_modules/**',
    '!apps/**/*.config.js',
    '!apps/**/*.test.{js,ts}',
    '!apps/**/build/**',
    '!apps/**/dist/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testTimeout: 30000,
  verbose: true
};