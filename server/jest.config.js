module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['./testUtils/databaseSetup.js'],
  testTimeout: 20000,
};
