import { randomBytes } from 'crypto';
import { IChunkStorage } from '../../domain/ChunkStorage.interface';

export async function generateTestChunk(size = 1024) {
  const contentId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const sessionId = `session-${Math.random().toString(36).substring(2, 10)}`;
  const iv = randomBytes(16);
  const data = randomBytes(size);
  
  return {
    contentId,
    sessionId,
    chunkIndex: 0,
    totalChunks: 1,
    size: data.length,
    iv,
    data,
    metadata: {
      contentId,
      sessionId,
      chunkIndex: 0,
      totalChunks: 1,
      size: data.length,
      iv
    }
  };
}

export async function populateTestContent(
  storage: IChunkStorage,
  sessionId: string,
  count = 3,
  chunkSize = 1024
): Promise<string[]> {
  const contentIds: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const { contentId, data, metadata } = await generateTestChunk(chunkSize);
    metadata.sessionId = sessionId;
    
    await storage.saveChunk(data, metadata);
    await storage.markContentComplete(contentId);
    contentIds.push(contentId);
    
    // Add small delay to ensure different timestamps
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  return contentIds;
}

export async function verifyContentExists(
  storage: IChunkStorage,
  contentId: string,
  expectedSize: number,
  expectedChunks: number
): Promise<void> {
  const metadata = await storage.getContentMetadata(contentId);
  
  if (!metadata) {
    throw new Error(`Content ${contentId} not found`);
  }
  
  if (metadata.totalSize !== expectedSize) {
    throw new Error(`Expected size ${expectedSize}, got ${metadata.totalSize}`);
  }
  
  if (metadata.totalChunks !== expectedChunks) {
    throw new Error(`Expected ${expectedChunks} chunks, got ${metadata.totalChunks}`);
  }
  
  if (!metadata.isComplete) {
    throw new Error('Content is not marked as complete');
  }
}

export async function createTestSession(
  storage: IChunkStorage,
  sessionId: string,
  itemCount = 3
): Promise<{ sessionId: string; contentIds: string[] }> {
  const contentIds = await populateTestContent(storage, sessionId, itemCount);
  return { sessionId, contentIds };
}
