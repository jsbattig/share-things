import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { ChunkMetadata } from '../../domain/ChunkStorage.interface';
import { promises as fs } from 'fs';
import path from 'path';

describe('Content Pinning', () => {
  let storage: FileSystemChunkStorage;
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = path.join(__dirname, '../../__test_data__', `pinning_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(testDir, { recursive: true });
    
    storage = new FileSystemChunkStorage({ storagePath: testDir });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  const createTestChunk = async (contentId: string, sessionId = 'test-session'): Promise<void> => {
    const chunkData = new Uint8Array([1, 2, 3, 4, 5]);
    const metadata: Omit<ChunkMetadata, 'timestamp'> = {
      contentId,
      sessionId,
      chunkIndex: 0,
      totalChunks: 1,
      size: chunkData.length,
      iv: new Uint8Array(12),
      contentType: 'text/plain'
    };

    await storage.saveChunk(chunkData, metadata);
  };

  describe('Pin Content', () => {
    it('should pin content successfully', async () => {
      const contentId = 'test-content-1';
      await createTestChunk(contentId);

      // Pin the content
      await storage.pinContent(contentId);

      // Verify content is pinned
      const metadata = await storage.getContentMetadata(contentId);
      expect(metadata).not.toBeNull();
      expect(metadata?.isPinned).toBe(true);
    });

    it('should handle pinning non-existent content', async () => {
      // This should not throw an error, just update nothing
      await expect(storage.pinContent('non-existent')).resolves.not.toThrow();
    });
  });

  describe('Unpin Content', () => {
    it('should unpin content successfully', async () => {
      const contentId = 'test-content-2';
      await createTestChunk(contentId);

      // Pin then unpin the content
      await storage.pinContent(contentId);
      await storage.unpinContent(contentId);

      // Verify content is unpinned
      const metadata = await storage.getContentMetadata(contentId);
      expect(metadata).not.toBeNull();
      expect(metadata?.isPinned).toBe(false);
    });

    it('should handle unpinning non-existent content', async () => {
      // This should not throw an error, just update nothing
      await expect(storage.unpinContent('non-existent')).resolves.not.toThrow();
    });
  });

  describe('Get Pinned Content Count', () => {
    it('should return correct count of pinned items', async () => {
      const sessionId = 'test-session';
      
      // Create 3 content items
      await createTestChunk('content-1', sessionId);
      await createTestChunk('content-2', sessionId);
      await createTestChunk('content-3', sessionId);

      // Pin 2 of them
      await storage.pinContent('content-1');
      await storage.pinContent('content-3');

      // Check count
      const count = await storage.getPinnedContentCount(sessionId);
      expect(count).toBe(2);
    });

    it('should return 0 for session with no pinned content', async () => {
      const sessionId = 'empty-session';
      const count = await storage.getPinnedContentCount(sessionId);
      expect(count).toBe(0);
    });

    it('should return 0 for non-existent session', async () => {
      const count = await storage.getPinnedContentCount('non-existent-session');
      expect(count).toBe(0);
    });
  });

  describe('Cleanup with Pinned Content', () => {
    it('should exclude pinned content from cleanup', async () => {
      const sessionId = 'cleanup-test-session';
      
      // Create 5 content items
      const contentIds = ['content-1', 'content-2', 'content-3', 'content-4', 'content-5'];
      for (const contentId of contentIds) {
        await createTestChunk(contentId, sessionId);
        // Add small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Pin the first 2 items
      await storage.pinContent('content-1');
      await storage.pinContent('content-2');

      // Set max items to 2 (should keep 2 newest non-pinned items, plus all pinned items)
      const result = await storage.cleanupOldContent(sessionId, 2);

      // Should have removed 1 item (oldest non-pinned)
      expect(result.removed).toHaveLength(1);
      expect(result.removed).toContain('content-3');

      // Verify remaining content
      const remainingContent = await storage.listContent(sessionId);
      expect(remainingContent).toHaveLength(4); // 2 pinned + 2 non-pinned
      
      // Check that pinned items are still there
      const pinnedItems = remainingContent.filter(item => item.isPinned);
      expect(pinnedItems).toHaveLength(2);
      expect(pinnedItems.map(item => item.contentId)).toContain('content-1');
      expect(pinnedItems.map(item => item.contentId)).toContain('content-2');

      // Check that newest non-pinned items are still there
      const nonPinnedItems = remainingContent.filter(item => !item.isPinned);
      expect(nonPinnedItems).toHaveLength(2);
      expect(nonPinnedItems.map(item => item.contentId)).toContain('content-4');
      expect(nonPinnedItems.map(item => item.contentId)).toContain('content-5');
    });

    it('should handle cleanup when all items are pinned', async () => {
      const sessionId = 'all-pinned-session';
      
      // Create 3 content items and pin all of them
      const contentIds = ['content-1', 'content-2', 'content-3'];
      for (const contentId of contentIds) {
        await createTestChunk(contentId, sessionId);
        await storage.pinContent(contentId);
      }

      // Try to cleanup with max items = 1
      const result = await storage.cleanupOldContent(sessionId, 1);

      // Should remove nothing since all items are pinned
      expect(result.removed).toHaveLength(0);

      // Verify all content is still there
      const remainingContent = await storage.listContent(sessionId);
      expect(remainingContent).toHaveLength(3);
      expect(remainingContent.every(item => item.isPinned)).toBe(true);
    });
  });

  describe('Content Listing with Pinned Items', () => {
    it('should list pinned items first', async () => {
      const sessionId = 'sorting-test-session';
      
      // Create content items with delays to ensure different timestamps
      await createTestChunk('content-1', sessionId);
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestChunk('content-2', sessionId);
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestChunk('content-3', sessionId);
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestChunk('content-4', sessionId);

      // Pin content-2 and content-4 (not the newest ones)
      await storage.pinContent('content-2');
      await storage.pinContent('content-4');

      // List content
      const content = await storage.listContent(sessionId);
      
      // Should have 4 items
      expect(content).toHaveLength(4);

      // First two should be pinned (ordered by creation time desc within pinned group)
      expect(content[0].isPinned).toBe(true);
      expect(content[0].contentId).toBe('content-4'); // Newer pinned item first
      expect(content[1].isPinned).toBe(true);
      expect(content[1].contentId).toBe('content-2'); // Older pinned item second

      // Next two should be non-pinned (ordered by creation time desc)
      expect(content[2].isPinned).toBe(false);
      expect(content[2].contentId).toBe('content-3'); // Newest non-pinned
      expect(content[3].isPinned).toBe(false);
      expect(content[3].contentId).toBe('content-1'); // Oldest non-pinned
    });
  });

  describe('Stress Test - More Pinned Items than Limit', () => {
    it('should handle more pinned items than max session limit', async () => {
      const sessionId = 'stress-test-session';
      const maxItems = 3;
      const pinnedItemsCount = 5;
      const nonPinnedItemsCount = 4;

      // Create and pin 5 items
      for (let i = 1; i <= pinnedItemsCount; i++) {
        await createTestChunk(`pinned-${i}`, sessionId);
        await storage.pinContent(`pinned-${i}`);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Create 4 non-pinned items
      for (let i = 1; i <= nonPinnedItemsCount; i++) {
        await createTestChunk(`normal-${i}`, sessionId);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Trigger cleanup with max items = 3
      const result = await storage.cleanupOldContent(sessionId, maxItems);

      // Should remove 1 non-pinned item (4 - 3 = 1)
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toBe('normal-1'); // Oldest non-pinned

      // Verify final state
      const remainingContent = await storage.listContent(sessionId);
      
      // Should have 5 pinned + 3 non-pinned = 8 total
      expect(remainingContent).toHaveLength(8);
      
      const pinnedItems = remainingContent.filter(item => item.isPinned);
      const nonPinnedItems = remainingContent.filter(item => !item.isPinned);
      
      expect(pinnedItems).toHaveLength(5);
      expect(nonPinnedItems).toHaveLength(3);

      // Verify all pinned items are still there
      for (let i = 1; i <= pinnedItemsCount; i++) {
        expect(pinnedItems.some(item => item.contentId === `pinned-${i}`)).toBe(true);
      }

      // Verify only newest non-pinned items remain
      expect(nonPinnedItems.map(item => item.contentId).sort()).toEqual(['normal-2', 'normal-3', 'normal-4']);
    });
  });
});