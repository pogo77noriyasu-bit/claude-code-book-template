// Playwright の設定。リポジトリのルートを静的配信して /games/donkeypunk/ を開く
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8137/games/donkeypunk/',
    browserName: 'chromium',
    viewport: { width: 900, height: 900 },
    launchOptions: { args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npx http-server ../.. -p 8137 -c-1 -s',
    url: 'http://127.0.0.1:8137/games/donkeypunk/',
    reuseExistingServer: true,
  },
});
