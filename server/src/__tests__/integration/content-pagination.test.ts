import { Server } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { setupSocketHandlers } from '../../socket';
import { SessionManager, PassphraseFingerprint } from '../../services/SessionManager';
import { ContentMetadata } from '../../domain/ChunkStorage.interface';

// Mock the FileSystemChunkStorage to focus on pagination logic
jest.mock('../../infrastructure/storage/FileSystemChunkStorage', () => {
  return {
    FileSystemChunkStorage: jest.fn().mockImplementation(() => {
      const mockContent: ContentMetadata[] = [];
      
      // Generate 25 mock content items for pagination testing
      for (let i = 0; i < 25; i++) {
        mockContent.push({
          contentId: `mock-content-${i}`,
          sessionId: 'test-session',
          contentType: 'text',
          totalChunks: 1,
          totalSize: 100,
          createdAt: Date.now() + i,
          isComplete: true,
          encryptionIv: new Uint8Array(12),
          additionalMetadata: JSON.stringify({ index: i }),
          isPinned: false,
          isLargeFile: false
        });
      }

      return {
        initialize: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        saveChunk: jest.fn().mockResolvedValue(undefined),
        markContentComplete: jest.fn().mockResolvedValue(undefined),
        updateContentMetadata: jest.fn().mockResolvedValue(undefined),
        getChunk: jest.fn().mockResolvedValue(new Uint8Array([116, 101, 115, 116])), // "test" in bytes
        getChunkMetadata: jest.fn().mockResolvedValue({
          contentId: 'mock-content-0',
          chunkIndex: 0,
          encryptionIv: new Uint8Array(12)
        }),
        deleteContent: jest.fn().mockResolvedValue(undefined),
        getReceivedChunkCount: jest.fn().mockResolvedValue(1),
        listContent: jest.fn().mockImplementation((sessionId: string, limit = 50, offset = 0) => {
          console.log(`[MOCK] listContent called: sessionId=${sessionId}, limit=${limit}, offset=${offset}`);
          const start = offset || 0;
          const end = start + limit;
          const paginatedContent = mockContent.slice(start, end);
          console.log(`[MOCK] Returning ${paginatedContent.length} items (${start}-${end} of ${mockContent.length})`);
          return Promise.resolve(paginatedContent);
        }),
        getContentCount: jest.fn().mockResolvedValue(25)
      };
    })
  };
});

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

describe.skip('Content Pagination API Tests', () => {
  let httpServer: HttpServer;
  let io: Server;
  let clientSocket: ClientSocket;
  let sessionManager: SessionManager;
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

    // Setup socket handlers
    process.env.STORAGE_PATH = './test-data/sessions';
    process.env.NODE_ENV = 'test';
    setupSocketHandlers(io, sessionManager);

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
    
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    
    console.log('[TEST] Server stopped');
  });

  beforeEach(() => {
    // Clean up any existing connections
    if (clientSocket?.connected) clientSocket.disconnect();
  });

  it.skip('should handle pagination API correctly', async () => {
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
    expect(firstPageIds).toEqual([
      'mock-content-0',
      'mock-content-1', 
      'mock-content-2',
      'mock-content-3',
      'mock-content-4'
    ]);

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
    expect(secondPageIds).toEqual([
      'mock-content-5',
      'mock-content-6',
      'mock-content-7',
      'mock-content-8',
      'mock-content-9'
    ]);

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
    expect(lastPageIds).toEqual([
      'mock-content-20',
      'mock-content-21',
      'mock-content-22',
      'mock-content-23',
      'mock-content-24'
    ]);

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

  it.skip('should handle invalid pagination parameters', async () => {
    console.log('[TEST] Starting invalid parameters test');

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
        sessionId: sessionId + '-invalid',
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
        sessionId: sessionId + '-invalid',
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
        sessionId: sessionId + '-invalid',
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