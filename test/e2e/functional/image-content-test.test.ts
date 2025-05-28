import { createCanvas } from 'canvas';
import * as crypto from 'crypto';
import * as path from 'path';
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
 * Simple encryption for test (using Node.js crypto)
 */
function encryptDataSimple(data: Uint8Array, passphrase: string): { encryptedData: Uint8Array; iv: Uint8Array } {
  // Create a simple deterministic IV for testing
  const iv = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    iv[i] = (i * 13 + 7) % 256;
  }
  
  // Simple XOR encryption for testing (not secure, but matches what server expects)
  const key = crypto.createHash('sha256').update(passphrase).digest();
  const encryptedData = new Uint8Array(data.length + 16); // Add 16 bytes for "auth tag"
  
  // XOR with key
  for (let i = 0; i < data.length; i++) {
    encryptedData[i] = data[i] ^ key[i % key.length];
  }
  
  // Add fake auth tag
  for (let i = 0; i < 16; i++) {
    encryptedData[data.length + i] = i;
  }
  
  return { encryptedData, iv };
}

describe('Image Content Type Test', () => {
  let serverProcess: ChildProcess;
  let socket: Socket;
  let sessionId: string;
  let clientName: string;
  let passphrase: string;
  let serverUrl: string;

  beforeAll(async () => {
    // Set up WebCrypto mock for Node.js environment
    if (!global.crypto || !global.crypto.subtle) {
      const mockCrypto = {
        subtle: {
          importKey: async () => ({ type: 'secret' }),
          deriveKey: async () => ({ type: 'secret' }),
          encrypt: async (algorithm: any, key: any, data: Uint8Array) => {
            // Simple mock encryption - just return the data with some modification
            const result = new Uint8Array(data.length + 16); // Add 16 bytes for "auth tag"
            result.set(data);
            return result.buffer;
          },
          decrypt: async (algorithm: any, key: any, data: ArrayBuffer) => {
            // Simple mock decryption - just return the data minus the last 16 bytes
            const view = new Uint8Array(data);
            return view.slice(0, -16).buffer;
          }
        },
        getRandomValues: (array: Uint8Array) => {
          // Fill array with deterministic "random" values
          for (let i = 0; i < array.length; i++) {
            array[i] = (i * 13 + 7) % 256; // Simple deterministic pattern
          }
          return array;
        }
      };
      
      global.crypto = mockCrypto as any;
      console.log('WebCrypto mock installed for image content test');
    }
    
    // Test parameters
    sessionId = 'test-image-content-' + Date.now();
    clientName = 'ImageTestClient';
    passphrase = 'test-passphrase-123';
    serverUrl = 'http://localhost:3001';
    
    console.log('=== Cleaning up database before test ===');
    
    // Clean up the database to start with a predictable state
    try {
      // spawn is already imported at the top
      const cleanupProcess = spawn('node', ['scripts/cleanup-all-content.js'], {
        cwd: path.join(__dirname, '../../../server'),
        stdio: 'pipe'
      });
      
      await new Promise((resolve, reject) => {
        let output = '';
        cleanupProcess.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });
        cleanupProcess.stderr.on('data', (data: Buffer) => {
          console.error('Cleanup error:', data.toString());
        });
        cleanupProcess.on('close', (code: number) => {
          if (code === 0) {
            console.log('Database cleanup completed successfully');
            resolve(void 0);
          } else {
            reject(new Error(`Cleanup failed with code ${code}`));
          }
        });
      });
    } catch (error) {
      console.error('Failed to cleanup database:', error);
      throw error;
    }
    
    console.log('=== Starting Server for Image Content Test ===');
    
    // Start the real server
    serverProcess = spawn('npm', ['start'], {
      cwd: path.join(__dirname, '../../../server'),
      env: { ...process.env, PORT: '3001' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);
      
      serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('[Server]', output);
        if (output.includes('Server running on port 3001') || output.includes('listening on')) {
          clearTimeout(timeout);
          resolve(void 0);
        }
      });
      
      serverProcess.stderr?.on('data', (data) => {
        console.error('[Server Error]', data.toString());
      });
      
      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    
    console.log('=== Server Started ===');
  });

  afterAll(async () => {
    console.log('=== Cleaning up Server ===');
    
    if (socket?.connected) {
      socket.disconnect();
    }
    
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 5000); // Force exit after 5 seconds
      });
    }
  });

  it('should correctly store and retrieve image content with proper MIME type', async () => {
    console.log('\n=== Starting Image Content Type Test ===');
    
    // Step 1: Create socket and connect
    console.log('[Test] Step 1: Creating socket...');
    socket = io(serverUrl, {
      transports: ['websocket'],
      timeout: 5000
    });
    
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log(`[Socket] Connected: ${socket.id}`);
        resolve(void 0);
      });
      
      socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        reject(error);
      });
    });
    
    // Step 2: Join session
    console.log('[Test] Step 2: Joining session...');
    const fingerprint = generateFingerprint(passphrase);
    
    const joinResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join session timeout'));
      }, 10000);
      
      socket.emit('join', {
        sessionId,
        clientName,
        fingerprint
      }, (response: any) => {
        clearTimeout(timeout);
        if (response.success) {
          console.log(`[Socket] Joined session: ${sessionId}`);
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to join session'));
        }
      });
    });
    
    expect(joinResult).toBeDefined();
    console.log('[Test] Successfully joined session');
    
    // Step 3: Generate test image
    console.log('[Test] Step 3: Generating test image...');
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    
    // Create a simple test image
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '20px Arial';
    ctx.fillText('TEST', 25, 55);
    
    const imageBuffer = canvas.toBuffer('image/png');
    const base64Data = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Data}`;
    
    console.log(`[Test] Generated PNG image: ${imageBuffer.length} bytes`);
    
    // Step 4: Share the image content (matching browser behavior exactly)
    console.log('[Test] Step 4: Sharing image content...');
    
    const contentId = crypto.randomUUID();
    const content = {
      contentId,
      senderId: socket.id,
      senderName: clientName,
      contentType: 'image', // Browser uses ContentType.IMAGE enum, but this should work
      timestamp: Date.now(),
      metadata: {
        fileName: 'test-image.png',
        mimeType: 'image/png',
        size: imageBuffer.length,
        imageInfo: {
          width: 100,
          height: 100,
          format: 'png'
        }
      },
      isChunked: false, // Small image, not chunked
      totalChunks: 1,
      totalSize: imageBuffer.length
    };
    
    console.log('[Test] About to encrypt and emit image content...');
    console.log(`[Test] Content type: ${content.contentType}`);
    console.log(`[Test] MIME type: ${content.metadata.mimeType}`);
    console.log(`[Test] Socket connected: ${socket.connected}`);
    console.log(`[Test] Socket ID: ${socket.id}`);
    
    // Encrypt the data using simple encryption for testing
    const { encryptedData, iv } = encryptDataSimple(new Uint8Array(imageBuffer), passphrase);
    
    // Convert to base64 for transmission (exactly like browser)
    const base64 = btoa(
      Array.from(new Uint8Array(encryptedData))
        .map(byte => String.fromCharCode(byte))
        .join('')
    );
    
    // Include IV with content metadata (exactly like browser)
    const encryptedContent = {
      ...content,
      encryptionMetadata: {
        iv: Array.from(iv)
      }
    };
    
    console.log('[Test] Encrypted data length:', base64.length);
    console.log('[Test] IV:', Array.from(iv));
    
    const shareResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Share content timeout'));
      }, 15000);
      
      // Send exactly like the browser: sendContent(sessionId, encryptedContent, base64)
      socket.emit('content', {
        sessionId,
        content: encryptedContent,
        data: base64
      }, (response: any) => {
        clearTimeout(timeout);
        console.log('[Test] Server response:', response);
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to share content'));
        }
      });
    });
    
    expect(shareResult).toBeDefined();
    console.log('[Test] ✅ Image content shared successfully!');
    
    // Step 5: Wait for content to be processed
    console.log('[Test] Step 5: Waiting for content processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 6: Disconnect and reconnect to test persistence
    console.log('[Test] Step 6: Disconnecting and reconnecting...');
    socket.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create new socket
    socket = io(serverUrl, {
      transports: ['websocket'],
      timeout: 5000
    });
    
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log(`[Socket] Reconnected: ${socket.id}`);
        resolve(void 0);
      });
      
      socket.on('connect_error', (error) => {
        console.error('[Socket] Reconnection error:', error);
        reject(error);
      });
    });
    
    // Step 7: Rejoin session and check content
    console.log('[Test] Step 7: Rejoining session...');
    
    // Set up content listener
    const contentPromise = new Promise((resolve) => {
      const receivedContent: any[] = [];
      const timeout = setTimeout(() => {
        resolve(receivedContent);
      }, 10000);
      
      socket.on('content', (data) => {
        console.log(`[Socket] Received content: ${data.content.contentId}`);
        console.log(`[Socket] Content type: ${data.content.contentType}`);
        console.log(`[Socket] Content metadata:`, data.content.metadata);
        receivedContent.push(data.content);
        
        if (data.content.contentId === contentId) {
          clearTimeout(timeout);
          resolve(receivedContent);
        }
      });
    });
    
    const rejoinResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Rejoin session timeout'));
      }, 10000);
      
      socket.emit('join', {
        sessionId,
        clientName,
        fingerprint
      }, (response: any) => {
        clearTimeout(timeout);
        if (response.success) {
          console.log(`[Socket] Rejoined session: ${sessionId}`);
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to rejoin session'));
        }
      });
    });
    
    expect(rejoinResult).toBeDefined();
    console.log('[Test] Successfully rejoined session');
    
    // Step 8: Wait for content to be received
    console.log('[Test] Step 8: Waiting for content to be received...');
    const receivedContent = await contentPromise;
    
    expect(Array.isArray(receivedContent)).toBe(true);
    const contentArray = receivedContent as any[];
    expect(contentArray.length).toBeGreaterThan(0);
    console.log(`[Test] Received ${contentArray.length} content items`);
    
    // Step 9: Verify image content
    const imageContent = contentArray.find((content: any) =>
      content.contentId === contentId
    );
    
    expect(imageContent).toBeDefined();
    console.log('[Test] Found image content in received items');
    
    // Step 10: Verify content type and metadata
    console.log('[Test] Step 10: Verifying content type and metadata...');
    
    expect(imageContent.contentType).toBe('image');
    console.log(`[Test] ✅ Content type correct: ${imageContent.contentType}`);
    
    // Check if metadata contains image information
    expect(imageContent.metadata).toBeDefined();
    if (imageContent.metadata) {
      console.log(`[Test] Content metadata:`, imageContent.metadata);
      
      // The metadata should contain image-specific information
      expect(imageContent.metadata.imageInfo).toBeDefined();
      expect(imageContent.metadata.imageInfo.width).toBe(800);
      expect(imageContent.metadata.imageInfo.height).toBe(600);
      expect(imageContent.metadata.imageInfo.format).toBe('png');
      
      console.log('[Test] ✅ Image metadata verified!');
    }
    
    console.log('\n=== Image Content Type Test PASSED ===');
  }, 60000); // 60 second timeout
});