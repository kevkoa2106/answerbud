import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js',
  use: { baseURL: 'http://127.0.0.1:8877' },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } }
  ],
  webServer: { command: 'node scripts/test-server.mjs', port: 8877 }
});
