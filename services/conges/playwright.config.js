const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm start',
    port: 3003,
    reuseExistingServer: !process.env.CI
  }
})