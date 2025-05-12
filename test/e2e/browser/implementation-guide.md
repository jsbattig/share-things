# E2E Browser Testing Implementation Guide

This document provides implementation details for the E2E browser testing framework.

## Directory Structure

```
test/
  e2e/
    browser/
      fixtures/         # Test files (images, documents)
      helpers/          # Helper functions
        app-launcher.ts # Handles starting/stopping applications
        browser-utils.ts # Browser interaction utilities
      tests/
        sharing.test.ts # Tests for content sharing
        session.test.ts # Tests for session management
      playwright.config.ts # Playwright configuration
```

## Implementation Details

### 1. app-launcher.ts

This file handles starting and stopping the server and client applications:

```typescript
// app-launcher.ts
import { spawn, ChildProcess } from 'child_process';
import waitOn from 'wait-on';

export class AppLauncher {
  private serverProcess: ChildProcess | null = null;
  private clientProcess: ChildProcess | null = null;
  private serverLogs: string[] = [];
  private clientLogs: string[] = [];

  /**
   * Start both server and client applications
   */
  async startApplications(): Promise<void> {
    console.log('Starting applications...');
    
    // Start server
    this.serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: './server',
      stdio: 'pipe',
      shell: true
    });

    // Capture server logs
    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.on('data', (data) => {
        const log = data.toString();
        this.serverLogs.push(log);
        console.log(`[SERVER] ${log}`);
      });
    }

    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        const log = data.toString();
        this.serverLogs.push(log);
        console.error(`[SERVER ERROR] ${log}`);
      });
    }

    // Start client
    this.clientProcess = spawn('npm', ['run', 'dev'], {
      cwd: './client',
      stdio: 'pipe',
      shell: true
    });

    // Capture client logs
    if (this.clientProcess.stdout) {
      this.clientProcess.stdout.on('data', (data) => {
        const log = data.toString();
        this.clientLogs.push(log);
        console.log(`[CLIENT] ${log}`);
      });
    }

    if (this.clientProcess.stderr) {
      this.clientProcess.stderr.on('data', (data) => {
        const log = data.toString();
        this.clientLogs.push(log);
        console.error(`[CLIENT ERROR] ${log}`);
      });
    }

    // Wait for applications to be ready
    try {
      await waitOn({
        resources: [
          'http://localhost:3001', // Server API
          'http://localhost:5173'  // Vite dev server
        ],
        timeout: 60000, // 60 seconds timeout
        interval: 1000  // Check every second
      });
      
      console.log('Applications started successfully');
    } catch (error) {
      console.error('Error waiting for applications to start:', error);
      
      // Print logs to help with debugging
      console.log('Server logs:', this.serverLogs.join('\n'));
      console.log('Client logs:', this.clientLogs.join('\n'));
      
      // Clean up processes
      await this.stopApplications();
      
      throw new Error('Failed to start applications');
    }
  }

  /**
   * Stop both server and client applications
   */
  async stopApplications(): Promise<void> {
    console.log('Stopping applications...');
    
    // Stop client
    if (this.clientProcess) {
      this.clientProcess.kill('SIGTERM');
      this.clientProcess = null;
    }

    // Stop server
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }

    // Wait a bit to ensure processes are terminated
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Applications stopped successfully');
  }

  /**
   * Get server logs
   */
  getServerLogs(): string[] {
    return this.serverLogs;
  }

  /**
   * Get client logs
   */
  getClientLogs(): string[] {
    return this.clientLogs;
  }
}
```

### 2. browser-utils.ts

This file provides helper functions for browser interactions:

```typescript
// browser-utils.ts
import { Page } from '@playwright/test';

/**
 * Create a new sharing session
 * @param page Playwright page
 * @returns Session information (sessionId:passphrase)
 */
export async function createSession(page: Page): Promise<string> {
  // Navigate to home page if not already there
  if (!page.url().includes('localhost:5173')) {
    await page.goto('http://localhost:5173');
  }
  
  // Click the create session button
  await page.click('button:has-text("Create Session")');
  
  // Wait for session to be created
  await page.waitForSelector('.session-info');
  
  // Get session ID and passphrase
  const sessionId = await page.innerText('.session-id');
  const passphrase = await page.innerText('.passphrase');
  
  console.log(`Created session: ${sessionId} with passphrase: ${passphrase}`);
  
  return `${sessionId}:${passphrase}`;
}

/**
 * Join an existing session
 * @param page Playwright page
 * @param sessionInfo Session information (sessionId:passphrase)
 */
export async function joinSession(page: Page, sessionInfo: string): Promise<void> {
  // Navigate to home page if not already there
  if (!page.url().includes('localhost:5173')) {
    await page.goto('http://localhost:5173');
  }
  
  // Parse session info
  const [sessionId, passphrase] = sessionInfo.split(':');
  
  // Fill in session ID and passphrase
  await page.fill('input[placeholder="Session ID"]', sessionId);
  await page.fill('input[placeholder="Passphrase"]', passphrase);
  
  // Click join button
  await page.click('button:has-text("Join Session")');
  
  // Wait for session to be joined
  await page.waitForSelector('.session-connected');
  
  console.log(`Joined session: ${sessionId}`);
}

/**
 * Share text content
 * @param page Playwright page
 * @param text Text to share
 */
export async function shareText(page: Page, text: string): Promise<void> {
  // Click text sharing button
  await page.click('button:has-text("Share Text")');
  
  // Fill in text
  await page.fill('.text-input', text);
  
  // Click send button
  await page.click('button:has-text("Send")');
  
  console.log(`Shared text: ${text}`);
}

/**
 * Share an image
 * @param page Playwright page
 * @param imagePath Path to image file
 */
export async function shareImage(page: Page, imagePath: string): Promise<void> {
  // Set up file chooser handler
  const fileChooserPromise = page.waitForEvent('filechooser');
  
  // Click image sharing button
  await page.click('button:has-text("Share Image")');
  
  // Get file chooser
  const fileChooser = await fileChooserPromise;
  
  // Select file
  await fileChooser.setFiles(imagePath);
  
  // Click send button
  await page.click('button:has-text("Send")');
  
  console.log(`Shared image: ${imagePath}`);
}

/**
 * Wait for content to appear
 * @param page Playwright page
 * @param contentType Type of content to wait for
 * @returns Content text or null
 */
export async function waitForContent(page: Page, contentType: string): Promise<string | null> {
  // Wait for content to appear
  await page.waitForSelector(`.content-item.${contentType}`, { timeout: 10000 });
  
  // Get content text
  const contentText = await page.innerText(`.content-item.${contentType} .content-data`);
  
  console.log(`Received ${contentType} content: ${contentText}`);
  
  return contentText;
}
```

### 3. playwright.config.ts

This file configures Playwright:

```typescript
// playwright.config.ts
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 60000, // 60 seconds timeout
  retries: 1,     // Retry failed tests once
  workers: 1,     // Run tests sequentially
  use: {
    headless: false, // Show browser for debugging
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    trace: 'on-first-retry',
    video: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ]
};

export default config;
```

### 4. sharing.test.ts

This file contains tests for content sharing:

```typescript
// sharing.test.ts
import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';
import { createSession, joinSession, shareText, shareImage, waitForContent } from '../helpers/browser-utils';
import path from 'path';

// Setup and teardown for all tests
let appLauncher: AppLauncher;

test.beforeAll(async () => {
  // Start applications
  appLauncher = new AppLauncher();
  await appLauncher.startApplications();
});

test.afterAll(async () => {
  // Stop applications
  await appLauncher.stopApplications();
});

test.describe('Content Sharing', () => {
  test('should share text between browsers', async ({ browser }) => {
    // Create contexts for sender and receiver
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();
    
    // Create pages
    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();
    
    try {
      // Create a session in the sender browser
      const sessionInfo = await createSession(senderPage);
      
      // Join the session in the receiver browser
      await joinSession(receiverPage, sessionInfo);
      
      // Share text from the sender
      const testText = 'Hello from E2E test!';
      await shareText(senderPage, testText);
      
      // Wait for text to appear in the receiver
      const receivedText = await waitForContent(receiverPage, 'text');
      
      // Verify text
      expect(receivedText).toBe(testText);
    } finally {
      // Close pages and contexts
      await senderPage.close();
      await receiverPage.close();
      await senderContext.close();
      await receiverContext.close();
    }
  });

  test('should share images between browsers', async ({ browser }) => {
    // Create contexts for sender and receiver
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();
    
    // Create pages
    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();
    
    try {
      // Create a session in the sender browser
      const sessionInfo = await createSession(senderPage);
      
      // Join the session in the receiver browser
      await joinSession(receiverPage, sessionInfo);
      
      // Share image from the sender
      const imagePath = path.join(__dirname, '../fixtures/test-image.png');
      await shareImage(senderPage, imagePath);
      
      // Wait for image to appear in the receiver
      await receiverPage.waitForSelector('.content-item.image img', { timeout: 10000 });
      
      // Verify image exists
      const imgSrc = await receiverPage.$eval('.content-item.image img', img => img.src);
      expect(imgSrc).toBeTruthy();
    } finally {
      // Close pages and contexts
      await senderPage.close();
      await receiverPage.close();
      await senderContext.close();
      await receiverContext.close();
    }
  });
});
```

## Installation Steps

1. Install Playwright and other dependencies:

```bash
npm install --save-dev @playwright/test wait-on
npx playwright install
```

2. Create the directory structure:

```bash
mkdir -p test/e2e/browser/fixtures
mkdir -p test/e2e/browser/helpers
mkdir -p test/e2e/browser/tests
```

3. Create the implementation files as described above

4. Add test fixtures (sample files for sharing):
   - Add a test image to `test/e2e/browser/fixtures/test-image.png`
   - Add a test document to `test/e2e/browser/fixtures/test-document.pdf`

5. Add npm scripts to package.json:

```json
{
  "scripts": {
    "test:e2e:browser": "playwright test --config=test/e2e/browser/playwright.config.ts",
    "test:e2e:browser:ui": "playwright test --config=test/e2e/browser/playwright.config.ts --ui",
    "test:e2e:browser:debug": "playwright test --config=test/e2e/browser/playwright.config.ts --debug"
  }
}
```

## Running the Tests

To run the browser E2E tests:

```bash
npm run test:e2e:browser
```

To run with the Playwright UI:

```bash
npm run test:e2e:browser:ui
```

To run in debug mode:

```bash
npm run test:e2e:browser:debug