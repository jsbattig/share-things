import { createCanvas } from 'canvas';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { io, Socket } from 'socket.io-client';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate passphrase fingerprint (same logic as client)
 */
function generateFingerprint(passphrase: string): { iv: number[]; data: number[] } {
  // Use a fixed IV for fingerprint generation (same as client)
  const fixedIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  
  // Create a deterministic hash of the passphrase using Node.js crypto
  const hash = crypto.createHash('sha256').update(passphrase, 'utf8').digest();
  
  // Use the first 16 bytes of the hash as the "encrypted data"
  const dataBytes = hash.slice(0, 16);
  
  return {
    iv: Array.from(fixedIv),
    data: Array.from(dataBytes)
  };
}

/**
 * Generate test image content
 */
function generateTestImage(): { 
  buffer: Buffer; 
  metadata: { mimeType: string; fileName: string; fileSize: number } 
} {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  
  // Draw a simple test pattern
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(0, 0, 50, 50);
  ctx.fillStyle = '#00FF00';
  ctx.fillRect(50, 0, 50, 50);
  ctx.fillStyle = '#0000FF';
  ctx.fillRect(0, 50, 50, 50);
  ctx.fillStyle = '#FFFF00';
  ctx.fillRect(50, 50, 50, 50);
  
  const buffer = canvas.toBuffer('image/png');
  
  return {
    buffer,
    metadata: {
      mimeType: 'image/png',
      fileName: 'test-clear-all.png',
      fileSize: buffer.length
    }
  };
}

/**
 * Check if directory exists and contains any files
 */
async function checkDirectoryContents(sessionId: string): Promise<{ exists: boolean; contentCount: number }> {
  const serverDataPath = path.join(__dirname, '../../../server/data/sessions', sessionId);
  
  try {
    const stat = await fs.stat(serverDataPath);
    if (!stat.isDirectory()) {
      return { exists: false, contentCount: 0 };
    }
    
    const contents = await fs.readdir(serverDataPath);
    // Filter out the metadata.db file
    const contentDirs = contents.filter(item => item !== 'metadata.db');
    
    return { exists: true, contentCount: contentDirs.length };
  } catch (error) {
    return { exists: false, contentCount: 0 };
  }
}

describe('Clear All Content Functional Test', () => {
  let serverProcess: ChildProcess;
  let client1Socket: Socket;
  let client2Socket: Socket;
  let sessionId: string;
  let clientName1: string;
  let clientName2: string;
  let passphrase: string;
  let serverUrl: string;

  beforeAll(async () => {
    // Test parameters
    sessionId = 'test-clear-all-' + Date.now();
    clientName1 = 'TestClient1';
    clientName2 = 'TestClient2';
    passphrase = 'test-passphrase-clear-all';
    serverUrl = 'http://localhost:3001';
    
    console.log('=== Starting Server for Clear All Content Test ===');
    console.log(`Session ID: ${sessionId}`);
    
    // Start the real server
    serverProcess = spawn('npm', ['start'], {
      cwd: path.join(__dirname, '../../../server'),
      env: { ...process.env, PORT: '3001' },
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Server started, connecting clients...');
  }, 30000);

  afterAll(async () => {
    console.log('=== Cleaning up Clear All Content Test ===');
    
    // Disconnect clients
    if (client1Socket && client1Socket.connected) {
      client1Socket.disconnect();
    }
    if (client2Socket && client2Socket.connected) {
      client2Socket.disconnect();
    }
    
    // Kill server
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  }, 15000);

  test('should clear all content and broadcast to all clients', async () => {
    // Step 1: Connect both clients and join session
    console.log('Step 1: Connecting clients...');
    
    client1Socket = io(serverUrl, { 
      transports: ['websocket'],
      timeout: 10000
    });
    
    client2Socket = io(serverUrl, {
      transports: ['websocket'], 
      timeout: 10000
    });

    await Promise.all([
      new Promise(resolve => client1Socket.on('connect', () => resolve(true))),
      new Promise(resolve => client2Socket.on('connect', () => resolve(true)))
    ]);
    
    expect(client1Socket.connected).toBe(true);
    expect(client2Socket.connected).toBe(true);
    
    // Join session with both clients
    const fingerprint = generateFingerprint(passphrase);
    
    const joinResult1 = await new Promise<any>(resolve => {
      client1Socket.emit('join-session', {
        sessionId,
        clientName: clientName1,
        fingerprint
      }, resolve);
    });
    
    const joinResult2 = await new Promise<any>(resolve => {
      client2Socket.emit('join-session', {
        sessionId,
        clientName: clientName2,
        fingerprint
      }, resolve);
    });
    
    expect(joinResult1.success).toBe(true);
    expect(joinResult2.success).toBe(true);
    
    console.log('Both clients joined session successfully');

    // Step 2: Share multiple pieces of content
    console.log('Step 2: Sharing test content...');
    
    const testImage1 = generateTestImage();
    const testImage2 = generateTestImage();
    const testText = 'Test text content for clear all functionality';
    
    // Share image content from client 1
    const contentId1 = 'test-image-1-' + Date.now();
    client1Socket.emit('content', {
      sessionId,
      content: {
        contentId: contentId1,
        contentType: 'image',
        metadata: {
          ...testImage1.metadata,
          senderId: client1Socket.id,
          senderName: clientName1,
          timestamp: Date.now()
        },
        isChunked: false,
        isLargeFile: false
      },
      data: testImage1.buffer.toString('base64')
    });
    
    // Share another image from client 2
    const contentId2 = 'test-image-2-' + Date.now();
    client2Socket.emit('content', {
      sessionId,
      content: {
        contentId: contentId2,
        contentType: 'image',
        metadata: {
          ...testImage2.metadata,
          senderId: client2Socket.id,
          senderName: clientName2,
          timestamp: Date.now()
        },
        isChunked: false,
        isLargeFile: false
      },
      data: testImage2.buffer.toString('base64')
    });
    
    // Share text content from client 1
    const contentId3 = 'test-text-' + Date.now();
    client1Socket.emit('content', {
      sessionId,
      content: {
        contentId: contentId3,
        contentType: 'text',
        metadata: {
          mimeType: 'text/plain',
          fileName: 'test.txt',
          fileSize: testText.length,
          senderId: client1Socket.id,
          senderName: clientName1,
          timestamp: Date.now()
        },
        isChunked: false,
        isLargeFile: false
      },
      data: testText
    });
    
    // Wait for content to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify content exists on disk
    const contentCheck = await checkDirectoryContents(sessionId);
    expect(contentCheck.exists).toBe(true);
    expect(contentCheck.contentCount).toBeGreaterThanOrEqual(3);
    
    console.log(`Content verified on disk: ${contentCheck.contentCount} items`);

    // Step 3: Set up event listeners for clear all event
    console.log('Step 3: Setting up clear all event listeners...');
    
    const client1ClearEvent = new Promise<any>(resolve => {
      client1Socket.on('all-content-cleared', resolve);
    });
    
    const client2ClearEvent = new Promise<any>(resolve => {
      client2Socket.on('all-content-cleared', resolve);
    });

    // Step 4: Clear all content from client 1
    console.log('Step 4: Clearing all content...');
    
    const clearResult = await new Promise<any>(resolve => {
      client1Socket.emit('clear-all-content', { sessionId }, resolve);
    });
    
    expect(clearResult.success).toBe(true);
    console.log('Clear all content request successful');

    // Step 5: Verify both clients receive the clear event
    console.log('Step 5: Verifying broadcast events...');
    
    const [clearEvent1, clearEvent2] = await Promise.all([
      client1ClearEvent,
      client2ClearEvent
    ]);
    
    expect(clearEvent1.sessionId).toBe(sessionId);
    expect(clearEvent1.clearedBy).toBe(client1Socket.id);
    expect(clearEvent2.sessionId).toBe(sessionId);
    expect(clearEvent2.clearedBy).toBe(client1Socket.id);
    
    console.log('Both clients received clear all event');

    // Step 6: Verify content is removed from disk
    console.log('Step 6: Verifying content removal from disk...');
    
    // Wait a bit for filesystem operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const finalContentCheck = await checkDirectoryContents(sessionId);
    expect(finalContentCheck.contentCount).toBe(0);
    
    console.log('All content successfully removed from disk');

    // Step 7: Verify database is empty by trying to paginate
    console.log('Step 7: Verifying database cleanup...');
    
    const paginationResult = await new Promise<any>(resolve => {
      client1Socket.emit('paginate-content', {
        sessionId,
        page: 1,
        pageSize: 10
      }, resolve);
    });
    
    expect(paginationResult.success).toBe(true);
    expect(paginationResult.pagination.totalCount).toBe(0);
    expect(paginationResult.content).toHaveLength(0);
    
    console.log('Database confirmed empty - test completed successfully');
    
  }, 60000); // 60 second timeout

  test('should reject clear all from non-session member', async () => {
    console.log('Step 1: Testing unauthorized clear all attempt...');
    
    // Connect a client but don't join the session
    const unauthorizedSocket = io(serverUrl, {
      transports: ['websocket'],
      timeout: 10000
    });
    
    await new Promise(resolve => unauthorizedSocket.on('connect', () => resolve(true)));
    expect(unauthorizedSocket.connected).toBe(true);
    
    // Try to clear all content without being in the session
    const clearResult = await new Promise<any>(resolve => {
      unauthorizedSocket.emit('clear-all-content', { sessionId }, resolve);
    });
    
    expect(clearResult.success).toBe(false);
    expect(clearResult.error).toBe('Not in session');
    
    console.log('Unauthorized clear all correctly rejected');
    
    unauthorizedSocket.disconnect();
  }, 30000);

  test('should handle clear all for non-existent session', async () => {
    console.log('Step 1: Testing clear all for non-existent session...');
    
    const testSocket = io(serverUrl, {
      transports: ['websocket'],
      timeout: 10000
    });
    
    await new Promise(resolve => testSocket.on('connect', () => resolve(true)));
    
    // Try to join a non-existent session first to set session data
    const fakeSessionId = 'non-existent-session-' + Date.now();
    const fingerprint = generateFingerprint(passphrase);
    
    const joinResult = await new Promise<any>(resolve => {
      testSocket.emit('join-session', {
        sessionId: fakeSessionId,
        clientName: 'TestClient',
        fingerprint
      }, resolve);
    });
    
    expect(joinResult.success).toBe(true);
    
    // Now try to clear all content from this session
    const clearResult = await new Promise<any>(resolve => {
      testSocket.emit('clear-all-content', { sessionId: fakeSessionId }, resolve);
    });
    
    // Should succeed but have no effect since no content exists
    expect(clearResult.success).toBe(true);
    
    console.log('Clear all for non-existent session handled correctly');
    
    testSocket.disconnect();
  }, 30000);
});