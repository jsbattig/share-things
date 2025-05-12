import { Page } from '@playwright/test';

/**
 * Create a new sharing session
 * @param page Playwright page
 * @returns Session information (sessionId:passphrase)
 */
export async function createSession(page: Page): Promise<string> {
  // Navigate to home page if not already there
  if (!page.url().includes('localhost:5175')) {
    await page.goto('http://localhost:5175');
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
  if (!page.url().includes('localhost:5175')) {
    await page.goto('http://localhost:5175');
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

/**
 * Simulate clipboard copy
 * @param page Playwright page
 * @param text Text to copy to clipboard
 */
export async function simulateClipboardCopy(page: Page, text: string): Promise<void> {
  await page.evaluate((text) => {
    // Create a textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    
    // Select the text
    textarea.select();
    
    // Trigger copy event
    document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textarea);
    
    // Trigger the clipboard event manually
    document.dispatchEvent(new ClipboardEvent('copy'));
  }, text);
  
  console.log(`Simulated clipboard copy: ${text}`);
}

/**
 * Simulate file drop
 * @param page Playwright page
 * @param filePath Path to file
 */
export async function simulateFileDrop(page: Page, filePath: string): Promise<void> {
  // Create a file input element
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'file-input-for-test';
    input.style.position = 'fixed';
    input.style.top = '0';
    input.style.left = '0';
    document.body.appendChild(input);
  });
  
  // Set the file
  await page.setInputFiles('#file-input-for-test', filePath);
  
  // Trigger the drop event
  await page.evaluate(() => {
    const input = document.getElementById('file-input-for-test') as HTMLInputElement;
    const files = input.files;
    
    // Create a drop event
    const dropEvent = new Event('drop', { bubbles: true });
    
    // Add files to dataTransfer
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: files
      }
    });
    
    // Get the drop zone
    const dropZone = document.querySelector('.drop-zone') || document.body;
    
    // Dispatch the event
    dropZone.dispatchEvent(dropEvent);
    
    // Clean up
    document.body.removeChild(input);
  });
  
  console.log(`Simulated file drop: ${filePath}`);
}