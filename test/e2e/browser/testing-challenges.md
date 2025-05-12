# E2E Browser Testing Challenges and Solutions

This document outlines common challenges encountered when implementing browser-based E2E tests for the ShareThings application and provides solutions for each.

## Challenge 1: Clipboard Access

### Problem

Browser automation tools like Playwright have limited access to the system clipboard, especially in headless mode. This makes it difficult to test clipboard-related functionality.

### Solutions

#### Solution 1: Mock Clipboard Events

```typescript
// Mock clipboard copy event
await page.evaluate((text) => {
  // Create a mock clipboard data
  const mockClipboardData = {
    getData: () => text,
    setData: () => {}
  };
  
  // Create a clipboard event
  const clipboardEvent = new ClipboardEvent('paste', {
    clipboardData: mockClipboardData as any,
    bubbles: true
  });
  
  // Dispatch the event
  document.dispatchEvent(clipboardEvent);
}, 'Text from clipboard');
```

#### Solution 2: Use Browser Permissions

```typescript
// Request clipboard permissions when creating browser context
const context = await browser.newContext({
  permissions: ['clipboard-read', 'clipboard-write']
});

// Write to clipboard
await page.evaluate(async (text) => {
  await navigator.clipboard.writeText(text);
}, 'Text to copy');

// Read from clipboard
const clipboardText = await page.evaluate(async () => {
  return await navigator.clipboard.readText();
});
```

#### Solution 3: DOM-Based Workaround

```typescript
// Use document.execCommand for clipboard operations
await page.evaluate((text) => {
  // Create a textarea element
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  
  // Select the text
  textarea.select();
  
  // Copy the text
  document.execCommand('copy');
  
  // Clean up
  document.body.removeChild(textarea);
});
```

## Challenge 2: Drag and Drop Operations

### Problem

Simulating drag and drop operations is complex in browser automation, as it involves multiple events and browser-specific behaviors.

### Solutions

#### Solution 1: Use File Input for File Drops

```typescript
// For file drops, use the file input element
const fileChooserPromise = page.waitForEvent('filechooser');
await page.click('button:has-text("Upload")'); // Or trigger the file input
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles('/path/to/file.pdf');
```

#### Solution 2: Simulate Drag Events

```typescript
// Simulate drag and drop events
await page.evaluate((sourceSelector, targetSelector) => {
  const source = document.querySelector(sourceSelector);
  const target = document.querySelector(targetSelector);
  
  // Create data transfer object
  const dataTransfer = new DataTransfer();
  
  // Dispatch dragstart event on source
  const dragStartEvent = new DragEvent('dragstart', {
    bubbles: true,
    cancelable: true,
    dataTransfer
  });
  source.dispatchEvent(dragStartEvent);
  
  // Dispatch dragover event on target
  const dragOverEvent = new DragEvent('dragover', {
    bubbles: true,
    cancelable: true,
    dataTransfer
  });
  target.dispatchEvent(dragOverEvent);
  
  // Dispatch drop event on target
  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer
  });
  target.dispatchEvent(dropEvent);
  
  // Dispatch dragend event on source
  const dragEndEvent = new DragEvent('dragend', {
    bubbles: true,
    cancelable: true,
    dataTransfer
  });
  source.dispatchEvent(dragEndEvent);
}, '.draggable-item', '.drop-zone');
```

#### Solution 3: Direct API Call

```typescript
// Bypass the UI and call the application's API directly
await page.evaluate(async (fileData) => {
  // Get the application's file handling function
  const app = window.shareThingsApp;
  
  // Call the function directly
  await app.handleFileDrop([
    new File([fileData], 'test-file.txt', { type: 'text/plain' })
  ]);
}, 'File content here');
```

## Challenge 3: Encryption and Decryption

### Problem

The ShareThings application uses end-to-end encryption, which can make it difficult to verify the content of shared files and messages.

### Solutions

#### Solution 1: Verify UI Elements

```typescript
// Instead of checking the decrypted content directly,
// verify that the UI shows the expected elements
await page.waitForSelector('.content-item.text');
const contentExists = await page.isVisible('.content-item.text');
expect(contentExists).toBe(true);

// Check for expected metadata
const fileName = await page.innerText('.content-item.file .file-name');
expect(fileName).toBe('expected-file.pdf');
```

#### Solution 2: Use Application's Decryption API

```typescript
// Access the application's decryption function
const decryptedContent = await page.evaluate(async (contentId) => {
  const app = window.shareThingsApp;
  const content = app.getContentById(contentId);
  return await app.decryptContent(content);
}, 'content-123');

// Verify the decrypted content
expect(decryptedContent).toBe('Expected decrypted content');
```

#### Solution 3: Known Test Data

```typescript
// Use known test data with predictable encryption results
const testText = 'Test message with known encryption';
await shareText(senderPage, testText);

// Wait for content to appear
await receiverPage.waitForSelector('.content-item.text');

// Verify content exists
const contentExists = await receiverPage.isVisible('.content-item.text');
expect(contentExists).toBe(true);
```

## Challenge 4: WebSocket Communication

### Problem

Testing WebSocket communication can be challenging because it's asynchronous and can be affected by network conditions.

### Solutions

#### Solution 1: Wait for Socket Events

```typescript
// Wait for socket events using page.waitForEvent
await page.waitForEvent('websocket');

// Or wait for a specific socket message
await page.waitForEvent('websocket', ws => {
  return ws.url().includes('your-socket-server');
});

// Wait for a specific socket message
const socketMessage = await page.waitForEvent('websocket:message', msg => {
  try {
    const data = JSON.parse(msg.text());
    return data.type === 'content-shared';
  } catch {
    return false;
  }
});
```

#### Solution 2: Monitor Network Activity

```typescript
// Monitor network activity
await page.route('**/socket.io/**', route => {
  console.log('Socket request:', route.request().url());
  route.continue();
});

// Wait for specific network request
await page.waitForRequest(request => {
  return request.url().includes('socket.io') && 
         request.postData()?.includes('content-shared');
});
```

#### Solution 3: Use Application Events

```typescript
// Listen for application events
await page.evaluate(() => {
  window.socketEvents = [];
  
  // Store socket events
  window.addEventListener('socket-message', (event) => {
    window.socketEvents.push(event.detail);
  });
});

// Perform action that triggers socket communication
await shareText(page, 'Hello');

// Check captured events
const events = await page.evaluate(() => window.socketEvents);
expect(events.some(e => e.type === 'content-shared')).toBe(true);
```

## Challenge 5: Browser Permissions

### Problem

Some features require browser permissions (notifications, clipboard, etc.) which can be difficult to grant in automated tests.

### Solutions

#### Solution 1: Configure Browser Context

```typescript
// Configure browser context with required permissions
const context = await browser.newContext({
  permissions: ['clipboard-read', 'clipboard-write', 'notifications']
});

const page = await context.newPage();
```

#### Solution 2: Grant Permissions Programmatically

```typescript
// Grant permissions programmatically
await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
  origin: 'http://localhost:5173'
});
```

#### Solution 3: Mock Permission APIs

```typescript
// Mock permission APIs
await page.evaluate(() => {
  // Override the permissions API
  navigator.permissions.query = async () => ({
    state: 'granted',
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  });
  
  // Mock notification permission
  Object.defineProperty(Notification, 'permission', {
    get: () => 'granted'
  });
});
```

## Challenge 6: Handling Multiple Browser Windows

### Problem

Testing scenarios where multiple browser windows or tabs are involved can be challenging.

### Solutions

#### Solution 1: Use Multiple Browser Contexts

```typescript
// Create separate browser contexts for each "user"
const senderContext = await browser.newContext();
const receiverContext = await browser.newContext();

// Create pages in each context
const senderPage = await senderContext.newPage();
const receiverPage = await receiverContext.newPage();

// Now you can interact with both pages independently
await senderPage.goto('http://localhost:5173');
await receiverPage.goto('http://localhost:5173');
```

#### Solution 2: Handle Popups

```typescript
// Listen for popups
const popupPromise = page.waitForEvent('popup');

// Trigger action that opens a popup
await page.click('button:has-text("Open in new window")');

// Get the popup page
const popup = await popupPromise;

// Interact with the popup
await popup.waitForLoadState();
await popup.click('button:has-text("Confirm")');
```

#### Solution 3: Use Page Events

```typescript
// Listen for page events
page.on('popup', async popup => {
  console.log('Popup opened:', popup.url());
  
  // Interact with the popup
  await popup.waitForLoadState();
  await popup.click('button:has-text("Confirm")');
  await popup.close();
});

// Trigger action that opens a popup
await page.click('button:has-text("Open in new window")');
```

## Challenge 7: Handling File Downloads

### Problem

Testing file downloads can be challenging because they often involve browser dialogs and filesystem access.

### Solutions

#### Solution 1: Configure Download Behavior

```typescript
// Configure download behavior
const downloadPath = '/tmp/downloads';
const context = await browser.newContext({
  acceptDownloads: true,
  downloadsPath: downloadPath
});

// Wait for download
const downloadPromise = page.waitForEvent('download');

// Trigger download
await page.click('button:has-text("Download")');

// Handle download
const download = await downloadPromise;
const path = await download.path();
console.log('Downloaded file:', path);

// Verify file content
const fs = require('fs');
const content = fs.readFileSync(path, 'utf8');
expect(content).toContain('Expected content');
```

#### Solution 2: Intercept Download Requests

```typescript
// Intercept download requests
await page.route('**/download/**', route => {
  const url = route.request().url();
  console.log('Download request intercepted:', url);
  
  // Allow the download
  route.continue();
});

// Trigger download
await page.click('button:has-text("Download")');
```

#### Solution 3: Use Download Events

```typescript
// Listen for download events
const downloadPromise = page.waitForEvent('download');

// Trigger download
await page.click('button:has-text("Download")');

// Get download info
const download = await downloadPromise;
const suggestedFilename = download.suggestedFilename();
expect(suggestedFilename).toBe('expected-file.pdf');
```

## Challenge 8: Testing Responsive Behavior

### Problem

The ShareThings application should work on different screen sizes, which can be challenging to test.

### Solutions

#### Solution 1: Configure Viewport Size

```typescript
// Configure viewport size
await page.setViewportSize({ width: 1280, height: 720 });

// Test desktop layout
const desktopElement = await page.$('.desktop-only');
expect(desktopElement).toBeTruthy();

// Test mobile layout
await page.setViewportSize({ width: 375, height: 667 });
const mobileElement = await page.$('.mobile-only');
expect(mobileElement).toBeTruthy();
```

#### Solution 2: Use Device Emulation

```typescript
// Use device emulation
const iPhone = playwright.devices['iPhone 12'];
const context = await browser.newContext({
  ...iPhone
});

// Test mobile-specific behavior
const page = await context.newPage();
await page.goto('http://localhost:5173');

// Verify mobile UI elements
const mobileMenu = await page.$('.mobile-menu');
expect(mobileMenu).toBeTruthy();
```

#### Solution 3: Test Media Queries

```typescript
// Test media queries
const isMobile = await page.evaluate(() => {
  return window.matchMedia('(max-width: 768px)').matches;
});

if (isMobile) {
  // Test mobile behavior
  await page.click('.mobile-menu-button');
  await page.click('.mobile-menu .share-button');
} else {
  // Test desktop behavior
  await page.click('.desktop-share-button');
}
```

## Challenge 9: Testing Real-Time Updates

### Problem

The ShareThings application relies on real-time updates, which can be challenging to test due to timing issues.

### Solutions

#### Solution 1: Use Polling

```typescript
// Use polling to wait for content to appear
await page.waitForFunction(() => {
  const contentItems = document.querySelectorAll('.content-item');
  return contentItems.length > 0;
}, { polling: 100, timeout: 10000 });
```

#### Solution 2: Wait for Network Idle

```typescript
// Wait for network idle
await page.waitForLoadState('networkidle');

// Perform action
await shareText(page, 'Hello');

// Wait for network idle again
await page.waitForLoadState('networkidle');

// Verify content
const contentExists = await page.isVisible('.content-item.text');
expect(contentExists).toBe(true);
```

#### Solution 3: Use Application Events

```typescript
// Listen for application events
await page.evaluate(() => {
  window.contentReceived = false;
  
  // Listen for content received event
  window.addEventListener('content-received', () => {
    window.contentReceived = true;
  });
});

// Perform action
await shareText(page, 'Hello');

// Wait for content received event
await page.waitForFunction(() => window.contentReceived, { timeout: 10000 });

// Verify content
const contentExists = await page.isVisible('.content-item.text');
expect(contentExists).toBe(true);
```

## Challenge 10: Handling Authentication

### Problem

The ShareThings application uses session-based authentication, which can be challenging to test.

### Solutions

#### Solution 1: Reuse Authentication State

```typescript
// Save authentication state
const authFile = 'auth.json';
await context.storageState({ path: authFile });

// Create new context with saved authentication
const newContext = await browser.newContext({
  storageState: authFile
});

// Use the authenticated context
const newPage = await newContext.newPage();
await newPage.goto('http://localhost:5173/session/123');

// Verify authenticated state
const sessionInfo = await newPage.$('.session-info');
expect(sessionInfo).toBeTruthy();
```

#### Solution 2: Programmatic Authentication

```typescript
// Helper function for authentication
async function authenticateSession(page, sessionId, passphrase) {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Session ID"]', sessionId);
  await page.fill('input[placeholder="Passphrase"]', passphrase);
  await page.click('button:has-text("Join Session")');
  await page.waitForSelector('.session-connected');
}

// Use the helper function
await authenticateSession(page, 'test-session', 'test-passphrase');
```

#### Solution 3: API-Based Authentication

```typescript
// Bypass UI and use API for authentication
await page.evaluate(async (sessionId, passphrase) => {
  const app = window.shareThingsApp;
  await app.joinSession(sessionId, passphrase);
}, 'test-session', 'test-passphrase');

// Navigate to session page
await page.goto('http://localhost:5173/session/test-session');

// Verify authenticated state
const sessionInfo = await page.$('.session-info');
expect(sessionInfo).toBeTruthy();
```

## Best Practices for E2E Testing

1. **Isolate Tests**: Each test should be independent and not rely on the state from previous tests.

2. **Use Page Objects**: Create page object models to encapsulate page-specific logic.

3. **Handle Asynchronous Operations**: Use proper waiting mechanisms for asynchronous operations.

4. **Clean Up Resources**: Always clean up resources (pages, contexts, etc.) after tests.

5. **Use Descriptive Test Names**: Make test names descriptive to understand what they're testing.

6. **Add Logging**: Add logging to help debug test failures.

7. **Take Screenshots on Failure**: Capture screenshots when tests fail to help with debugging.

8. **Use Retry Mechanisms**: Add retry mechanisms for flaky tests.

9. **Run Tests in Parallel**: Run tests in parallel to speed up test execution.

10. **Use CI/CD Integration**: Integrate tests with CI/CD pipelines for continuous testing.