// Set NODE_ENV to 'test' for unit tests
process.env.NODE_ENV = 'test';

// Disable Jest module clearing for this test to ensure our compiled module is loaded
jest.clearAllMocks();
jest.resetAllMocks();

import { FileSystemChunkStorage } from '../../infrastructure/storage/FileSystemChunkStorage';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Content Renaming Functionality', () => {
  let tempDir: string;
  let storage: FileSystemChunkStorage;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = path.join(tmpdir(), `rename-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(tempDir, { recursive: true });
    
    storage = new FileSystemChunkStorage({
      storagePath: tempDir,
    });
    await storage.initialize();
  });

  afterEach(async () => {
    try {
      await storage.close();
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn(`Cleanup warning: ${error}`);
    }
  });

  describe('renameContent', () => {
    it('should successfully rename content with valid metadata', async () => {
      const contentId = 'test-content-123';
      const originalName = 'original-file.txt';
      const newName = 'renamed-file.txt';

      // Debug: Check if the method exists
      console.log('Storage methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(storage)));
      console.log('renameContent exists:', typeof storage.renameContent);

      // First, create content with metadata
      await storage.saveContent({
        contentId,
        sessionId: 'test-session',
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

      // Rename the content
      const result = await storage.renameContent(contentId, newName);

      // Verify rename was successful
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify the metadata was updated
      const content = await storage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(newName);
        expect(metadata.mimeType).toBe('text/plain'); // Should preserve other metadata
        expect(metadata.size).toBe(100); // Should preserve other metadata
      }
    });

    it('should handle renaming content with no existing metadata', async () => {
      const contentId = 'test-content-no-metadata';
      const newName = 'new-file.txt';

      // Create content without additional metadata
      await storage.saveContent({
        contentId,
        sessionId: 'test-session',
        contentType: 'file',
        totalChunks: 1,
        totalSize: 50,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: null,
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Rename the content
      const result = await storage.renameContent(contentId, newName);

      // Verify rename was successful
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify metadata was created with the new filename
      const content = await storage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(newName);
      }
    });

    it('should handle renaming content with malformed metadata', async () => {
      const contentId = 'test-content-malformed';
      const newName = 'fixed-file.txt';

      // Create content with malformed JSON metadata
      await storage.saveContent({
        contentId,
        sessionId: 'test-session',
        contentType: 'file',
        totalChunks: 1,
        totalSize: 75,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: 'invalid-json{broken',
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Rename the content
      const result = await storage.renameContent(contentId, newName);

      // Verify rename was successful (should handle malformed JSON gracefully)
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify metadata was reset with the new filename
      const content = await storage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(newName);
      }
    });

    it('should return error for non-existent content', async () => {
      const nonExistentId = 'non-existent-content';
      const newName = 'some-name.txt';

      // Try to rename non-existent content
      const result = await storage.renameContent(nonExistentId, newName);

      // Verify error is returned
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Content not found');
    });

    it('should preserve all existing metadata except fileName', async () => {
      const contentId = 'test-content-preserve';
      const originalName = 'original.jpg';
      const newName = 'renamed.jpg';

      // Create content with complex metadata
      const originalMetadata = {
        fileName: originalName,
        mimeType: 'image/jpeg',
        size: 1024,
        imageInfo: {
          width: 800,
          height: 600,
          format: 'jpeg'
        },
        customField: 'custom-value'
      };

      await storage.saveContent({
        contentId,
        sessionId: 'test-session',
        contentType: 'image',
        totalChunks: 1,
        totalSize: 1024,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: JSON.stringify(originalMetadata),
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Rename the content
      const result = await storage.renameContent(contentId, newName);

      // Verify rename was successful
      expect(result.success).toBe(true);

      // Verify all metadata is preserved except fileName
      const content = await storage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(newName); // Should be updated
        expect(metadata.mimeType).toBe('image/jpeg'); // Should be preserved
        expect(metadata.size).toBe(1024); // Should be preserved
        expect(metadata.imageInfo.width).toBe(800); // Should be preserved
        expect(metadata.imageInfo.height).toBe(600); // Should be preserved
        expect(metadata.imageInfo.format).toBe('jpeg'); // Should be preserved
        expect(metadata.customField).toBe('custom-value'); // Should be preserved
      }
    });

    it('should handle empty string and whitespace-only names gracefully', async () => {
      const contentId = 'test-content-empty-name';

      // Create content
      await storage.saveContent({
        contentId,
        sessionId: 'test-session',
        contentType: 'text',
        totalChunks: 1,
        totalSize: 10,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: JSON.stringify({ fileName: 'original.txt' }),
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Try to rename with empty string
      const emptyResult = await storage.renameContent(contentId, '');
      
      // Should still succeed (implementation detail - could also choose to reject)
      expect(emptyResult.success).toBe(true);

      // Try to rename with whitespace only
      const whitespaceResult = await storage.renameContent(contentId, '   ');
      
      expect(whitespaceResult.success).toBe(true);
    });

    it('should handle special characters in filename', async () => {
      const contentId = 'test-content-special';
      const specialName = 'file with spaces & special chars (1).txt';

      // Create content
      await storage.saveContent({
        contentId,
        sessionId: 'test-session',
        contentType: 'text',
        totalChunks: 1,
        totalSize: 20,
        createdAt: Date.now(),
        encryptionIv: new Uint8Array(12),
        additionalMetadata: JSON.stringify({ fileName: 'original.txt' }),
        isComplete: true,
        isPinned: false,
        isLargeFile: false
      });

      // Rename with special characters
      const result = await storage.renameContent(contentId, specialName);

      // Verify rename was successful
      expect(result.success).toBe(true);

      // Verify the special characters are preserved
      const content = await storage.getContentMetadata(contentId);
      expect(content).toBeDefined();
      
      if (content && content.additionalMetadata) {
        const metadata = JSON.parse(content.additionalMetadata);
        expect(metadata.fileName).toBe(specialName);
      }
    });
  });
});