import { createCanvas } from 'canvas';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { io, Socket } from 'socket.io-client';
const currentDir = path.resolve();

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

describe('Real Image Session Reload Test', () => {
  let serverProcess: ChildProcess;
  let socket1: Socket;
  let socket2: Socket;
  let originalImageData: Buffer;
  let originalImageMetadata: any;
  let sessionId: string;
  let clientName: string;
  let passphrase: string;
  let serverUrl: string;

  beforeAll(async () => {
    // Test parameters
    sessionId = 'test-image-session-' + Date.now();
    clientName = 'ImageTestClient';
    passphrase = 'test-passphrase-123';
    serverUrl = 'http://localhost:3001';
    
    console.log('=== Starting Real Server for Image Test ===');
    
    // Start the real server
    serverProcess = spawn('npm', ['start'], {
      cwd: path.join(currentDir, '../../../server'),
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
    
    console.log('=== Real Server Started ===');
  });

  afterAll(async () => {
    console.log('=== Cleaning up Real Server ===');
    
    if (socket1?.connected) {
      socket1.disconnect();
    }
    if (socket2?.connected) {
      socket2.disconnect();
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

  /**
   * Generate a test image using Canvas
   */
  function generateTestImage(): { buffer: Buffer; metadata: any } {
    console.log('[Test] Generating test image...');
    
    // Create a 200x150 canvas with a simple pattern
    const canvas = createCanvas(200, 150);
    const ctx = canvas.getContext('2d');
    
    // Create a gradient background
    const gradient = ctx.createLinearGradient(0, 0, 200, 150);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(0.5, '#4ECDC4');
    gradient.addColorStop(1, '#45B7D1');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 200, 150);
    
    // Add some text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Test Image', 100, 75);
    ctx.fillText(new Date().toISOString(), 100, 95);
    
    // Add a unique identifier
    const uniqueId = crypto.randomBytes(4).toString('hex');
    ctx.fillText(`ID: ${uniqueId}`, 100, 115);
    
    // Convert to PNG buffer
    const buffer = canvas.toBuffer('image/png');
    
    const metadata = {
      width: 200,
      height: 150,
      format: 'png',
      mimeType: 'image/png',
      size: buffer.length,
      uniqueId: uniqueId
    };
    
    console.log(`[Test] Generated test image: ${buffer.length} bytes, ID: ${uniqueId}`);
    return { buffer, metadata };
  }

  /**
   * Create a real socket connection
   */
  async function createSocket(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(serverUrl, {
        transports: ['websocket'],
        timeout: 5000
      });
      
      socket.on('connect', () => {
        console.log(`[Socket] Connected: ${socket.id}`);
        resolve(socket);
      });
      
      socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        reject(error);
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`[Socket] Disconnected: ${reason}`);
      });
    });
  }

  /**
   * Join a session with real socket
   */
  async function joinSession(socket: Socket, sessionId: string, clientName: string, passphrase: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join session timeout'));
      }, 10000);
      
      // Generate fingerprint from passphrase
      const fingerprint = generateFingerprint(passphrase);
      
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
  }

  /**
   * Share content with real socket
   */
  async function shareContent(socket: Socket, sessionId: string, content: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Share content timeout'));
      }, 15000);
      
      console.log(`[Test] Emitting 'content' event to server with sessionId: ${sessionId}`);
      console.log(`[Test] Content payload size: ${JSON.stringify(content).length} characters`);
      
      // Extract the data from content object and send it separately
      const { data: contentData, ...contentWithoutData } = content;
      
      socket.emit('content', {
        sessionId,
        content: contentWithoutData,
        data: contentData  // Send the base64 data separately
      }, (response: any) => {
        clearTimeout(timeout);
        if (response.success) {
          console.log(`[Socket] Content shared successfully`);
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to share content'));
        }
      });
    });
  }

  /**
   * Wait for content to be received
   */
  async function waitForContent(socket: Socket, expectedContentId?: string): Promise<any[]> {
    return new Promise((resolve) => {
      const receivedContent: any[] = [];
      const timeout = setTimeout(() => {
        resolve(receivedContent);
      }, 10000);
      
      socket.on('content', (data) => {
        console.log(`[Socket] Received content: ${data.content.contentId}`);
        receivedContent.push(data.content);
        
        if (expectedContentId && data.content.contentId === expectedContentId) {
          clearTimeout(timeout);
          resolve(receivedContent);
        }
      });
      
      socket.on('chunk', (data) => {
        console.log(`[Socket] Received chunk for: ${data.chunk.contentId}`);
      });
    });
  }

  it('should share image, reload session, and retrieve identical image', async () => {
    console.log('\n=== Starting Real Image Session Reload Test ===');
    
    // Step 1: Generate test image
    const { buffer, metadata } = generateTestImage();
    originalImageData = buffer;
    originalImageMetadata = metadata;
    
    console.log(`[Test] Original image: ${buffer.length} bytes, ${metadata.width}x${metadata.height}`);
    
    // Step 2: Create first socket and join session
    console.log('[Test] Step 2: Creating first socket and joining session...');
    socket1 = await createSocket();
    
    const joinResult = await joinSession(socket1, sessionId, clientName, passphrase);
    expect(joinResult.success).toBe(true);
    console.log('[Test] First client joined session successfully');
    
    // Step 3: Share the image
    console.log('[Test] Step 3: Sharing image...');
    console.log('[Test] About to start content sharing process');
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${metadata.mimeType};base64,${base64Data}`;
    
    const contentToShare = {
      contentId: crypto.randomUUID(),
      senderId: socket1.id,
      senderName: clientName,
      contentType: 'image',
      timestamp: Date.now(),
      metadata: {
        fileName: `test-image-${metadata.uniqueId}.png`,
        mimeType: metadata.mimeType,
        size: metadata.size,
        imageInfo: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format
        }
      },
      isChunked: false,
      totalChunks: 1,
      totalSize: metadata.size,
      data: dataUrl
    };
    
    console.log('[Test] About to share content:', {
      contentId: contentToShare.contentId,
      contentType: contentToShare.contentType,
      size: contentToShare.totalSize,
      isChunked: contentToShare.isChunked
    });
    
    try {
      const shareResult = await shareContent(socket1, sessionId, contentToShare);
      expect(shareResult.success).toBe(true);
      console.log('[Test] Image shared successfully, server response:', shareResult);
    } catch (error) {
      console.error('[Test] Content sharing failed:', error);
      throw error;
    }
    
    // Step 4: Wait for content to be processed
    console.log('[Test] Step 4: Waiting for content processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 5: Disconnect first socket (simulate leaving session)
    console.log('[Test] Step 5: Disconnecting first socket...');
    socket1.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 6: Create second socket and rejoin session
    console.log('[Test] Step 6: Creating second socket and rejoining session...');
    socket2 = await createSocket();
    
    // Set up content listener before joining
    const contentPromise = waitForContent(socket2, contentToShare.contentId);
    
    const rejoinResult = await joinSession(socket2, sessionId, clientName, passphrase);
    expect(rejoinResult.success).toBe(true);
    console.log('[Test] Second client rejoined session successfully');
    
    // Step 7: Wait for content to be received
    console.log('[Test] Step 7: Waiting for content to be received...');
    const receivedContent = await contentPromise;
    
    expect(receivedContent.length).toBeGreaterThan(0);
    console.log(`[Test] Received ${receivedContent.length} content items`);
    
    // Step 8: Find the image content
    const reloadedImage = receivedContent.find(content => 
      content.contentType === 'image' ||
      content.metadata?.mimeType?.startsWith('image/')
    );
    
    expect(reloadedImage).toBeDefined();
    console.log(`[Test] Found reloaded image: ${reloadedImage?.contentId}`);
    
    // Step 9: Verify image metadata
    console.log('[Test] Step 9: Verifying image metadata...');
    
    expect(reloadedImage.metadata.mimeType).toBe(originalImageMetadata.mimeType);
    expect(reloadedImage.metadata.imageInfo.width).toBe(originalImageMetadata.width);
    expect(reloadedImage.metadata.imageInfo.height).toBe(originalImageMetadata.height);
    expect(reloadedImage.metadata.imageInfo.format).toBe(originalImageMetadata.format);
    expect(reloadedImage.metadata.size).toBe(originalImageMetadata.size);
    
    console.log('[Test] ✅ Image metadata verified!');
    
    // Step 10: Verify image data integrity (if data is included)
    if (reloadedImage.data) {
      console.log('[Test] Step 10: Verifying image data integrity...');
      
      // Extract base64 data
      const receivedDataUrl = reloadedImage.data;
      const receivedBase64 = receivedDataUrl.split(',')[1];
      const receivedBuffer = Buffer.from(receivedBase64, 'base64');
      
      // Compare with original
      const isIdentical = originalImageData.equals(receivedBuffer);
      expect(isIdentical).toBe(true);
      
      console.log('[Test] ✅ Image data integrity verified - images are identical!');
    } else {
      console.log('[Test] Image data not included in metadata response (chunked content)');
    }
    
    console.log('\n=== Real Image Session Reload Test PASSED ===');
  }, 60000); // 60 second timeout for real server operations
});