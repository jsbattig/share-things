import { IChunkStorage, ChunkMetadata, ContentMetadata } from '../domain/ChunkStorage.interface';

/**
 * In-memory mock implementation of FileSystemChunkStorage for testing
 * This avoids database connection issues and memory leaks in tests
 */
export class MockFileSystemChunkStorage implements IChunkStorage {
  private chunks: Map<string, Uint8Array> = new Map();
  private chunkMetadata: Map<string, { iv: Uint8Array }> = new Map();
  private contentMetadata: Map<string, ContentMetadata> = new Map();
  private sessionContent: Map<string, string[]> = new Map();
  private isInitialized = false;

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async close(): Promise<void> {
    this.chunks.clear();
    this.contentMetadata.clear();
    this.sessionContent.clear();
    this.isInitialized = false;
  }

  async saveChunk(data: Uint8Array, metadata: Omit<ChunkMetadata, 'timestamp'>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const key = `${metadata.contentId}:${metadata.chunkIndex}`;
    this.chunks.set(key, new Uint8Array(data));

    // Store chunk metadata
    this.chunkMetadata.set(key, { iv: metadata.iv });

    // Update content metadata
    const existing = this.contentMetadata.get(metadata.contentId);
    const contentMeta: ContentMetadata = {
      contentId: metadata.contentId,
      sessionId: metadata.sessionId,
      contentType: 'application/octet-stream',
      totalChunks: metadata.totalChunks,
      totalSize: existing ? existing.totalSize + metadata.size : metadata.size,
      createdAt: existing ? existing.createdAt : Date.now(),
      encryptionIv: metadata.iv,
      additionalMetadata: null,
      isComplete: false,
    };

    this.contentMetadata.set(metadata.contentId, contentMeta);

    // Track session content
    const sessionContents = this.sessionContent.get(metadata.sessionId) || [];
    if (!sessionContents.includes(metadata.contentId)) {
      sessionContents.push(metadata.contentId);
      this.sessionContent.set(metadata.sessionId, sessionContents);
    }
  }

  async getChunk(contentId: string, chunkIndex: number): Promise<Uint8Array | null> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const key = `${contentId}:${chunkIndex}`;
    const chunk = this.chunks.get(key);
    return chunk ? new Uint8Array(chunk) : null;
  }

  async markContentComplete(contentId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const metadata = this.contentMetadata.get(contentId);
    if (metadata) {
      metadata.isComplete = true;
      this.contentMetadata.set(contentId, metadata);
    }
  }

  async getContentMetadata(contentId: string): Promise<ContentMetadata | null> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const metadata = this.contentMetadata.get(contentId);
    return metadata ? { ...metadata } : null;
  }

  async getChunkMetadata(contentId: string, chunkIndex: number): Promise<{ iv: Uint8Array } | null> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const key = `${contentId}:${chunkIndex}`;
    const metadata = this.chunkMetadata.get(key);
    return metadata ? { iv: new Uint8Array(metadata.iv) } : null;
  }

  async listContent(sessionId: string, limit = 50): Promise<ContentMetadata[]> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const sessionContents = this.sessionContent.get(sessionId) || [];
    const results: ContentMetadata[] = [];

    for (const contentId of sessionContents) {
      const metadata = this.contentMetadata.get(contentId);
      if (metadata && metadata.isComplete) {
        results.push({ ...metadata });
      }
    }

    // Sort by creation time (most recent first) and apply limit
    return results
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async cleanupOldContent(sessionId: string, maxItems: number): Promise<{ removed: string[] }> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const sessionContents = this.sessionContent.get(sessionId) || [];
    const contentList = await this.listContent(sessionId, sessionContents.length);

    if (contentList.length <= maxItems) {
      return { removed: [] };
    }

    // Remove oldest items
    const toRemove = contentList.slice(maxItems);
    const removedIds: string[] = [];

    for (const content of toRemove) {
      // Remove chunks
      const metadata = this.contentMetadata.get(content.contentId);
      if (metadata) {
        for (let i = 0; i < metadata.totalChunks; i++) {
          const key = `${content.contentId}:${i}`;
          this.chunks.delete(key);
        }
      }

      // Remove metadata
      this.contentMetadata.delete(content.contentId);
      removedIds.push(content.contentId);

      // Remove from session content list
      const sessionContents = this.sessionContent.get(sessionId) || [];
      const index = sessionContents.indexOf(content.contentId);
      if (index > -1) {
        sessionContents.splice(index, 1);
        this.sessionContent.set(sessionId, sessionContents);
      }
    }

    return { removed: removedIds };
  }

  async cleanupAllSessionContent(sessionId: string): Promise<{ removed: string[] }> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const sessionContents = this.sessionContent.get(sessionId) || [];
    const removedIds: string[] = [];

    for (const contentId of sessionContents) {
      // Remove chunks
      const metadata = this.contentMetadata.get(contentId);
      if (metadata) {
        for (let i = 0; i < metadata.totalChunks; i++) {
          const key = `${contentId}:${i}`;
          this.chunks.delete(key);
        }
      }

      // Remove metadata
      this.contentMetadata.delete(contentId);
      removedIds.push(contentId);
    }

    // Clear session content list
    this.sessionContent.delete(sessionId);

    return { removed: removedIds };
  }

  async removeContent(contentId: string): Promise<{ success: boolean; error?: string }> {
    // Check if content exists
    const content = this.contentMetadata.get(contentId);
    if (!content) {
      return { success: false, error: 'Content not found' };
    }

    // Remove all chunks for this content
    const chunksToRemove: string[] = [];
    for (const [key] of this.chunks) {
      if (key.startsWith(`${contentId}:`)) {
        chunksToRemove.push(key);
      }
    }

    for (const key of chunksToRemove) {
      this.chunks.delete(key);
    }

    // Remove metadata
    this.contentMetadata.delete(contentId);

    // Remove from session content lists
    for (const [sessionId, contentIds] of this.sessionContent) {
      const index = contentIds.indexOf(contentId);
      if (index > -1) {
        contentIds.splice(index, 1);
        this.sessionContent.set(sessionId, contentIds);
      }
    }

    return { success: true };
  }
}

// Export the mock as the default export
export const FileSystemChunkStorage = MockFileSystemChunkStorage;