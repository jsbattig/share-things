import { v4 as uuidv4 } from 'uuid';
import { deriveKeyFromPassphrase, encryptData } from './encryption';

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  size: number;
  iv: Uint8Array;
}

/**
 * Chunk data
 */
export interface Chunk {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  encryptedData: Uint8Array;
  iv: Uint8Array;
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  chunkSize?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Default chunking options
 */
const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 64 * 1024, // 64KB
  onProgress: (): void => { /* No-op progress handler */ }
};

/**
 * Chunks and encrypts a blob
 * @param blob The blob to chunk and encrypt
 * @param passphrase The encryption passphrase
 * @param options Chunking options
 * @returns Array of chunks and content ID
 */
export async function chunkAndEncryptBlob(
  blob: Blob,
  passphrase: string,
  options: ChunkingOptions = {}
): Promise<{ chunks: Chunk[]; contentId: string }> {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunkSize = opts.chunkSize || DEFAULT_OPTIONS.chunkSize || 64 * 1024;
  const onProgress = opts.onProgress || DEFAULT_OPTIONS.onProgress || ((): void => { /* Fallback progress handler */ });
  
  // Generate content ID
  const contentId = uuidv4();
  
  // Calculate total chunks
  const totalChunks = Math.ceil(blob.size / chunkSize);
  
  // Derive encryption key
  const key = await deriveKeyFromPassphrase(passphrase);
  
  // Create chunks
  const chunks: Chunk[] = [];
  
  for (let i = 0; i < totalChunks; i++) {
    // Calculate chunk range
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, blob.size);
    
    // Extract chunk data
    const chunkBlob = blob.slice(start, end);
    const arrayBuffer = await chunkBlob.arrayBuffer();
    const chunkData = new Uint8Array(arrayBuffer);

    // Encrypt chunk
    const { encryptedData, iv } = await encryptData(key, chunkData, passphrase);
    
    // Create chunk
    chunks.push({
      contentId,
      chunkIndex: i,
      totalChunks,
      encryptedData: new Uint8Array(encryptedData),
      iv
    });
    
    // Report progress
    onProgress((i + 1) / totalChunks);
  }
  
  return { chunks, contentId };
}

/**
 * Processes chunks in batches to avoid blocking the UI
 * @param chunks Array of chunks to process
 * @param processor Function to process each chunk
 * @param batchSize Number of chunks to process in each batch
 * @param onProgress Progress callback
 * @returns Promise that resolves when all chunks are processed
 */
export async function processChunksInBatches(
  chunks: Chunk[],
  processor: (chunk: Chunk) => Promise<void>,
  batchSize = 5,
  onProgress?: (progress: number) => void
): Promise<void> {
  const totalChunks = chunks.length;
  let processedChunks = 0;
  
  // Process chunks in batches
  for (let i = 0; i < totalChunks; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // Process batch in parallel
    await Promise.all(batch.map(async (chunk) => {
      await processor(chunk);
      processedChunks++;
      
      // Report progress
      if (onProgress) {
        onProgress(processedChunks / totalChunks);
      }
    }));
    
    // Yield to UI thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Serializes a chunk for transmission
 * @param chunk The chunk to serialize
 * @returns Serialized chunk
 */
export interface SerializedChunk {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  encryptedData: number[];
  iv: number[];
}

export function serializeChunk(chunk: Chunk): SerializedChunk {
  return {
    contentId: chunk.contentId,
    chunkIndex: chunk.chunkIndex,
    totalChunks: chunk.totalChunks,
    encryptedData: Array.from(chunk.encryptedData),
    iv: Array.from(chunk.iv)
  };
}

/**
 * Deserializes a chunk from transmission
 * @param data The serialized chunk data
 * @returns Deserialized chunk
 */
export function deserializeChunk(data: SerializedChunk): Chunk {
  return {
    contentId: data.contentId,
    chunkIndex: data.chunkIndex,
    totalChunks: data.totalChunks,
    encryptedData: new Uint8Array(data.encryptedData),
    iv: new Uint8Array(data.iv)
  };
}

/**
 * Estimates the number of chunks for a given file size
 * @param fileSize File size in bytes
 * @param chunkSize Chunk size in bytes
 * @returns Estimated number of chunks
 */
export function estimateChunks(fileSize: number, chunkSize = DEFAULT_OPTIONS.chunkSize || 64 * 1024): number {
  return Math.ceil(fileSize / chunkSize);
}

/**
 * Checks if chunking is needed for a given file size
 * @param fileSize File size in bytes
 * @param threshold Threshold size in bytes
 * @returns True if chunking is needed
 */
export function isChunkingNeeded(fileSize: number, threshold = DEFAULT_OPTIONS.chunkSize || 64 * 1024): boolean {
  return fileSize > threshold;
}