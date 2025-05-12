# E2E Browser Test Scenarios

This document outlines the test scenarios for the ShareThings application using real browser automation.

## Test Categories

1. **Session Management Tests**
   - Creating sessions
   - Joining sessions
   - Session authentication
   - Session persistence

2. **Content Sharing Tests**
   - Text sharing
   - Image sharing
   - File sharing
   - Large file chunking

3. **Advanced Interaction Tests**
   - Clipboard operations
   - Drag and drop
   - Multiple clients in one session
   - Reconnection scenarios

## Detailed Test Scenarios

### 1. Session Management Tests

#### 1.1 Session Creation

```typescript
test('should create a new session', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to home page
    await page.goto('http://localhost:5173');
    
    // Click create session button
    await page.click('button:has-text("Create Session")');
    
    // Verify session was created
    await page.waitForSelector('.session-info');
    const sessionId = await page.innerText('.session-id');
    const passphrase = await page.innerText('.passphrase');
    
    expect(sessionId).toBeTruthy();
    expect(passphrase).toBeTruthy();
    
    // Verify we're redirected to the session page
    expect(page.url()).toContain('/session/');
  } finally {
    await page.close();
    await context.close();
  }
});
```

#### 1.2 Session Joining

```typescript
test('should join an existing session', async ({ browser }) => {
  // Create contexts for creator and joiner
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  
  // Create pages
  const creatorPage = await creatorContext.newPage();
  const joinerPage = await joinerContext.newPage();
  
  try {
    // Create a session
    await creatorPage.goto('http://localhost:5173');
    await creatorPage.click('button:has-text("Create Session")');
    await creatorPage.waitForSelector('.session-info');
    const sessionId = await creatorPage.innerText('.session-id');
    const passphrase = await creatorPage.innerText('.passphrase');
    
    // Join the session
    await joinerPage.goto('http://localhost:5173');
    await joinerPage.fill('input[placeholder="Session ID"]', sessionId);
    await joinerPage.fill('input[placeholder="Passphrase"]', passphrase);
    await joinerPage.click('button:has-text("Join Session")');
    
    // Verify session was joined
    await joinerPage.waitForSelector('.session-connected');
    
    // Verify both clients see each other
    await creatorPage.waitForSelector('.client-list .client:nth-child(2)');
    await joinerPage.waitForSelector('.client-list .client:nth-child(2)');
    
    const creatorClientCount = await creatorPage.$$eval('.client-list .client', clients => clients.length);
    const joinerClientCount = await joinerPage.$$eval('.client-list .client', clients => clients.length);
    
    expect(creatorClientCount).toBe(2);
    expect(joinerClientCount).toBe(2);
  } finally {
    await creatorPage.close();
    await joinerPage.close();
    await creatorContext.close();
    await joinerContext.close();
  }
});
```

#### 1.3 Invalid Session Authentication

```typescript
test('should reject invalid session credentials', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to home page
    await page.goto('http://localhost:5173');
    
    // Try to join with invalid credentials
    await page.fill('input[placeholder="Session ID"]', 'invalid-session-id');
    await page.fill('input[placeholder="Passphrase"]', 'invalid-passphrase');
    await page.click('button:has-text("Join Session")');
    
    // Verify error message
    await page.waitForSelector('.error-message');
    const errorMessage = await page.innerText('.error-message');
    
    expect(errorMessage).toContain('Invalid session ID or passphrase');
  } finally {
    await page.close();
    await context.close();
  }
});
```

### 2. Content Sharing Tests

#### 2.1 Text Sharing

```typescript
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
    
    // Verify content appears in both browsers
    const senderContentCount = await senderPage.$$eval('.content-list .content-item', items => items.length);
    const receiverContentCount = await receiverPage.$$eval('.content-list .content-item', items => items.length);
    
    expect(senderContentCount).toBe(1);
    expect(receiverContentCount).toBe(1);
  } finally {
    await senderPage.close();
    await receiverPage.close();
    await senderContext.close();
    await receiverContext.close();
  }
});
```

#### 2.2 Image Sharing

```typescript
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
    
    // Set up file chooser handler
    const fileChooserPromise = senderPage.waitForEvent('filechooser');
    
    // Click image sharing button
    await senderPage.click('button:has-text("Share Image")');
    
    // Get file chooser
    const fileChooser = await fileChooserPromise;
    
    // Select file
    await fileChooser.setFiles(imagePath);
    
    // Click send button
    await senderPage.click('button:has-text("Send")');
    
    // Wait for image to appear in the receiver
    await receiverPage.waitForSelector('.content-item.image img', { timeout: 10000 });
    
    // Verify image exists
    const imgSrc = await receiverPage.$eval('.content-item.image img', img => img.src);
    expect(imgSrc).toBeTruthy();
    
    // Verify content appears in both browsers
    const senderContentCount = await senderPage.$$eval('.content-list .content-item', items => items.length);
    const receiverContentCount = await receiverPage.$$eval('.content-list .content-item', items => items.length);
    
    expect(senderContentCount).toBe(1);
    expect(receiverContentCount).toBe(1);
  } finally {
    await senderPage.close();
    await receiverPage.close();
    await senderContext.close();
    await receiverContext.close();
  }
});
```

#### 2.3 File Sharing

```typescript
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
    const filePath = path.join(__dirname, '../fixtures/test-document.pdf');
    
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
    expect(fileName).toBe('test-document.pdf');
    
    // Verify download link exists
    const downloadLink = await receiverPage.$('.content-item.file .download-link');
    expect(downloadLink).toBeTruthy();
  } finally {
    await senderPage.close();
    await receiverPage.close();
    await senderContext.close();
    await receiverContext.close();
  }
});
```

#### 2.4 Large File Chunking

```typescript
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
    const filePath = path.join(__dirname, '../fixtures/large-file.bin'); // Create a large test file
    
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
    
    // Wait for progress indicator
    await senderPage.waitForSelector('.upload-progress');
    
    // Wait for file to appear in the receiver (with longer timeout)
    await receiverPage.waitForSelector('.content-item.file', { timeout: 30000 });
    
    // Verify file name
    const fileName = await receiverPage.innerText('.content-item.file .file-name');
    expect(fileName).toBe('large-file.bin');
    
    // Verify file size
    const fileSize = await receiverPage.innerText('.content-item.file .file-size');
    expect(fileSize).toContain('MB'); // Should show size in MB
  } finally {
    await senderPage.close();
    await receiverPage.close();
    await senderContext.close();
    await receiverContext.close();
  }
});
```

### 3. Advanced Interaction Tests

#### 3.1 Clipboard Operations

```typescript
test('should handle clipboard operations', async ({ browser }) => {
  // Create contexts for sender and receiver
  const senderContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'] // Request clipboard permissions
  });
  const receiverContext = await browser.newContext();
  
  // Create pages
  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();
  
  try {
    // Create a session in the sender browser
    const sessionInfo = await createSession(senderPage);
    
    // Join the session in the receiver browser
    await joinSession(receiverPage, sessionInfo);
    
    // Simulate copying text to clipboard
    const testText = 'Clipboard test content';
    
    // This is a workaround since we can't directly access clipboard in headless mode
    await senderPage.evaluate((text) => {
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
    }, testText);
    
    // Click the "Share Clipboard" button
    await senderPage.click('button:has-text("Share Clipboard")');
    
    // Wait for content to appear in the receiver
    await receiverPage.waitForSelector('.content-item.text', { timeout: 10000 });
    
    // Verify text
    const receivedText = await receiverPage.innerText('.content-item.text .content-data');
    expect(receivedText).toBe(testText);
  } finally {
    await senderPage.close();
    await receiverPage.close();
    await senderContext.close();
    await receiverContext.close();
  }
});
```

#### 3.2 Drag and Drop

```typescript
test('should handle drag and drop operations', async ({ browser }) => {
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
    
    // Prepare file for drag and drop
    const filePath = path.join(__dirname, '../fixtures/test-document.pdf');
    
    // Simulate drag and drop
    // This is complex to simulate with Playwright, so we'll use a workaround
    
    // First, create a file input element
    await senderPage.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'file-input-for-test';
      input.style.position = 'fixed';
      input.style.top = '0';
      input.style.left = '0';
      document.body.appendChild(input);
    });
    
    // Set the file
    await senderPage.setInputFiles('#file-input-for-test', filePath);
    
    // Trigger the drop event
    await senderPage.evaluate(() => {
      const input = document.getElementById('file-input-for-test');
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
    
    // Wait for file to appear in the receiver
    await receiverPage.waitForSelector('.content-item.file', { timeout: 10000 });
    
    // Verify file name
    const fileName = await receiverPage.innerText('.content-item.file .file-name');
    expect(fileName).toBe('test-document.pdf');
  } finally {
    await senderPage.close();
    await receiverPage.close();
    await senderContext.close();
    await receiverContext.close();
  }
});
```

#### 3.3 Multiple Clients

```typescript
test('should handle multiple clients in one session', async ({ browser }) => {
  // Create contexts for host and multiple clients
  const hostContext = await browser.newContext();
  const client1Context = await browser.newContext();
  const client2Context = await browser.newContext();
  
  // Create pages
  const hostPage = await hostContext.newPage();
  const client1Page = await client1Context.newPage();
  const client2Page = await client2Context.newPage();
  
  try {
    // Create a session in the host browser
    const sessionInfo = await createSession(hostPage);
    
    // Join the session with client 1
    await joinSession(client1Page, sessionInfo);
    
    // Join the session with client 2
    await joinSession(client2Page, sessionInfo);
    
    // Verify all clients see each other
    await hostPage.waitForSelector('.client-list .client:nth-child(3)');
    await client1Page.waitForSelector('.client-list .client:nth-child(3)');
    await client2Page.waitForSelector('.client-list .client:nth-child(3)');
    
    const hostClientCount = await hostPage.$$eval('.client-list .client', clients => clients.length);
    const client1ClientCount = await client1Page.$$eval('.client-list .client', clients => clients.length);
    const client2ClientCount = await client2Page.$$eval('.client-list .client', clients => clients.length);
    
    expect(hostClientCount).toBe(3);
    expect(client1ClientCount).toBe(3);
    expect(client2ClientCount).toBe(3);
    
    // Share content from host
    const testText = 'Message to all clients';
    await shareText(hostPage, testText);
    
    // Verify content appears in all clients
    const client1ReceivedText = await waitForContent(client1Page, 'text');
    const client2ReceivedText = await waitForContent(client2Page, 'text');
    
    expect(client1ReceivedText).toBe(testText);
    expect(client2ReceivedText).toBe(testText);
  } finally {
    await hostPage.close();
    await client1Page.close();
    await client2Page.close();
    await hostContext.close();
    await client1Context.close();
    await client2Context.close();
  }
});
```

#### 3.4 Reconnection Scenarios

```typescript
test('should handle client reconnection', async ({ browser }) => {
  // Create contexts for host and client
  const hostContext = await browser.newContext();
  const clientContext = await browser.newContext();
  
  // Create pages
  const hostPage = await hostContext.newPage();
  let clientPage = await clientContext.newPage();
  
  try {
    // Create a session in the host browser
    const sessionInfo = await createSession(hostPage);
    
    // Join the session with the client
    await joinSession(clientPage, sessionInfo);
    
    // Share text from the host
    const testText = 'Content before disconnect';
    await shareText(hostPage, testText);
    
    // Verify content appears in the client
    await waitForContent(clientPage, 'text');
    
    // Close the client page (simulating disconnect)
    await clientPage.close();
    
    // Wait for host to see client disconnect
    await hostPage.waitForFunction(() => {
      const clientCount = document.querySelectorAll('.client-list .client').length;
      return clientCount === 1;
    });
    
    // Share more content from the host
    const newText = 'Content during disconnect';
    await shareText(hostPage, newText);
    
    // Reconnect with a new page
    clientPage = await clientContext.newPage();
    await joinSession(clientPage, sessionInfo);
    
    // Wait for reconnection
    await hostPage.waitForFunction(() => {
      const clientCount = document.querySelectorAll('.client-list .client').length;
      return clientCount === 2;
    });
    
    // Verify client can see both old and new content
    const contentItems = await clientPage.$$eval('.content-list .content-item', items => {
      return items.map(item => item.textContent);
    });
    
    expect(contentItems.length).toBe(2);
    expect(contentItems.some(text => text.includes(testText))).toBe(true);
    expect(contentItems.some(text => text.includes(newText))).toBe(true);
  } finally {
    await hostPage.close();
    if (!clientPage.isClosed()) {
      await clientPage.close();
    }
    await hostContext.close();
    await clientContext.close();
  }
});
```

## Test Fixtures

To run these tests, you'll need to create the following test fixtures:

1. **test-image.png**: A small test image (e.g., 200x200 pixels)
2. **test-document.pdf**: A small PDF document
3. **large-file.bin**: A large binary file (e.g., 10MB) for testing chunking

You can create these files manually or generate them programmatically.

## Running Specific Test Categories

You can run specific test categories using tags:

```bash
# Run only session management tests
npm run test:e2e:browser -- --grep "Session Management"

# Run only content sharing tests
npm run test:e2e:browser -- --grep "Content Sharing"

# Run only advanced interaction tests
npm run test:e2e:browser -- --grep "Advanced Interaction"