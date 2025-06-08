/**
 * Small File Transfer Functional Test
 * Tests files below the large file threshold (10MB) with various edge cases
 * Uses actual application code - no mocking, no fakes, no aberrations
 */

import { FileSystemChunkStorage } from '../../../server/src/infrastructure/storage/FileSystemChunkStorage';
import { chunkAndEncryptBlob } from '../../../client/src/utils/chunking';
import { deriveKeyFromPassphrase, decryptData } from '../../../client/src/utils/encryption';
import { createCompatibleBlob } from './browser-compat';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
// Node.js compatible directory resolution
const currentDir = path.resolve();

describe('Small File Transfer - Comprehensive Edge Cases', () => {
  const TEST_SESSION_ID = 'test-small-file-session';
  const TEST_PASSPHRASE = 'test-passphrase-123';
  const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
  const CHUNK_SIZE = 64 * 1024; // 64KB
  
  let storage: FileSystemChunkStorage;
  let testDataDir: string;

  beforeAll(async () => {
    // Initialize storage
    testDataDir = path.join(currentDir, 'test-data-small');
    storage = new FileSystemChunkStorage({ storagePath: testDataDir });
    await storage.initialize();
  });

  afterAll(async () => {
    // Cleanup
    await storage.close();
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Test various file sizes with edge cases around chunk boundaries
  const testCases = [
    { name: 'tiny file', size: 1 },
    { name: 'small text', size: 100 },
    { name: 'medium text', size: 1024 },
    { name: 'just under 1 chunk', size: CHUNK_SIZE - 1 },
    { name: 'exactly 1 chunk', size: CHUNK_SIZE },
    { name: 'just over 1 chunk', size: CHUNK_SIZE + 1 },
    { name: 'exactly 2 chunks', size: CHUNK_SIZE * 2 },
    { name: 'just under 2 chunks', size: CHUNK_SIZE * 2 - 1 },
    { name: 'just over 2 chunks', size: CHUNK_SIZE * 2 + 1 },
    { name: 'exactly 10 chunks', size: CHUNK_SIZE * 10 },
    { name: 'medium file (1MB)', size: 1024 * 1024 },
    { name: 'large small file (5MB)', size: 5 * 1024 * 1024 },
    { name: 'just under large threshold', size: LARGE_FILE_THRESHOLD - 1 },
  ];

  testCases.forEach(({ name, size }) => {
    test(`should handle ${name} (${size} bytes) with perfect accuracy`, async () => {
      console.log(`Testing ${name}: ${size} bytes`);
      
      // Step 1: Generate test data
      const originalFile = crypto.randomBytes(size);
      const contentId = `small-test-${size}-${Date.now()}`;
      
      // Step 2: Upload using actual client code
      const blob = createCompatibleBlob(originalFile, { type: 'application/octet-stream' });
      const { chunks } = await chunkAndEncryptBlob(blob, TEST_PASSPHRASE, {}, contentId);
      
      console.log(`Generated ${chunks.length} chunks for ${size} bytes`);
      
      // Step 3: Store using actual server code
      for (const chunk of chunks) {
        await storage.saveChunk(chunk.encryptedData, {
          contentId: chunk.contentId,
          sessionId: TEST_SESSION_ID,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          contentType: 'file',
          mimeType: 'application/octet-stream',
          size: chunk.encryptedData.length,
          iv: chunk.iv
        });
      }
      
      await storage.saveContent({
        contentId,
        sessionId: TEST_SESSION_ID,
        contentType: 'file',
        totalChunks: chunks.length,
        totalSize: originalFile.length,
        createdAt: Date.now(),
        isComplete: true,
        encryptionIv: chunks[0].iv,
        additionalMetadata: JSON.stringify({
          fileName: `test-${size}.bin`,
          mimeType: 'application/octet-stream',
          size: originalFile.length
        }),
        isPinned: false,
        isLargeFile: size >= LARGE_FILE_THRESHOLD
      });
      
      // Step 4: Download using actual server code
      const key = await deriveKeyFromPassphrase(TEST_PASSPHRASE);
      const decryptedChunks: Uint8Array[] = [];
      let totalDecryptedSize = 0;
      
      await storage.streamContentForDownload(contentId, async (encryptedChunk, chunkMetadata) => {
        // Use the same decryption approach as the browser
        const decryptedData = await decryptData(key, encryptedChunk, chunkMetadata.iv);
        const decryptedArray = new Uint8Array(decryptedData);
        
        decryptedChunks.push(decryptedArray);
        totalDecryptedSize += decryptedArray.length;
      });
      
      // Step 5: Reassemble
      const reassembledData = new Uint8Array(totalDecryptedSize);
      let offset = 0;
      
      for (const chunk of decryptedChunks) {
        reassembledData.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Step 6: Verify perfect accuracy
      expect(reassembledData.length).toBe(originalFile.length);
      expect(Buffer.from(reassembledData).equals(originalFile)).toBe(true);
      
      // Verify metadata
      const metadata = await storage.getContentMetadata(contentId);
      expect(metadata).toBeTruthy();
      expect(metadata!.totalSize).toBe(originalFile.length);
      expect(metadata!.isLargeFile).toBe(size >= LARGE_FILE_THRESHOLD);
      
      console.log(`✅ ${name} (${size} bytes): Perfect size and content match!`);
    }, 30000); // 30 second timeout for larger files
  });

  test('should handle binary data with all byte values', async () => {
    console.log('Testing binary data with all possible byte values...');
    
    // Create data with all possible byte values (0-255)
    const originalFile = new Uint8Array(256 * 4); // Repeat pattern 4 times
    for (let i = 0; i < originalFile.length; i++) {
      originalFile[i] = i % 256;
    }
    
    const contentId = `binary-test-${Date.now()}`;
    
    // Upload, store, download, and verify
    const blob = createCompatibleBlob(originalFile, { type: 'application/octet-stream' });
    const { chunks } = await chunkAndEncryptBlob(blob, TEST_PASSPHRASE, {}, contentId);
    
    for (const chunk of chunks) {
      await storage.saveChunk(chunk.encryptedData, {
        contentId: chunk.contentId,
        sessionId: TEST_SESSION_ID,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        contentType: 'file',
        mimeType: 'application/octet-stream',
        size: chunk.encryptedData.length,
        iv: chunk.iv
      });
    }
    
    await storage.saveContent({
      contentId,
      sessionId: TEST_SESSION_ID,
      contentType: 'file',
      totalChunks: chunks.length,
      totalSize: originalFile.length,
      createdAt: Date.now(),
      isComplete: true,
      encryptionIv: chunks[0].iv,
      additionalMetadata: JSON.stringify({
        fileName: 'binary-test.bin',
        mimeType: 'application/octet-stream',
        size: originalFile.length
      }),
      isPinned: false,
      isLargeFile: false
    });
    
    // Download and verify
    const key = await deriveKeyFromPassphrase(TEST_PASSPHRASE);
    const decryptedChunks: Uint8Array[] = [];
    let totalDecryptedSize = 0;
    
    await storage.streamContentForDownload(contentId, async (encryptedChunk, chunkMetadata) => {
      const decryptedData = await decryptData(key, encryptedChunk, chunkMetadata.iv);
      const decryptedArray = new Uint8Array(decryptedData);
      
      decryptedChunks.push(decryptedArray);
      totalDecryptedSize += decryptedArray.length;
    });
    
    const reassembledData = new Uint8Array(totalDecryptedSize);
    let offset = 0;
    
    for (const chunk of decryptedChunks) {
      reassembledData.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Verify every single byte
    expect(reassembledData.length).toBe(originalFile.length);
    for (let i = 0; i < originalFile.length; i++) {
      expect(reassembledData[i]).toBe(originalFile[i]);
    }
    
    console.log('✅ Binary data test: All 256 byte values preserved perfectly!');
  });

  test('should handle empty file', async () => {
    console.log('Testing empty file...');
    
    const originalFile = new Uint8Array(0);
    const contentId = `empty-test-${Date.now()}`;
    
    const blob = createCompatibleBlob(originalFile, { type: 'application/octet-stream' });
    const { chunks } = await chunkAndEncryptBlob(blob, TEST_PASSPHRASE, {}, contentId);
    
    // Empty files should still create at least one chunk
    expect(chunks.length).toBeGreaterThan(0);
    
    for (const chunk of chunks) {
      await storage.saveChunk(chunk.encryptedData, {
        contentId: chunk.contentId,
        sessionId: TEST_SESSION_ID,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        contentType: 'file',
        mimeType: 'application/octet-stream',
        size: chunk.encryptedData.length,
        iv: chunk.iv
      });
    }
    
    await storage.saveContent({
      contentId,
      sessionId: TEST_SESSION_ID,
      contentType: 'file',
      totalChunks: chunks.length,
      totalSize: 0,
      createdAt: Date.now(),
      isComplete: true,
      encryptionIv: chunks[0].iv,
      additionalMetadata: JSON.stringify({
        fileName: 'empty.bin',
        mimeType: 'application/octet-stream',
        size: 0
      }),
      isPinned: false,
      isLargeFile: false
    });
    
    // Download and verify
    const key = await deriveKeyFromPassphrase(TEST_PASSPHRASE);
    const decryptedChunks: Uint8Array[] = [];
    let totalDecryptedSize = 0;
    
    await storage.streamContentForDownload(contentId, async (encryptedChunk, chunkMetadata) => {
      const decryptedData = await decryptData(key, encryptedChunk, chunkMetadata.iv);
      const decryptedArray = new Uint8Array(decryptedData);
      
      decryptedChunks.push(decryptedArray);
      totalDecryptedSize += decryptedArray.length;
    });
    
    const reassembledData = new Uint8Array(totalDecryptedSize);
    let offset = 0;
    
    for (const chunk of decryptedChunks) {
      reassembledData.set(chunk, offset);
      offset += chunk.length;
    }
    
    expect(reassembledData.length).toBe(0);
    
    console.log('✅ Empty file test: Perfect handling of zero-byte file!');
  });
});