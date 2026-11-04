module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
