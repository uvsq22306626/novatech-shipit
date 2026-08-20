import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',   // dossier où sont tes tests E2E
  webServer: {
    command: 'npm start',   // démarre ton serveur Express
    port: 3004,             // port où ton app écoute
    reuseExistingServer: !process.env.CI,
  },
});
