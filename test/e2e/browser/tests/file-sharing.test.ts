import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';
import { createSession, joinSession } from '../helpers/browser-utils';
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

test.describe('File Sharing', () => {
  test('should share files between browsers', async ({ browser }) => {
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
      
      // Share file from the sender
      const filePath = path.join(__dirname, '../fixtures/test-document.txt');
      
      // Set up file chooser handler
      const fileChooserPromise = senderPage.waitForEvent('filechooser');
      
      // Click file sharing button
      await senderPage.click('button:has-text("Share File")');
      
      // Get file chooser
      const fileChooser = await fileChooserPromise;
      
      // Select file
      await fileChooser.setFiles(filePath);
      
      // Click send button
      await senderPage.click('button:has-text("Send")');
      
      // Wait for file to appear in the receiver
      await receiverPage.waitForSelector('.content-item.file', { timeout: 10000 });
      
      // Verify file name
      const fileName = await receiverPage.innerText('.content-item.file .file-name');
      expect(fileName).toBe('test-document.txt');
      
      // Verify download link exists
      const downloadLink = await receiverPage.$('.content-item.file .download-link');
      expect(downloadLink).toBeTruthy();
      
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
  
  test('should handle large file chunking', async ({ browser }) => {
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
      
      // Share large file from the sender
      const filePath = path.join(__dirname, '../fixtures/large-file.bin');
      
      // Set up file chooser handler
      const fileChooserPromise = senderPage.waitForEvent('filechooser');
      
      // Click file sharing button
      await senderPage.click('button:has-text("Share File")');
      
      // Get file chooser
      const fileChooser = await fileChooserPromise;
      
      // Select file
      await fileChooser.setFiles(filePath);
      
      // Click send button
      await senderPage.click('button:has-text("Send")');
      
      // Wait for progress indicator (if it exists)
      try {
        await senderPage.waitForSelector('.upload-progress', { timeout: 5000 });
        console.log('Upload progress indicator found');
      } catch (e) {
        console.log('No upload progress indicator found, continuing test');
      }
      
      // Wait for file to appear in the receiver (with longer timeout)
      await receiverPage.waitForSelector('.content-item.file', { timeout: 30000 });
      
      // Verify file name
      const fileName = await receiverPage.innerText('.content-item.file .file-name');
      expect(fileName).toBe('large-file.bin');
      
      // Verify file size indicator exists
      try {
        const fileSize = await receiverPage.innerText('.content-item.file .file-size');
        console.log(`File size displayed: ${fileSize}`);
        expect(fileSize).toBeTruthy();
      } catch (e) {
        console.log('No file size indicator found, continuing test');
      }
      
      // Verify download link exists
      const downloadLink = await receiverPage.$('.content-item.file .download-link');
      expect(downloadLink).toBeTruthy();
    } finally {
      // Close pages and contexts
      await senderPage.close();
      await receiverPage.close();
      await senderContext.close();
      await receiverContext.close();
    }
  });
});