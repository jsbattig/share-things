// Set NODE_ENV to 'test' for unit tests
process.env.NODE_ENV = 'test';

import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { testChunkStorage } from './ChunkStorage.interface.test';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('FileSystemChunkStorage', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = path.join(tmpdir(), `chunk-storage-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      // Remove the temporary directory and all its contents
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn(`Cleanup warning: ${error}`);
    }
  });

  // Test the FileSystemChunkStorage implementation using the interface test suite
  testChunkStorage(() => {
    return new FileSystemChunkStorage({
      storagePath: tempDir,
    });
  });

  describe('FileSystemChunkStorage specific tests', () => {
    let storage: FileSystemChunkStorage;

    beforeEach(async () => {
      storage = new FileSystemChunkStorage({
        storagePath: tempDir,
      });
      await storage.initialize();
    });

    afterEach(async () => {
      try {
        await storage.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should create storage directory if it does not exist', async () => {
      const newTempDir = path.join(tmpdir(), `new-storage-test-${Date.now()}`);
      
      const newStorage = new FileSystemChunkStorage({
        storagePath: newTempDir,
      });

      try {
        await newStorage.initialize();
        
        // Verify the directory was created by saving a chunk
        const testData = Buffer.from('test');
        await newStorage.saveChunk(testData, {
          contentId: 'test-content',
          sessionId: 'test-session',
          chunkIndex: 0,
          totalChunks: 1,
          size: testData.length,
          iv: new Uint8Array(16).fill(1),
        });

        // Verify we can retrieve it
        const retrieved = await newStorage.getChunk('test-content', 0);
        expect(retrieved).toBeDefined();
        expect(Buffer.from(retrieved as Uint8Array)).toEqual(testData);

        await newStorage.close();
        await rm(newTempDir, { recursive: true, force: true });
      } catch (error) {
        // Clean up on error
        try {
          await newStorage.close();
          await rm(newTempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw error;
      }
    });

    it('should handle initialization multiple times', async () => {
      // Initialize multiple times - should not throw
      await storage.initialize();
      await storage.initialize();
      await storage.initialize();

      // Should still work normally
      const testData = Buffer.from('test data');
      await storage.saveChunk(testData, {
        contentId: 'test-content',
        sessionId: 'test-session',
        chunkIndex: 0,
        totalChunks: 1,
        size: testData.length,
        iv: new Uint8Array(16).fill(1),
      });

      const retrieved = await storage.getChunk('test-content', 0);
      expect(retrieved).toBeDefined();
      expect(Buffer.from(retrieved as Uint8Array)).toEqual(testData);
    });

    it('should handle large chunks', async () => {
      const largeData = Buffer.alloc(1024 * 1024, 'A'); // 1MB of 'A's
      
      await storage.saveChunk(largeData, {
        contentId: 'large-content',
        sessionId: 'test-session',
        chunkIndex: 0,
        totalChunks: 1,
        size: largeData.length,
        iv: new Uint8Array(16).fill(2),
      });

      const retrieved = await storage.getChunk('large-content', 0);
      expect(retrieved).toBeDefined();
      expect(Buffer.from(retrieved as Uint8Array)).toEqual(largeData);
    });

    it('should handle binary data correctly', async () => {
      // Create binary data with all possible byte values
      const binaryData = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      
      await storage.saveChunk(binaryData, {
        contentId: 'binary-content',
        sessionId: 'test-session',
        chunkIndex: 0,
        totalChunks: 1,
        size: binaryData.length,
        iv: new Uint8Array(16).fill(3),
      });

      const retrieved = await storage.getChunk('binary-content', 0);
      expect(retrieved).toBeDefined();
      expect(Buffer.from(retrieved as Uint8Array)).toEqual(binaryData);
    });

    it('should handle empty chunks', async () => {
      const emptyData = Buffer.alloc(0);
      
      await storage.saveChunk(emptyData, {
        contentId: 'empty-content',
        sessionId: 'test-session',
        chunkIndex: 0,
        totalChunks: 1,
        size: 0,
        iv: new Uint8Array(16).fill(4),
      });

      const retrieved = await storage.getChunk('empty-content', 0);
      expect(retrieved).toBeDefined();
      expect(Buffer.from(retrieved as Uint8Array)).toEqual(emptyData);
    });

    it('should handle special characters in content IDs', async () => {
      const testData = Buffer.from('test data');
      const specialContentId = 'content-with-special-chars-123_456.789';
      
      await storage.saveChunk(testData, {
        contentId: specialContentId,
        sessionId: 'test-session',
        chunkIndex: 0,
        totalChunks: 1,
        size: testData.length,
        iv: new Uint8Array(16).fill(5),
      });

      const retrieved = await storage.getChunk(specialContentId, 0);
      expect(retrieved).toBeDefined();
      expect(Buffer.from(retrieved as Uint8Array)).toEqual(testData);
    });
  });
});
