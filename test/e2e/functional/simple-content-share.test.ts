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

describe('Simple Content Share Test', () => {
  let serverProcess: ChildProcess;
  let socket: Socket;
  let sessionId: string;
  let clientName: string;
  let passphrase: string;
  let serverUrl: string;

  beforeAll(async () => {
    // Test parameters
    sessionId = 'test-simple-share-' + Date.now();
    clientName = 'TestClient';
    passphrase = 'test-passphrase-123';
    serverUrl = 'http://localhost:3001';
    
    console.log('=== Starting Server for Simple Content Share Test ===');
    
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

  it('should successfully share content', async () => {
    console.log('\n=== Starting Simple Content Share Test ===');
    
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
    
    // Step 3: Share simple text content
    console.log('[Test] Step 3: Sharing simple text content...');
    
    const contentToShare = {
      contentId: crypto.randomUUID(),
      senderId: socket.id,
      senderName: clientName,
      contentType: 'text',
      timestamp: Date.now(),
      metadata: {
        fileName: 'test.txt',
        mimeType: 'text/plain',
        size: 11
      },
      isChunked: false,
      totalChunks: 1,
      totalSize: 11,
      data: 'Hello World'
    };
    
    console.log('[Test] About to emit content event...');
    
    const shareResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Share content timeout'));
      }, 15000);
      
      socket.emit('content', {
        sessionId,
        content: contentToShare
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
    console.log('[Test] ✅ Content shared successfully!');
    
  }, 30000); // 30 second timeout
});