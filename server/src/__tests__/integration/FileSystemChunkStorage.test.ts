// Set NODE_ENV to 'test' for integration tests
process.env.NODE_ENV = 'test';

import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('FileSystemChunkStorage Integration Tests', () => {
  let storage: FileSystemChunkStorage;
  let tempDir: string;
  let testSessionId: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = path.join(tmpdir(), `chunk-storage-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(tempDir, { recursive: true });
    
    // Create a unique session ID for each test
    testSessionId = `test-session-${Date.now()}`;
    
    // Create the storage instance with real database
    storage = new FileSystemChunkStorage({
      storagePath: tempDir,
      maxItemsPerSession: 10,
      cleanupIntervalMs: 0, // Disable automatic cleanup for tests
    });
    
    // Initialize the storage (this will create the real database)
    await storage.initialize();
  });

  afterEach(async () => {
    try {
      // Close the storage and clean up
      await storage.close();
      
      // Remove the temporary directory and all its contents
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn(`Cleanup warning: ${error}`);
    }
  });

  it('should save and retrieve a single chunk', async () => {
    const contentId = `test-content-${Date.now()}`;
    const chunkData = Buffer.from('test data');
    const iv = new Uint8Array(16).fill(1);
    
    const metadata = {
      contentId,
      sessionId: testSessionId,
      chunkIndex: 0,
      totalChunks: 1,
      size: chunkData.length,
      iv,
    };
    
    // Save the chunk
    await storage.saveChunk(chunkData, metadata);
    await storage.markContentComplete(contentId);
    
    // Retrieve the chunk
    const retrievedChunk = await storage.getChunk(contentId, 0);
    expect(retrievedChunk).toBeDefined();
    expect(Buffer.from(retrievedChunk as Uint8Array)).toEqual(chunkData);
  });

  it('should list content for a session', async () => {
    const count = 3;
    const contentIds: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const contentId = `test-content-${Date.now()}-${i}`;
      const chunkData = Buffer.from(`test data ${i}`);
      const iv = new Uint8Array(16).fill(3);
      
      const metadata = {
        contentId,
        sessionId: testSessionId,
        chunkIndex: 0,
        totalChunks: 1,
        size: chunkData.length,
        iv,
      };
      
      await storage.saveChunk(chunkData, metadata);
      await storage.markContentComplete(contentId);
      contentIds.push(contentId);
      
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // List the content
    const contentList = await storage.listContent(testSessionId, count);
    
    // Verify the list
    expect(contentList).toBeDefined();
    expect(contentList.length).toBe(count);
    for (const id of contentIds) {
      expect(contentList.some(item => item.contentId === id)).toBe(true);
    }
  });

  it('should clean up old content', async () => {
    const totalItems = 5;
    const maxItems = 3;
    const contentIds: string[] = [];
    
    for (let i = 0; i < totalItems; i++) {
      const contentId = `test-content-${Date.now()}-${i}`;
      const chunkData = Buffer.from(`test data ${i}`);
      const iv = new Uint8Array(16).fill(4);
      
      const metadata = {
        contentId,
        sessionId: testSessionId,
        chunkIndex: 0,
        totalChunks: 1,
        size: chunkData.length,
        iv,
      };
      
      await storage.saveChunk(chunkData, metadata);
      await storage.markContentComplete(contentId);
      contentIds.push(contentId);
      
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Clean up old content
    const { removed } = await storage.cleanupOldContent(testSessionId, maxItems);
    
    // Verify the correct number of items were removed
    expect(removed.length).toBe(totalItems - maxItems);
    
    // Verify the removed items no longer exist
    for (const id of removed) {
      const metadata = await storage.getContentMetadata(id);
      expect(metadata).toBeNull();
    }
    
    // Verify the remaining items still exist
    const contentList = await storage.listContent(testSessionId, maxItems);
    expect(contentList).toBeDefined();
    expect(contentList.length).toBe(maxItems);
  });

  it('should handle multiple chunks per content', async () => {
    // Create test data
    const contentId = `test-content-${Date.now()}`;
    const chunkSize = 512;
    const numChunks = 4;
    const chunks = Array.from({ length: numChunks }, (_, i) => Buffer.alloc(chunkSize, i));
    
    // Save all chunks
    for (let i = 0; i < numChunks; i++) {
      await storage.saveChunk(chunks[i], {
        contentId,
        sessionId: testSessionId,
        chunkIndex: i,
        totalChunks: numChunks,
        size: chunkSize,
        iv: new Uint8Array(16).fill(5),
      });
    }
    
    // Mark as complete
    await storage.markContentComplete(contentId);
    
    // Verify all chunks can be retrieved
    for (let i = 0; i < numChunks; i++) {
      const chunk = await storage.getChunk(contentId, i);
      expect(chunk).toBeDefined();
      expect(Buffer.from(chunk as Uint8Array)).toEqual(chunks[i]);
    }
    
    // Verify metadata
    const metadata = await storage.getContentMetadata(contentId);
    expect(metadata).toBeDefined();
    expect(metadata?.contentId).toBe(contentId);
    expect(metadata?.sessionId).toBe(testSessionId);
    expect(metadata?.totalChunks).toBe(numChunks);
    expect(metadata?.isComplete).toBe(true);
  });

  it('should handle concurrent access', async () => {
    const numOperations = 5;
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < numOperations; i++) {
      const contentId = `test-concurrent-${Date.now()}-${i}`;
      const chunkData = Buffer.from(`data ${i}`);
      const iv = new Uint8Array(16).fill(6);
      
      const promise = storage.saveChunk(chunkData, {
        contentId,
        sessionId: testSessionId,
        chunkIndex: 0,
        totalChunks: 1,
        size: chunkData.length,
        iv,
      }).then(() => storage.markContentComplete(contentId));
      
      promises.push(promise);
    }
    
    // Wait for all operations to complete
    await Promise.all(promises);
    
    // Verify all chunks were saved
    const contentList = await storage.listContent(testSessionId, numOperations);
    expect(contentList).toBeDefined();
    expect(contentList.length).toBe(numOperations);
  });


  it('should handle session cleanup', async () => {
    const numItems = 3;
    const contentIds: string[] = [];
    
    // Create some content
    for (let i = 0; i < numItems; i++) {
      const contentId = `test-content-${Date.now()}-${i}`;
      const chunkData = Buffer.from(`test data ${i}`);
      const iv = new Uint8Array(16).fill(8);
      
      const metadata = {
        contentId,
        sessionId: testSessionId,
        chunkIndex: 0,
        totalChunks: 1,
        size: chunkData.length,
        iv,
      };
      
      await storage.saveChunk(chunkData, metadata);
      await storage.markContentComplete(contentId);
      contentIds.push(contentId);
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Verify content exists
    let contentList = await storage.listContent(testSessionId, numItems);
    expect(contentList.length).toBe(numItems);
    
    // Clean up all session content
    const { removed } = await storage.cleanupAllSessionContent(testSessionId);
    expect(removed.length).toBe(numItems);
    
    // Verify all content is gone
    contentList = await storage.listContent(testSessionId, numItems);
    expect(contentList.length).toBe(0);
    
    // Verify individual items are gone
    for (const id of contentIds) {
      const metadata = await storage.getContentMetadata(id);
      expect(metadata).toBeNull();
    }
  });
});
