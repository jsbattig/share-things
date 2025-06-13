// Set NODE_ENV to 'test' for integration tests
process.env.NODE_ENV = 'test';

import { Server } from 'socket.io';
import { createServer } from 'http';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from '../../socket';
import { SessionManager } from '../../services/SessionManager';
import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Content Renaming Socket Integration', () => {
  let server: Server;
  let httpServer: ReturnType<typeof createServer>;
  let clientSocket: ClientSocket;
  let sessionManager: SessionManager;
  let chunkStorage: FileSystemChunkStorage;
  let tempDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Create temporary directory for storage
    tempDir = path.join(tmpdir(), `socket-rename-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(tempDir, { recursive: true });

    // Set up HTTP server and Socket.IO
    httpServer = createServer();
    server = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Set up services
    sessionManager = new SessionManager({
      dbPath: ':memory:'
    });
    await sessionManager.initialize();
    
    chunkStorage = new FileSystemChunkStorage({
      storagePath: tempDir
    });
    await chunkStorage.initialize();

    // Set up socket handlers
    const result = setupSocketHandlers(server, sessionManager, chunkStorage);
    cleanup = result.cleanup;

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        const port = typeof address === 'object' && address ? address.port : 3001;
        
        // Connect client
        clientSocket = ClientIO(`http://localhost:${port}`, {
          transports: ['websocket'],
          forceNew: true
        });

        clientSocket.on('connect', () => {
          resolve();
        });
      });
    });
  });

  afterEach(async () => {
    // Clean up
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    
    if (cleanup) {
      await cleanup();
    }
    
    if (httpServer) {
      httpServer.close();
    }

    // Clean up session manager
    if (sessionManager) {
      await sessionManager.stop();
    }

    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Cleanup warning: ${error}`);
    }
  });

  describe('rename-content socket event', () => {
    const sessionId = 'test-session-rename';
    const clientName = 'Test Client';
    let sessionToken: string;

    beforeEach(async () => {
      // Join session first
      await new Promise<void>((resolve, reject) => {
        clientSocket.emit('join', {
          sessionId,
          clientName,
          fingerprint: {
            iv: Array.from(new Uint8Array(12)),
            encryptedData: Array.from(new Uint8Array(32))
          }
        }, (response: { success: boolean; token?: string; error?: string }) => {
          if (response.success && response.token) {
            sessionToken = response.token;
            resolve();
          } else {
            reject(new Error(response.error || 'Failed to join session'));
          }
        });
      });
    });

    it('should successfully rename content and broadcast to all clients', async () => {
      const contentId = 'test-content-rename-123';
      const originalName = 'original-document.pdf';
      const newName = 'renamed-document.pdf';

      // First, create some content in storage
      await chunkStorage.saveContent({
        contentId,
        sessionId,
        contentType: 'file',
        totalChunks: 1,
        totalSize: 1024,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: JSON.stringify({
          fileName: originalName,
          mimeType: 'application/pdf',
          size: 1024
        }),
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Set up listener for broadcast event
      const broadcastPromise = new Promise<{ contentId: string; newName: string; senderId: string; senderName: string }>((resolve) => {
        clientSocket.on('content-renamed', (data) => {
          resolve(data);
        });
      });

      // Perform rename
      const renamePromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
        clientSocket.emit('rename-content', {
          sessionId,
          contentId,
          newName,
          token: sessionToken
        }, (response: { success: boolean; error?: string }) => {
          resolve(response);
        });
      });

      // Wait for both rename response and broadcast
      const [renameResponse, broadcastData] = await Promise.all([renamePromise, broadcastPromise]);

      // Verify rename was successful
      expect(renameResponse.success).toBe(true);
      expect(renameResponse.error).toBeUndefined();

      // Verify broadcast data
      expect(broadcastData.contentId).toBe(contentId);
      expect(broadcastData.newName).toBe(newName);
      expect(broadcastData.senderId).toBe(clientSocket.id);
      expect(broadcastData.senderName).toBe(clientName);

      // Verify content was actually renamed in storage
      const content = await chunkStorage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(newName);
      }
    });

    it('should reject rename with invalid session token', async () => {
      const contentId = 'test-content-invalid-token';
      const newName = 'new-name.txt';

      const renamePromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
        clientSocket.emit('rename-content', {
          sessionId,
          contentId,
          newName,
          token: 'invalid-token'
        }, (response: { success: boolean; error?: string }) => {
          resolve(response);
        });
      });

      const response = await renamePromise;

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Invalid session token');
    });

    it('should reject rename with empty name', async () => {
      const contentId = 'test-content-empty-name';
      const emptyName = '';

      const renamePromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
        clientSocket.emit('rename-content', {
          sessionId,
          contentId,
          newName: emptyName,
          token: sessionToken
        }, (response: { success: boolean; error?: string }) => {
          resolve(response);
        });
      });

      const response = await renamePromise;

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Name cannot be empty');
    });

    it('should reject rename for non-existent content', async () => {
      const nonExistentId = 'non-existent-content-123';
      const newName = 'some-name.txt';

      const renamePromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
        clientSocket.emit('rename-content', {
          sessionId,
          contentId: nonExistentId,
          newName,
          token: sessionToken
        }, (response: { success: boolean; error?: string }) => {
          resolve(response);
        });
      });

      const response = await renamePromise;

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Content not found');
    });

    it('should reject rename from client not in session', async () => {
      const contentId = 'test-content-wrong-session';
      const newName = 'renamed.txt';
      const wrongSessionId = 'wrong-session-id';

      const renamePromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
        clientSocket.emit('rename-content', {
          sessionId: wrongSessionId,
          contentId,
          newName,
          token: sessionToken
        }, (response: { success: boolean; error?: string }) => {
          resolve(response);
        });
      });

      const response = await renamePromise;

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Not in session');
    });

    it('should handle rename with whitespace trimming', async () => {
      const contentId = 'test-content-whitespace';
      const originalName = 'original.txt';
      const nameWithWhitespace = '  trimmed-name.txt  ';
      const expectedName = 'trimmed-name.txt';

      // Create content
      await chunkStorage.saveContent({
        contentId,
        sessionId,
        contentType: 'text',
        totalChunks: 1,
        totalSize: 100,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: JSON.stringify({
          fileName: originalName,
          mimeType: 'text/plain',
          size: 100
        }),
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Set up listener for broadcast event
      const broadcastPromise = new Promise<{ contentId: string; newName: string }>((resolve) => {
        clientSocket.on('content-renamed', (data) => {
          resolve(data);
        });
      });

      // Perform rename with whitespace
      const renamePromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
        clientSocket.emit('rename-content', {
          sessionId,
          contentId,
          newName: nameWithWhitespace,
          token: sessionToken
        }, (response: { success: boolean; error?: string }) => {
          resolve(response);
        });
      });

      // Wait for both rename response and broadcast
      const [renameResponse, broadcastData] = await Promise.all([renamePromise, broadcastPromise]);

      // Verify rename was successful
      expect(renameResponse.success).toBe(true);

      // Verify broadcast data contains trimmed name
      expect(broadcastData.contentId).toBe(contentId);
      expect(broadcastData.newName).toBe(expectedName);

      // Verify content was renamed with trimmed name
      const content = await chunkStorage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(expectedName);
      }
    });
  });
});