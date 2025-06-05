import { Server } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { setupSocketHandlers } from '../../socket';
import { SessionManager, PassphraseFingerprint } from '../../services/SessionManager';
import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { storageConfig } from '../../infrastructure/config/storage.config';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Type definitions for test responses
interface JoinResponse {
  success: boolean;
  error?: string;
}

interface ContentData {
  content: {
    contentId: string;
    totalSize: number;
    isLargeFile: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ChunkData {
  [key: string]: unknown;
}

describe('Large File Support Integration', () => {
  let httpServer: HttpServer;
  let io: Server;
  let sessionManager: SessionManager;
  let chunkStorage: FileSystemChunkStorage;
  let clientSocket1: ClientSocket;
  let clientSocket2: ClientSocket;
  let port: number;
  let testStoragePath: string;

  const testSessionId = 'test-session-large-files';
  const testFingerprint: PassphraseFingerprint = {
    iv: Array.from(crypto.randomBytes(12)),
    data: Array.from(crypto.randomBytes(32))
  };

  beforeAll(async () => {
    // Create test storage directory
    testStoragePath = path.join(__dirname, '../../../test-data/large-file-test');
    await fs.mkdir(testStoragePath, { recursive: true });

    // Create HTTP server
    httpServer = createServer();
    
    // Create Socket.IO server
    io = new Server(httpServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    // Create session manager
    const dbPath = path.join(testStoragePath, 'test-sessions.db');
    sessionManager = new SessionManager({
      sessionTimeout: 300000, // 5 minutes
      dbPath
    });

    // Create chunk storage
    chunkStorage = new FileSystemChunkStorage({
      storagePath: testStoragePath
    });

    // Initialize components
    await sessionManager.initialize();
    await chunkStorage.initialize();

    // Set up socket handlers
    setupSocketHandlers(io, sessionManager, chunkStorage);

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up
    if (clientSocket1?.connected) clientSocket1.disconnect();
    if (clientSocket2?.connected) clientSocket2.disconnect();
    
    await sessionManager.stop();
    await chunkStorage.close();
    
    httpServer.close();

    // Clean up test files
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test storage:', error);
    }
  });

  beforeEach(async () => {
    // Create fresh client connections
    clientSocket1 = Client(`http://localhost:${port}`);
    clientSocket2 = Client(`http://localhost:${port}`);

    // Wait for connections
    await Promise.all([
      new Promise<void>((resolve) => clientSocket1.on('connect', resolve)),
      new Promise<void>((resolve) => clientSocket2.on('connect', resolve))
    ]);
  });

  afterEach(async () => {
    if (clientSocket1?.connected) clientSocket1.disconnect();
    if (clientSocket2?.connected) clientSocket2.disconnect();
    
    // Clean up session and content from database
    try {
      await chunkStorage.cleanupAllSessionContent(testSessionId);
      // Remove session from session manager
      await sessionManager.removeSession(testSessionId);
    } catch (error) {
      console.warn('Failed to clean up session in afterEach:', error);
    }
  });

  describe('15MB File Handling', () => {
    test('should handle 15MB file upload without broadcasting chunks', async () => {
      // Create 15MB test data
      const fileSize = 15 * 1024 * 1024; // 15MB
      const contentId = 'large-file-test-' + Date.now();

      // Join session with both clients
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          clientSocket1.emit('join', {
            sessionId: testSessionId,
            clientName: 'Client1',
            fingerprint: testFingerprint
          }, (response: JoinResponse) => {
            if (response.success) resolve();
            else reject(new Error(response.error));
          });
        }),
        new Promise<void>((resolve, reject) => {
          clientSocket2.emit('join', {
            sessionId: testSessionId,
            clientName: 'Client2',
            fingerprint: testFingerprint
          }, (response: JoinResponse) => {
            if (response.success) resolve();
            else reject(new Error(response.error));
          });
        })
      ]);

      // Track what client2 receives
      const client2ReceivedContent: ContentData[] = [];
      const client2ReceivedChunks: ChunkData[] = [];

      clientSocket2.on('content', (data) => {
        client2ReceivedContent.push(data);
      });

      clientSocket2.on('chunk', (data) => {
        client2ReceivedChunks.push(data);
      });

      // Send large file metadata from client1
      await new Promise<void>((resolve, reject) => {
        clientSocket1.emit('content', {
          sessionId: testSessionId,
          content: {
            contentId,
            contentType: 'application/octet-stream',
            totalSize: fileSize,
            isChunked: true,
            totalChunks: Math.ceil(fileSize / (64 * 1024)), // 64KB chunks
            metadata: {
              fileName: 'large-test-file.bin',
              mimeType: 'application/octet-stream'
            },
            encryptionMetadata: {
              iv: Array.from(crypto.randomBytes(12))
            }
          }
        }, (response: JoinResponse) => {
          if (response.success) resolve();
          else reject(new Error(response.error));
        });
      });

      // Wait a bit for any potential broadcasts
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify client2 received metadata but marked as large file
      expect(client2ReceivedContent).toHaveLength(1);
      expect(client2ReceivedContent[0].content.contentId).toBe(contentId);
      expect(client2ReceivedContent[0].content.totalSize).toBe(fileSize);
      expect(client2ReceivedContent[0].content.isLargeFile).toBe(true);

      // Verify client2 did NOT receive any chunks
      expect(client2ReceivedChunks).toHaveLength(0);

      // Verify content is stored on server
      const storedContent = await chunkStorage.getContentMetadata(contentId);
      expect(storedContent).toBeTruthy();
      expect(storedContent?.totalSize).toBe(fileSize);
      expect(storedContent?.isLargeFile).toBe(true);
    });

    test('should provide download streaming for large files', async () => {
      const fileSize = 15 * 1024 * 1024; // 15MB
      const testData = crypto.randomBytes(fileSize);
      const contentId = 'large-file-download-test-' + Date.now();
      const chunkSize = 64 * 1024; // 64KB chunks
      const totalChunks = Math.ceil(fileSize / chunkSize);

      // Manually create a large file in storage for testing download
      const iv = crypto.randomBytes(12);
      
      // Save chunks to storage
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkData = testData.slice(start, end);

        await chunkStorage.saveChunk(chunkData, {
          contentId,
          sessionId: testSessionId,
          chunkIndex: i,
          totalChunks,
          size: chunkData.length,
          iv: new Uint8Array(iv),
          contentType: 'application/octet-stream',
          mimeType: 'application/octet-stream'
        });
      }

      // Mark as complete and large file
      await chunkStorage.markContentComplete(contentId);

      // Test streaming download
      const downloadedChunks: Buffer[] = [];
      let totalDownloadedSize = 0;

      await chunkStorage.streamContentForDownload(contentId, async (chunk, metadata) => {
        downloadedChunks.push(Buffer.from(chunk));
        totalDownloadedSize += chunk.length;
        
        // Verify chunk metadata
        expect(metadata.contentId).toBe(contentId);
        expect(metadata.sessionId).toBe(testSessionId);
        expect(metadata.totalChunks).toBe(totalChunks);
      });

      // Verify all data was streamed correctly
      expect(totalDownloadedSize).toBe(fileSize);
      expect(downloadedChunks).toHaveLength(totalChunks);

      // Verify data integrity
      const downloadedData = Buffer.concat(downloadedChunks);
      expect(downloadedData.length).toBe(fileSize);
      expect(downloadedData.equals(testData)).toBe(true);
    });

    test('should handle remove operation for large files', async () => {
      const fileSize = 15 * 1024 * 1024; // 15MB
      const contentId = 'large-file-remove-test-' + Date.now();
      const chunkSize = 64 * 1024;
      const totalChunks = Math.ceil(fileSize / chunkSize);

      // Create test data and save to storage
      const testData = crypto.randomBytes(fileSize);
      const iv = crypto.randomBytes(12);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkData = testData.slice(start, end);

        await chunkStorage.saveChunk(chunkData, {
          contentId,
          sessionId: testSessionId,
          chunkIndex: i,
          totalChunks,
          size: chunkData.length,
          iv: new Uint8Array(iv),
          contentType: 'application/octet-stream'
        });
      }

      await chunkStorage.markContentComplete(contentId);

      // Verify content exists
      let contentMeta = await chunkStorage.getContentMetadata(contentId);
      expect(contentMeta).toBeTruthy();

      // Remove content
      const removeResult = await chunkStorage.removeContent(contentId);
      expect(removeResult.success).toBe(true);

      // Verify content is removed
      contentMeta = await chunkStorage.getContentMetadata(contentId);
      expect(contentMeta).toBeNull();

      // Verify chunks are removed
      for (let i = 0; i < totalChunks; i++) {
        const chunk = await chunkStorage.getChunk(contentId, i);
        expect(chunk).toBeNull();
      }
    });

    test('should respect large file threshold configuration', async () => {
      // Test with file just under threshold
      const smallFileSize = storageConfig.largeFileThreshold - 1000; // Just under 10MB
      const largeFileSize = storageConfig.largeFileThreshold + 1000; // Just over 10MB

      // Join session
      await new Promise<void>((resolve, reject) => {
        clientSocket1.emit('join', {
          sessionId: testSessionId,
          clientName: 'Client1',
          fingerprint: testFingerprint
        }, (response: JoinResponse) => {
          if (response.success) resolve();
          else reject(new Error(response.error));
        });
      });

      // Test small file (should be treated as regular file)
      const smallContentId = 'small-file-test-' + Date.now();
      await new Promise<void>((resolve, reject) => {
        clientSocket1.emit('content', {
          sessionId: testSessionId,
          content: {
            contentId: smallContentId,
            contentType: 'application/octet-stream',
            totalSize: smallFileSize,
            isChunked: false,
            totalChunks: 1,
            metadata: { fileName: 'small-file.bin' }
          }
        }, (response: JoinResponse) => {
          if (response.success) resolve();
          else reject(new Error(response.error));
        });
      });

      // Test large file (should be treated as large file)
      const largeContentId = 'large-file-test-' + Date.now();
      await new Promise<void>((resolve, reject) => {
        clientSocket1.emit('content', {
          sessionId: testSessionId,
          content: {
            contentId: largeContentId,
            contentType: 'application/octet-stream',
            totalSize: largeFileSize,
            isChunked: true,
            totalChunks: Math.ceil(largeFileSize / (64 * 1024)),
            metadata: { fileName: 'large-file.bin' }
          }
        }, (response: JoinResponse) => {
          if (response.success) resolve();
          else reject(new Error(response.error));
        });
      });

      // Verify small file is not marked as large
      const smallFileMeta = await chunkStorage.getContentMetadata(smallContentId);
      expect(smallFileMeta?.isLargeFile).toBe(false);

      // Verify large file is marked as large
      const largeFileMeta = await chunkStorage.getContentMetadata(largeContentId);
      expect(largeFileMeta?.isLargeFile).toBe(true);
    });
  });
});