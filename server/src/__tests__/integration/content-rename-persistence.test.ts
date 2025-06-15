// Test for content rename persistence across session rejoins
process.env.NODE_ENV = 'test';

import { Server } from 'socket.io';
import { createServer } from 'http';
import { setupSocketHandlers } from '../../socket';
import { SessionManager } from '../../services/SessionManager';
import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Content Rename Persistence Across Session Rejoins', () => {
  let server: Server;
  let httpServer: ReturnType<typeof createServer>;
  let sessionManager: SessionManager;
  let chunkStorage: FileSystemChunkStorage;
  let tempDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Create temporary directory for storage
    tempDir = path.join(tmpdir(), `content-rename-persist-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
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
        resolve();
      });
    });
  });

  afterEach(async () => {
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

  it('should persist renamed filenames in storage and serve them correctly', async () => {
    const sessionId = 'test-rename-persistence';
    const originalFileName = 'original-file.txt';
    const renamedFileName = 'renamed-file.txt';
    const contentId = 'test-content-123';
    
    // Step 1: Create content with original filename (following the pattern from working tests)
    await chunkStorage.saveContent({
      contentId,
      sessionId,
      contentType: 'text',
      totalChunks: 1,
      totalSize: 5,
      createdAt: Date.now(),
      encryptionIv: new Uint8Array(12),
      additionalMetadata: JSON.stringify({
        fileName: originalFileName,
        mimeType: 'text/plain',
        size: 5
      }),
      isComplete: true,
      isPinned: false,
      isLargeFile: false
    });

    // Step 2: Verify original filename is stored correctly
    let contentList = await chunkStorage.listContent(sessionId);
    expect(contentList).toHaveLength(1);
    let content = contentList[0];
    console.log('Full content from storage:', JSON.stringify(content, null, 2));
    expect(content.additionalMetadata).toBeDefined();
    
    let metadata = JSON.parse(content.additionalMetadata || '{}');
    expect(metadata.fileName).toBe(originalFileName);
    console.log('Original metadata in storage:', metadata);

    // Step 3: Rename the content using storage layer directly
    const renameResult = await chunkStorage.renameContent(contentId, renamedFileName);
    expect(renameResult.success).toBe(true);

    // Step 4: Verify renamed filename is persisted in storage
    contentList = await chunkStorage.listContent(sessionId);
    expect(contentList).toHaveLength(1);
    content = contentList[0];
    expect(content.additionalMetadata).toBeDefined();
    
    metadata = JSON.parse(content.additionalMetadata || '{}');
    expect(metadata.fileName).toBe(renamedFileName);
    console.log('Renamed metadata in storage:', metadata);

    // Step 5: Test how this content would be served during session join
    // This simulates the exact same logic used in the socket join handler
    for (const content of contentList) {
      if (!content.isComplete) {
        continue;
      }

      // This matches the exact logic from socket/index.ts line 194-209
      const contentToEmit = {
        contentId: content.contentId,
        senderId: 'server',
        senderName: 'Server',
        contentType: content.contentType || 'file',
        timestamp: content.createdAt,
        metadata: content.additionalMetadata ? JSON.parse(content.additionalMetadata) : {},
        isChunked: content.totalChunks > 1,
        totalChunks: content.totalChunks,
        totalSize: content.totalSize,
        isPinned: content.isPinned || false,
        isLargeFile: content.isLargeFile,
        encryptionMetadata: {
          iv: Array.from(content.encryptionIv)
        }
      };

      console.log('Content as it would be served during session join:', JSON.stringify(contentToEmit, null, 2));
      
      // Step 6: Verify the content structure matches expected client structure
      expect(contentToEmit.metadata).toBeDefined();
      expect(contentToEmit.metadata.fileName).toBe(renamedFileName);
      
      // This is the key test: when the client receives this content during session join,
      // it should have the renamed filename available at content.metadata.fileName
      // The client then wraps this in another metadata layer, making it accessible as
      // content.metadata.metadata.fileName in the UI
    }
  }, 10000);
});