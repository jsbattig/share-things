import { IChunkStorage, ChunkMetadata, ContentMetadata } from '../domain/ChunkStorage.interface';
import { storageConfig } from '../infrastructure/config/storage.config';

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
    const totalSize = existing ? existing.totalSize + metadata.size : metadata.size;
    
    // Check large file threshold
    const isLargeFile = totalSize > storageConfig.largeFileThreshold;
    
    const contentMeta: ContentMetadata = {
      contentId: metadata.contentId,
      sessionId: metadata.sessionId,
      contentType: 'application/octet-stream',
      totalChunks: metadata.totalChunks,
      totalSize: totalSize,
      createdAt: existing ? existing.createdAt : Date.now(),
      encryptionIv: metadata.iv,
      additionalMetadata: null,
      isComplete: false,
      isPinned: existing ? existing.isPinned : false,
      isLargeFile: isLargeFile,
    };

    this.contentMetadata.set(metadata.contentId, contentMeta);

    // Track session content
    const sessionContents = this.sessionContent.get(metadata.sessionId) || [];
    if (!sessionContents.includes(metadata.contentId)) {
      sessionContents.push(metadata.contentId);
      this.sessionContent.set(metadata.sessionId, sessionContents);
    }
  }

  async saveContent(metadata: ContentMetadata): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    this.contentMetadata.set(metadata.contentId, metadata);

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
      if (metadata) {
        results.push({ ...metadata });
      }
    }

    // Sort by pinned status first, then by creation time (most recent first) and apply limit
    return results
      .sort((a, b) => {
        // First, sort by pinned status (pinned items first)
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        // Then sort by creation time (most recent first)
        return b.createdAt - a.createdAt;
      })
      .slice(0, limit);
  }

  async cleanupOldContent(sessionId: string, maxItems: number): Promise<{ removed: string[] }> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const sessionContents = this.sessionContent.get(sessionId) || [];
    const contentList = await this.listContent(sessionId, sessionContents.length);

    // Filter out pinned items for cleanup consideration
    const nonPinnedContent = contentList.filter(content => !content.isPinned);

    // Calculate how many non-pinned items we can keep
    // maxItems applies only to non-pinned items (pinned items are excluded from the count)
    if (nonPinnedContent.length <= maxItems) {
      return { removed: [] };
    }

    // Remove oldest non-pinned items
    const toRemove = nonPinnedContent.slice(maxItems);
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

  async getReceivedChunkCount(contentId: string): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const metadata = this.contentMetadata.get(contentId);
    if (!metadata) {
      return 0;
    }

    let count = 0;
    for (let i = 0; i < metadata.totalChunks; i++) {
      const key = `${contentId}:${i}`;
      if (this.chunks.has(key)) {
        count++;
      }
    }

    return count;
  }

  async pinContent(contentId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const metadata = this.contentMetadata.get(contentId);
    if (metadata) {
      metadata.isPinned = true;
      this.contentMetadata.set(contentId, metadata);
    }
  }

  async unpinContent(contentId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const metadata = this.contentMetadata.get(contentId);
    if (metadata) {
      metadata.isPinned = false;
      this.contentMetadata.set(contentId, metadata);
    }
  }

  async getPinnedContentCount(sessionId: string): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const sessionContents = this.sessionContent.get(sessionId) || [];
    let count = 0;

    for (const contentId of sessionContents) {
      const metadata = this.contentMetadata.get(contentId);
      if (metadata && metadata.isPinned) {
        count++;
      }
    }

    return count;
  }

  async streamContentForDownload(
    contentId: string,
    onChunk: (chunk: Uint8Array, metadata: ChunkMetadata) => Promise<void>
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const contentMeta = this.contentMetadata.get(contentId);
    if (!contentMeta) {
      throw new Error('Content not found');
    }

    for (let i = 0; i < contentMeta.totalChunks; i++) {
      const chunk = await this.getChunk(contentId, i);
      const chunkMeta = await this.getChunkMetadata(contentId, i);
      
      if (chunk && chunkMeta) {
        const metadata: ChunkMetadata = {
          contentId,
          sessionId: contentMeta.sessionId,
          chunkIndex: i,
          totalChunks: contentMeta.totalChunks,
          size: chunk.length,
          iv: chunkMeta.iv,
          contentType: contentMeta.contentType,
          timestamp: contentMeta.createdAt
        };
        
        await onChunk(chunk, metadata);
      }
    }
  }

  async isLargeFile(contentId: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    const metadata = this.contentMetadata.get(contentId);
    return metadata ? metadata.isLargeFile : false;
  }

  async renameContent(contentId: string, newName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    try {
      const metadata = this.contentMetadata.get(contentId);
      if (!metadata) {
        return { success: false, error: 'Content not found' };
      }

      // Parse current additional metadata or create new one
      let additionalMetadata: Record<string, unknown> = {};
      if (metadata.additionalMetadata) {
        try {
          additionalMetadata = JSON.parse(metadata.additionalMetadata);
        } catch {
          // If JSON parsing fails, start with empty metadata
          additionalMetadata = {};
        }
      }

      // Update filename in metadata
      additionalMetadata.fileName = newName;

      // Update the metadata with new additional metadata
      const updatedMetadata = {
        ...metadata,
        additionalMetadata: JSON.stringify(additionalMetadata)
      };

      this.contentMetadata.set(contentId, updatedMetadata);

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during rename' 
      };
    }
  }
}

// Export the mock as the default export
export const FileSystemChunkStorage = MockFileSystemChunkStorage;