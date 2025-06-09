import { Server } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { setupSocketHandlers } from '../../socket';
import { SessionManager, PassphraseFingerprint } from '../../services/SessionManager';
import { ContentMetadata } from '../../domain/ChunkStorage.interface';

// Helper function to create test content in storage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestContent(chunkStorage: any, sessionId: string, count = 25) {
  console.log(`[TEST] Creating ${count} test content items for session ${sessionId}`);
  
  for (let i = 0; i < count; i++) {
    const contentId = `mock-content-${i}`;
    const testData = `Test content ${i}`;
    const encryptedData = Buffer.from(testData);
    const iv = new Uint8Array(12);
    
    // Create content metadata directly using saveContent method
    const contentMetadata = {
      contentId,
      sessionId,
      contentType: 'text',
      totalChunks: 1,
      totalSize: encryptedData.length,
      createdAt: Date.now(),
      isComplete: true,
      encryptionIv: iv,
      additionalMetadata: JSON.stringify({
        mimeType: 'text/plain',
        index: i
      }),
      isPinned: false,
      isLargeFile: false
    };
    
    // Save content metadata directly
    await chunkStorage.saveContent(contentMetadata);
    
    // Save the chunk
    await chunkStorage.saveChunk(
      new Uint8Array(encryptedData),
      {
        contentId,
        sessionId,
        chunkIndex: 0,
        totalChunks: 1,
        size: encryptedData.length,
        iv,
        contentType: 'text',
        mimeType: 'text/plain'
      }
    );
  }
  
  console.log(`[TEST] Created ${count} test content items successfully`);
}

interface JoinResult {
  success: boolean;
  error?: string;
  token?: string;
  content?: ContentMetadata[];
  totalCount?: number;
  hasMore?: boolean;
}

interface ListContentResult {
  success: boolean;
  content?: ContentMetadata[];
  totalCount?: number;
  hasMore?: boolean;
  error?: string;
}

function createMockFingerprint(passphrase: string): PassphraseFingerprint {
  return {
    iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    data: Array.from(Buffer.from(passphrase, 'utf8'))
  };
}

describe('Content Pagination API Tests', () => {
  let httpServer: HttpServer;
  let io: Server;
  let clientSocket: ClientSocket;
  let sessionManager: SessionManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chunkStorage: any;
  let serverUrl: string;
  const sessionId = 'test-session-pagination-api';
  const passphrase = 'test-passphrase-123';

  beforeAll(async () => {
    // Create HTTP server and Socket.IO server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Initialize session manager
    sessionManager = new SessionManager({
      dbPath: ':memory:'
    });
    await sessionManager.initialize();

    // Create a real FileSystemChunkStorage instance for testing
    const { FileSystemChunkStorage } = await import('../../infrastructure/storage/FileSystemChunkStorage');
    chunkStorage = new FileSystemChunkStorage({
      storagePath: './test-data/sessions'
    });
    await chunkStorage.initialize();

    // Create test content for pagination testing
    await createTestContent(chunkStorage, sessionId, 25);

    // Setup socket handlers with the real chunk storage
    process.env.STORAGE_PATH = './test-data/sessions';
    process.env.NODE_ENV = 'test';
    setupSocketHandlers(io, sessionManager, chunkStorage);

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address() as AddressInfo;
        serverUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    console.log('[TEST] Server started for pagination API tests');
  });

  afterAll(async () => {
    // Clean up
    if (clientSocket?.connected) clientSocket.disconnect();
    
    // Stop session manager to clear intervals
    if (sessionManager) {
      await sessionManager.stop();
    }
    
    // Close chunk storage
    if (chunkStorage) {
      await chunkStorage.close();
    }
    
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    
    console.log('[TEST] Server stopped');
  });

  beforeEach(() => {
    // Clean up any existing connections
    if (clientSocket?.connected) clientSocket.disconnect();
  });

  it('should handle pagination API correctly', async () => {
    console.log('[TEST] Starting pagination API test');

    // Generate fingerprint for the session
    const fingerprint = createMockFingerprint(passphrase);

    // Connect client
    clientSocket = Client(serverUrl);
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', resolve);
    });

    // Client joins session
    const joinResult = await new Promise<JoinResult>((resolve) => {
      clientSocket.emit('join', {
        sessionId,
        clientName: 'TestClient',
        fingerprint,
        cachedContentIds: []
      }, (response: JoinResult) => {
        resolve(response);
      });
    });

    expect(joinResult.success).toBe(true);
    console.log('[TEST] Client joined session successfully');

    // Test first page (should get first 5 items)
    const firstPageResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: 0,
        limit: 5
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    console.log('[TEST] First page result:', firstPageResult);

    expect(firstPageResult.success).toBe(true);
    expect(firstPageResult.content).toBeDefined();
    expect(firstPageResult.content?.length).toBe(5);
    expect(firstPageResult.totalCount).toBe(25);
    expect(firstPageResult.hasMore).toBe(true);

    // Verify content IDs are correct (first 5 items)
    const firstPageIds = firstPageResult.content?.map(c => c.contentId) || [];
    expect(firstPageIds).toHaveLength(5);
    // Verify all IDs start with 'mock-content-'
    firstPageIds.forEach(id => {
      expect(id).toMatch(/^mock-content-\d+$/);
    });

    // Test second page (items 5-9)
    const secondPageResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: 5,
        limit: 5
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    console.log('[TEST] Second page result:', secondPageResult);

    expect(secondPageResult.success).toBe(true);
    expect(secondPageResult.content).toBeDefined();
    expect(secondPageResult.content?.length).toBe(5);
    expect(secondPageResult.totalCount).toBe(25);
    expect(secondPageResult.hasMore).toBe(true);

    // Verify content IDs are correct (second 5 items)
    const secondPageIds = secondPageResult.content?.map(c => c.contentId) || [];
    expect(secondPageIds).toHaveLength(5);
    // Verify all IDs start with 'mock-content-' and are different from first page
    secondPageIds.forEach(id => {
      expect(id).toMatch(/^mock-content-\d+$/);
      expect(firstPageIds).not.toContain(id); // Should be different from first page
    });

    // Test last page (items 20-24)
    const lastPageResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: 20,
        limit: 5
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    console.log('[TEST] Last page result:', lastPageResult);

    expect(lastPageResult.success).toBe(true);
    expect(lastPageResult.content).toBeDefined();
    expect(lastPageResult.content?.length).toBe(5);
    expect(lastPageResult.totalCount).toBe(25);
    expect(lastPageResult.hasMore).toBe(false); // No more items after this

    // Verify content IDs are correct (last 5 items)
    const lastPageIds = lastPageResult.content?.map(c => c.contentId) || [];
    expect(lastPageIds).toHaveLength(5);
    // Verify all IDs start with 'mock-content-'
    lastPageIds.forEach(id => {
      expect(id).toMatch(/^mock-content-\d+$/);
    });

    // Test beyond last page (should return empty)
    const beyondLastPageResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: 25,
        limit: 5
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    console.log('[TEST] Beyond last page result:', beyondLastPageResult);

    expect(beyondLastPageResult.success).toBe(true);
    expect(beyondLastPageResult.content).toBeDefined();
    expect(beyondLastPageResult.content?.length).toBe(0);
    expect(beyondLastPageResult.totalCount).toBe(25);
    expect(beyondLastPageResult.hasMore).toBe(false);

    // Test large limit (should return all remaining items)
    const largeLimitResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: 0,
        limit: 100
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    console.log('[TEST] Large limit result:', largeLimitResult);

    expect(largeLimitResult.success).toBe(true);
    expect(largeLimitResult.content).toBeDefined();
    expect(largeLimitResult.content?.length).toBe(25); // All items
    expect(largeLimitResult.totalCount).toBe(25);
    expect(largeLimitResult.hasMore).toBe(false);

    console.log('[TEST] Pagination API test completed successfully');
  });

  it('should handle invalid pagination parameters', async () => {
    console.log('[TEST] Starting invalid parameters test');

    // Generate fingerprint for the session
    const fingerprint = createMockFingerprint(passphrase);

    // Connect client
    clientSocket = Client(serverUrl);
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', resolve);
    });

    // Client joins session (use the same session with content)
    const joinResult = await new Promise<JoinResult>((resolve) => {
      clientSocket.emit('join', {
        sessionId,
        clientName: 'TestClient',
        fingerprint,
        cachedContentIds: []
      }, (response: JoinResult) => {
        resolve(response);
      });
    });

    expect(joinResult.success).toBe(true);

    // Test negative offset (should be treated as 0)
    const negativeOffsetResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: -5,
        limit: 5
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    expect(negativeOffsetResult.success).toBe(true);
    expect(negativeOffsetResult.content?.length).toBe(5);

    // Test zero limit (should use default)
    const zeroLimitResult = await new Promise<ListContentResult>((resolve) => {
      clientSocket.emit('list-content', {
        sessionId,
        offset: 0,
        limit: 0
      }, (response: ListContentResult) => {
        resolve(response);
      });
    });

    expect(zeroLimitResult.success).toBe(true);
    expect(zeroLimitResult.content?.length).toBeGreaterThan(0);

    console.log('[TEST] Invalid parameters test completed successfully');
  });
});