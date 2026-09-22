import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './test/visual', use: { browserName: 'chromium' } });
