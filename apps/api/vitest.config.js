const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    setupFiles: ['./tests/setup/test-env.js'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
