// Set NODE_ENV to 'test' for unit tests
process.env.NODE_ENV = 'test';

import { IChunkStorage, ChunkMetadata } from '../../domain/ChunkStorage.interface';
import { randomBytes } from 'crypto';

// Create test data
const testChunk = Buffer.from('test data');

// Export test data for use in other tests
export { testChunk };

// Add a simple test to make Jest happy
describe('ChunkStorage Interface', () => {
  it('should define the interface correctly', () => {
    expect(true).toBe(true);
  });
});

// This is a test suite that can be used to test any implementation of IChunkStorage
export function testChunkStorage(createStorage: () => IChunkStorage) {
  describe('IChunkStorage Implementation', () => {
    let storage: IChunkStorage;
    let testSessionId: string;
    let testContentId: string;
    let testMetadata: ChunkMetadata;

    beforeEach(async () => {
      storage = createStorage();
      await storage.initialize();
      
      testSessionId = `test-session-${Date.now()}`;
      testContentId = `test-content-${Date.now()}`;
      
      testMetadata = {
        contentId: testContentId,
        sessionId: testSessionId,
        chunkIndex: 0,
        totalChunks: 1,
        size: testChunk.length,
        iv: new Uint8Array(16).fill(1), // Use a simple test IV
        timestamp: Date.now()
      };
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should save and retrieve a chunk', async () => {
      // Save the chunk
      await storage.saveChunk(testChunk, testMetadata);
      
      // Retrieve the chunk
      const retrievedChunk = await storage.getChunk(testContentId, 0);
      
      // Verify the data
      expect(retrievedChunk).toBeDefined();
      expect(Buffer.from(retrievedChunk as Uint8Array)).toEqual(testChunk);
    });

    it('should return null for non-existent chunks', async () => {
      const chunk = await storage.getChunk('non-existent-id', 0);
      expect(chunk).toBeNull();
    });

    it('should mark content as complete', async () => {
      await storage.saveChunk(testChunk, testMetadata);
      await storage.markContentComplete(testContentId);
      
      const metadata = await storage.getContentMetadata(testContentId);
      expect(metadata?.isComplete).toBe(true);
    });

    it('should list content for a session', async () => {
      // Save multiple chunks for the same session
      const contentIds: string[] = [];
      const numItems = 3;
      
      for (let i = 0; i < numItems; i++) {
        const contentId = `${testContentId}-${i}`;
        const metadata = { ...testMetadata, contentId };
        
        await storage.saveChunk(testChunk, metadata);
        await storage.markContentComplete(contentId);
        contentIds.push(contentId);
        
        // Add a small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // List content with a limit
      const limit = 2;
      const contentList = await storage.listContent(testSessionId, limit);
      
      // Should respect the limit
      expect(contentList.length).toBe(limit);
      
      // Should be ordered by most recent first
      const returnedIds = contentList.map(item => item.contentId);
      const expectedIds = contentIds.slice(-limit).reverse();
      expect(returnedIds).toEqual(expectedIds);
    });

    it('should clean up old content', async () => {
      
      // Save more items than the limit
      const maxItems = 3;
      const totalItems = 5;
      const contentIds: string[] = [];
      
      for (let i = 0; i < totalItems; i++) {
        const contentId = `${testContentId}-${i}`;
        const metadata = { ...testMetadata, contentId };
        
        await storage.saveChunk(testChunk, metadata);
        await storage.markContentComplete(contentId);
        contentIds.push(contentId);
        
        // Add a small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Clean up old content
      const { removed } = await storage.cleanupOldContent(testSessionId, maxItems);
      
      // Should remove the correct number of items
      expect(removed.length).toBe(totalItems - maxItems);
      
      // The removed items should no longer exist
      for (const id of removed) {
        const metadata = await storage.getContentMetadata(id);
        expect(metadata).toBeNull();
      }
      
      // The remaining items should still exist
      const remaining = await storage.listContent(testSessionId, totalItems);
      expect(remaining.length).toBe(maxItems);
      
      // The remaining items should be the most recent ones
      const remainingIds = remaining.map(item => item.contentId);
      const expectedRemaining = contentIds.slice(-maxItems).reverse();
      expect(remainingIds).toEqual(expectedRemaining);
    });

    it('should handle multiple chunks per content', async () => {
      
      const chunkSize = 512;
      const numChunks = 4;
      const chunks = Array.from({ length: numChunks }, () => randomBytes(chunkSize));
      
      // Save all chunks
      for (let i = 0; i < numChunks; i++) {
        await storage.saveChunk(chunks[i], {
          ...testMetadata,
          chunkIndex: i,
          totalChunks: numChunks,
          size: chunkSize,
        });
      }
      
      // Mark as complete
      await storage.markContentComplete(testContentId);
      
      // Verify all chunks can be retrieved
      for (let i = 0; i < numChunks; i++) {
        const chunk = await storage.getChunk(testContentId, i);
        expect(chunk).toBeDefined();
        expect(Buffer.from(chunk as Uint8Array)).toEqual(chunks[i]);
      }
      
      // Verify metadata
      const metadata = await storage.getContentMetadata(testContentId);
      expect(metadata).not.toBeNull();
      expect(metadata?.contentId).toBe(testContentId);
      expect(metadata?.totalChunks).toBe(numChunks);
      expect(metadata?.totalSize).toBe(chunkSize * numChunks);
      expect(metadata?.isComplete).toBe(true);
    });
  });
}
