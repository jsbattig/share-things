import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Content Sharing', () => {
  test('should share text between browsers', async ({ browser }) => {
    // Create two browser contexts for the sender and receiver
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();
    
    // Create pages for each context
    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();
    
    try {
      // Sender creates a session
      await senderPage.goto('http://localhost:3000');
      
      // Generate a unique session ID
      const sessionId = `test-session-${Date.now()}`;
      const passphrase = 'test-passphrase';
      
      // Fill in the session details
      await senderPage.fill('input[placeholder*="session ID" i]', sessionId);
      await senderPage.fill('input[placeholder*="name" i]', 'Sender User');
      await senderPage.fill('input[placeholder*="passphrase" i]', passphrase);
      
      // Click the Create Session button
      await senderPage.getByRole('button', { name: 'Create Session' }).click();
      
      // Wait for the session page to load
      await senderPage.waitForURL('**/session/**');
      
      // Receiver joins the session
      await receiverPage.goto('http://localhost:3000');
      
      // Fill in the session details
      await receiverPage.fill('input[placeholder*="session ID" i]', sessionId);
      await receiverPage.fill('input[placeholder*="name" i]', 'Receiver User');
      await receiverPage.fill('input[placeholder*="passphrase" i]', passphrase);
      
      // Click the Join Session button
      await receiverPage.getByRole('button', { name: 'Join Session' }).click();
      
      // Wait for the session page to load
      await receiverPage.waitForURL('**/session/**');
      
      // Wait for both users to be connected
      await senderPage.waitForSelector('.client-list .client:nth-child(2)');
      await receiverPage.waitForSelector('.client-list .client:nth-child(2)');
      
      // Share text from sender
      const testText = 'Hello from E2E test!';
      
      // Click the share text button
      await senderPage.getByRole('button', { name: 'Share Text' }).click();
      
      // Fill in the text
      await senderPage.fill('textarea', testText);
      
      // Click the send button
      await senderPage.getByRole('button', { name: 'Send' }).click();
      
      // Wait for the text to appear in the receiver's content list
      await receiverPage.waitForSelector('.content-list .content-item');
      
      // Verify the text content
      const receivedText = await receiverPage.locator('.content-list .content-item').textContent();
      expect(receivedText).toContain(testText);
      
      // Take screenshots
      await senderPage.screenshot({ path: 'test-results/sender-text.png' });
      await receiverPage.screenshot({ path: 'test-results/receiver-text.png' });
    } finally {
      // Close all pages and contexts
      await senderPage.close();
      await receiverPage.close();
      await senderContext.close();
      await receiverContext.close();
    }
  });
  
  test('should share files between browsers', async ({ browser }) => {
    // Create two browser contexts for the sender and receiver
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();
    
    // Create pages for each context
    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();
    
    try {
      // Sender creates a session
      await senderPage.goto('http://localhost:3000');
      
      // Generate a unique session ID
      const sessionId = `test-session-${Date.now()}`;
      const passphrase = 'test-passphrase';
      
      // Fill in the session details
      await senderPage.fill('input[placeholder*="session ID" i]', sessionId);
      await senderPage.fill('input[placeholder*="name" i]', 'Sender User');
      await senderPage.fill('input[placeholder*="passphrase" i]', passphrase);
      
      // Click the Create Session button
      await senderPage.getByRole('button', { name: 'Create Session' }).click();
      
      // Wait for the session page to load
      await senderPage.waitForURL('**/session/**');
      
      // Receiver joins the session
      await receiverPage.goto('http://localhost:3000');
      
      // Fill in the session details
      await receiverPage.fill('input[placeholder*="session ID" i]', sessionId);
      await receiverPage.fill('input[placeholder*="name" i]', 'Receiver User');
      await receiverPage.fill('input[placeholder*="passphrase" i]', passphrase);
      
      // Click the Join Session button
      await receiverPage.getByRole('button', { name: 'Join Session' }).click();
      
      // Wait for the session page to load
      await receiverPage.waitForURL('**/session/**');
      
      // Wait for both users to be connected
      await senderPage.waitForSelector('.client-list .client:nth-child(2)');
      await receiverPage.waitForSelector('.client-list .client:nth-child(2)');
      
      // Share a file from sender
      // Click the share file button
      await senderPage.getByRole('button', { name: 'Share File' }).click();
      
      // Set up file chooser handler
      const fileChooserPromise = senderPage.waitForEvent('filechooser');
      
      // Click the file input
      await senderPage.click('input[type="file"]');
      
      // Get file chooser
      const fileChooser = await fileChooserPromise;
      
      // Select file
      const testFilePath = path.join(__dirname, '../fixtures/test-document.txt');
      await fileChooser.setFiles(testFilePath);
      
      // Click the send button
      await senderPage.getByRole('button', { name: 'Send' }).click();
      
      // Wait for the file to appear in the receiver's content list
      await receiverPage.waitForSelector('.content-list .content-item.file');
      
      // Verify the file name
      const receivedFileName = await receiverPage.locator('.content-list .content-item.file .file-name').textContent();
      expect(receivedFileName).toContain('test-document.txt');
      
      // Take screenshots
      await senderPage.screenshot({ path: 'test-results/sender-file.png' });
      await receiverPage.screenshot({ path: 'test-results/receiver-file.png' });
    } finally {
      // Close all pages and contexts
      await senderPage.close();
      await receiverPage.close();
      await senderContext.close();
      await receiverContext.close();
    }
  });
});