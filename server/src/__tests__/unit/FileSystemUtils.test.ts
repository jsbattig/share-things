import { 
  ensureDirectoryExists, 
  getContentDirectory,
  getChunkPath,
  getMetadataPath
} from '../../infrastructure/storage/fileSystemUtils';
import { mkdtemp, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileSystemUtils', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), 'fs-utils-test-'));
  });

  afterAll(async () => {
    // Clean up the temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', async () => {
      const testDir = join(tempDir, 'test-dir');
      
      await ensureDirectoryExists(testDir);
      
      const stats = await stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const testDir = join(tempDir, 'existing-dir');
      
      // Create the directory first
      await ensureDirectoryExists(testDir);
      
      // Should not throw when called again
      await expect(ensureDirectoryExists(testDir)).resolves.not.toThrow();
    });
  });

  describe('getContentDirectory', () => {
    it('should return the correct content directory path', () => {
      const sessionId = 'test-session';
      const contentId = 'test-content';
      const expectedPath = join(tempDir, 'chunks', sessionId, contentId);
      
      const result = getContentDirectory(tempDir, sessionId, contentId);
      expect(result).toBe(expectedPath);
    });
  });

  describe('getChunkPath', () => {
    it('should return the correct chunk file path', () => {
      const sessionId = 'test-session';
      const contentId = 'test-content';
      const chunkIndex = 0;
      const expectedPath = join(
        tempDir, 
        'chunks', 
        sessionId, 
        contentId, 
        `${chunkIndex}.bin`
      );
      
      const result = getChunkPath(tempDir, sessionId, contentId, chunkIndex);
      expect(result).toBe(expectedPath);
    });
  });

  describe('getMetadataPath', () => {
    it('should return the correct metadata file path', () => {
      const sessionId = 'test-session';
      const contentId = 'test-content';
      const expectedPath = join(
        tempDir, 
        'chunks', 
        sessionId, 
        contentId, 
        'meta.json'
      );
      
      const result = getMetadataPath(tempDir, sessionId, contentId);
      expect(result).toBe(expectedPath);
    });
  });
});
