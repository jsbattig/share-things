import { PlaywrightTestConfig, devices } from '@playwright/test';
import path from 'path';

const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  workers: 1,
  reporter: [
    ['html', { outputFolder: '../../../playwright-report' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ],
  outputDir: '../../../test-results',
  // Comment out the webServer config for now as we'll start the servers manually
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000
  // }
};

export default config;