import { 
  chunkAndEncryptBlob,
  processChunksInBatches,
  serializeChunk,
  deserializeChunk
} from '../utils/chunking';

describe('Chunking Utilities', () => {
  const testPassphrase = 'test-passphrase-123';
  const testData = new Uint8Array(Array(100 * 1024).fill(42)); // 100KB of data
  const testBlob = new Blob([testData], { type: 'application/octet-stream' });
  
  test('should chunk and encrypt a blob correctly', async () => {
    // Use a smaller chunk size for testing
    const { chunks, contentId } = await chunkAndEncryptBlob(testBlob, testPassphrase, {
      chunkSize: 16 * 1024, // 16KB chunks
      onProgress: () => {}
    });
    
    // Should have the right number of chunks
    expect(chunks.length).toBe(Math.ceil(testBlob.size / (16 * 1024)));
    
    // Each chunk should have the correct properties
    chunks.forEach((chunk, index) => {
      expect(chunk.contentId).toBe(contentId);
      expect(chunk.chunkIndex).toBe(index);
      expect(chunk.totalChunks).toBe(chunks.length);
      expect(chunk.encryptedData).toBeInstanceOf(Uint8Array);
      expect(chunk.iv).toBeInstanceOf(Uint8Array);
    });
  });
  
  test('should process chunks in batches', async () => {
    // Create test chunks
    const { chunks } = await chunkAndEncryptBlob(testBlob, testPassphrase, {
      chunkSize: 16 * 1024
    });
    
    // Track processed chunks
    const processedChunks: string[] = [];
    
    // Process chunks
    await processChunksInBatches(
      chunks,
      async (chunk) => {
        processedChunks.push(`${chunk.contentId}-${chunk.chunkIndex}`);
        // Simulate async processing
        await new Promise(resolve => setTimeout(resolve, 5));
      },
      2 // Process 2 chunks at a time
    );
    
    // All chunks should be processed
    expect(processedChunks.length).toBe(chunks.length);
    
    // Chunks should be processed in order (within each batch)
    for (let i = 0; i < chunks.length; i++) {
      expect(processedChunks).toContain(`${chunks[i].contentId}-${chunks[i].chunkIndex}`);
    }
  });
  
  test('should serialize and deserialize chunks correctly', async () => {
    // Create a test chunk
    const { chunks } = await chunkAndEncryptBlob(testBlob, testPassphrase, {
      chunkSize: 16 * 1024
    });
    
    const originalChunk = chunks[0];
    
    // Serialize chunk
    const serialized = serializeChunk(originalChunk);
    
    // Deserialize chunk
    const deserialized = deserializeChunk(serialized);
    
    // Check properties
    expect(deserialized.contentId).toBe(originalChunk.contentId);
    expect(deserialized.chunkIndex).toBe(originalChunk.chunkIndex);
    expect(deserialized.totalChunks).toBe(originalChunk.totalChunks);
    
    // Check binary data
    expect(Array.from(deserialized.encryptedData)).toEqual(Array.from(originalChunk.encryptedData));
    expect(Array.from(deserialized.iv)).toEqual(Array.from(originalChunk.iv));
  });
});