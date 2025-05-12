import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';
import { createSession, joinSession, shareImage } from '../helpers/browser-utils';
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

test.describe('Image Sharing', () => {
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
      const imgSrc = await receiverPage.$eval('.content-item.image img', (img: HTMLImageElement) => img.src);
      expect(imgSrc).toBeTruthy();
      
      // Verify content appears in both browsers
      const senderContentCount = await senderPage.$$eval('.content-list .content-item', items => items.length);
      const receiverContentCount = await receiverPage.$$eval('.content-list .content-item', items => items.length);
      
      expect(senderContentCount).toBe(1);
      expect(receiverContentCount).toBe(1);
    } finally {
      // Close pages and contexts
      await senderPage.close();
      await receiverPage.close();
      await senderContext.close();
      await receiverContext.close();
    }
  });
});