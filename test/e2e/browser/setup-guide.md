# E2E Browser Testing Setup Guide

This guide explains how to set up and configure the environment for running end-to-end browser tests for the ShareThings application.

## Prerequisites

Before setting up the E2E browser tests, ensure you have:

1. Node.js (v16 or later)
2. npm (v7 or later)
3. The ShareThings application code

## Installation Steps

### 1. Install Required Dependencies

Add the following dependencies to your project:

```bash
npm install --save-dev @playwright/test wait-on concurrently cross-env
```

### 2. Install Playwright Browsers

```bash
npx playwright install
```

This will install the browser binaries needed for testing (Chromium, Firefox, and WebKit).

### 3. Update package.json

Add the following scripts to your package.json file:

```json
{
  "scripts": {
    "test:e2e:browser": "playwright test --config=test/e2e/browser/playwright.config.ts",
    "test:e2e:browser:ui": "playwright test --config=test/e2e/browser/playwright.config.ts --ui",
    "test:e2e:browser:debug": "playwright test --config=test/e2e/browser/playwright.config.ts --debug",
    "test:e2e:browser:report": "playwright show-report"
  }
}
```

### 4. Create Directory Structure

Create the following directory structure:

```
test/
  e2e/
    browser/
      fixtures/         # Test files (images, documents)
      helpers/          # Helper functions
      tests/            # Test files
      playwright.config.ts  # Playwright configuration
```

### 5. Create Test Fixtures

Create the following test fixtures:

1. A test image:

```bash
# Copy a sample image to the fixtures directory
cp path/to/sample-image.png test/e2e/browser/fixtures/test-image.png
```

2. A test document:

```bash
# Create a sample PDF document
echo "Test document content" > test/e2e/browser/fixtures/test-document.txt
```

3. A large test file:

```bash
# Create a large test file (10MB)
dd if=/dev/zero of=test/e2e/browser/fixtures/large-file.bin bs=1M count=10
```

## Configuration Files

### 1. Playwright Configuration

Create a `playwright.config.ts` file in the `test/e2e/browser` directory:

```typescript
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
    baseURL: 'http://localhost:5173',
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
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' }
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' }
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5']
      }
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12']
      }
    }
  ],
  outputDir: '../../../test-results',
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
};

export default config;
```

### 2. tsconfig.json for Tests

Create a `tsconfig.json` file in the `test/e2e/browser` directory:

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "sourceMap": true,
    "outDir": "../../../dist/test",
    "baseUrl": ".",
    "paths": {
      "@/*": ["../../../*"]
    },
    "types": ["node", "@playwright/test"]
  },
  "include": ["**/*.ts"]
}
```

## Running Tests

### 1. Run All Tests

```bash
npm run test:e2e:browser
```

### 2. Run Tests with UI

```bash
npm run test:e2e:browser:ui
```

### 3. Run Tests in Debug Mode

```bash
npm run test:e2e:browser:debug
```

### 4. Run Specific Tests

```bash
# Run tests matching a specific title
npm run test:e2e:browser -- --grep "text sharing"

# Run tests in a specific file
npm run test:e2e:browser -- tests/sharing.test.ts
```

### 5. Run Tests on Specific Browsers

```bash
# Run tests only on Chrome
npm run test:e2e:browser -- --project=chromium

# Run tests only on mobile browsers
npm run test:e2e:browser -- --project=mobile-chrome --project=mobile-safari
```

### 6. View Test Report

```bash
npm run test:e2e:browser:report
```

## Continuous Integration

For CI environments, you'll want to run tests in headless mode. Create a CI-specific script in package.json:

```json
{
  "scripts": {
    "test:e2e:browser:ci": "cross-env CI=true playwright test --config=test/e2e/browser/playwright.config.ts --headless"
  }
}
```

### GitHub Actions Example

Here's an example GitHub Actions workflow for running the E2E browser tests:

```yaml
name: E2E Browser Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16.x'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: Run E2E browser tests
        run: npm run test:e2e:browser:ci
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

## Troubleshooting

### Common Issues

1. **Tests are flaky or timing out**
   - Increase timeouts in the Playwright config
   - Add retry logic for flaky operations
   - Use more reliable selectors

2. **Browser doesn't start**
   - Ensure Playwright browsers are installed
   - Check for conflicting processes using the same ports
   - Try running with `--headless` flag

3. **Cannot interact with elements**
   - Ensure elements are visible and not covered by other elements
   - Use `waitForSelector` before interacting with elements
   - Check if elements are in the viewport

4. **Authentication issues**
   - Ensure cookies and storage state are properly set up
   - Check if sessions expire during tests
   - Use programmatic authentication instead of UI-based login

### Debugging Tips

1. **Use Visual Debugging**
   - Run tests with `--debug` flag
   - Use `page.pause()` to pause execution at specific points
   - Take screenshots with `await page.screenshot({ path: 'screenshot.png' })`

2. **Check Console Logs**
   - Enable browser console logging with:
     ```typescript
     page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
     ```

3. **Inspect Network Traffic**
   - Monitor network requests with:
     ```typescript
     page.on('request', request => console.log(`>> ${request.method()} ${request.url()}`));
     page.on('response', response => console.log(`<< ${response.status()} ${response.url()}`));
     ```

4. **Use Traces**
   - Enable tracing in the config
   - View traces with `npx playwright show-trace trace.zip`

## Best Practices

1. **Keep tests independent**
   - Each test should be self-contained
   - Don't rely on state from previous tests

2. **Use page objects**
   - Create page object classes to encapsulate page-specific logic
   - Reuse common interactions across tests

3. **Handle asynchronous operations properly**
   - Use `await` for all asynchronous operations
   - Use proper waiting mechanisms (waitForSelector, waitForEvent, etc.)

4. **Clean up resources**
   - Close pages and contexts after tests
   - Clean up any created files or data

5. **Use descriptive test names**
   - Name tests based on what they're testing, not how they're testing it
   - Use the AAA pattern (Arrange, Act, Assert) in test structure

6. **Minimize test duplication**
   - Use helper functions for common operations
   - Use test fixtures for common setup and teardown

7. **Run tests in parallel when possible**
   - Configure workers in the Playwright config
   - Ensure tests are truly independent

8. **Handle flakiness**
   - Add retries for flaky tests
   - Use more reliable selectors and waiting mechanisms
   - Add logging to help debug flaky tests