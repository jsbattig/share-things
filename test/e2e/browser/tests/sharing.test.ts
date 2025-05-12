import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';
import { createSession, joinSession, shareText, waitForContent } from '../helpers/browser-utils';
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
});