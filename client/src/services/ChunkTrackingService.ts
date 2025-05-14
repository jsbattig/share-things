import { ContentChunk } from '../contexts/ContentStoreContext';

/**
 * Enum for chunk status
 */
export enum ChunkStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  DISPLAYED = 'displayed'
}

/**
 * Interface for tracked chunk
 */
export interface TrackedChunk {
  contentId: string;
  chunkIndex: number;
  status: ChunkStatus;
  timestamp: number;
}

/**
 * Service for tracking chunks throughout their lifecycle
 */
export class ChunkTrackingService {
  private chunkRegistry: Map<string, Map<number, TrackedChunk>> = new Map();
  
  /**
   * Register a new chunk
   * @param contentId Content ID
   * @param chunkIndex Chunk index
   */
  registerChunk(contentId: string, chunkIndex: number): void {
    if (!this.chunkRegistry.has(contentId)) {
      this.chunkRegistry.set(contentId, new Map());
    }
    
    const contentChunks = this.chunkRegistry.get(contentId);
    if (!contentChunks) {
      console.warn(`[ChunkTracker] Content chunks map not found for ${contentId}`);
      return;
    }
    contentChunks.set(chunkIndex, {
      contentId,
      chunkIndex,
      status: ChunkStatus.PENDING,
      timestamp: Date.now()
    });
    
    console.log(`[ChunkTracker] Registered chunk ${chunkIndex} for content ${contentId}`);
  }
  
  /**
   * Update chunk status
   * @param contentId Content ID
   * @param chunkIndex Chunk index
   * @param status New status
   */
  updateChunkStatus(contentId: string, chunkIndex: number, status: ChunkStatus): void {
    const contentChunks = this.chunkRegistry.get(contentId);
    if (!contentChunks) {
      console.warn(`[ChunkTracker] Cannot update status for unknown content ${contentId}`);
      return;
    }
    
    const chunk = contentChunks.get(chunkIndex);
    if (!chunk) {
      console.warn(`[ChunkTracker] Cannot update status for unknown chunk ${chunkIndex} of content ${contentId}`);
      return;
    }
    
    contentChunks.set(chunkIndex, {
      ...chunk,
      status,
      timestamp: Date.now()
    });
    
    console.log(`[ChunkTracker] Updated chunk ${chunkIndex} for content ${contentId} to status ${status}`);
  }
  
  /**
   * Mark all chunks for a content as processed
   * @param contentId Content ID
   */
  markContentProcessed(contentId: string): void {
    const contentChunks = this.chunkRegistry.get(contentId);
    if (!contentChunks) {
      console.warn(`[ChunkTracker] Cannot mark as processed: unknown content ${contentId}`);
      return;
    }
    
    for (const [chunkIndex, chunk] of contentChunks.entries()) {
      contentChunks.set(chunkIndex, {
        ...chunk,
        status: ChunkStatus.PROCESSED,
        timestamp: Date.now()
      });
    }
    
    console.log(`[ChunkTracker] Marked all chunks for content ${contentId} as processed`);
  }
  
  /**
   * Mark all chunks for a content as displayed
   * @param contentId Content ID
   */
  markContentDisplayed(contentId: string): void {
    const contentChunks = this.chunkRegistry.get(contentId);
    if (!contentChunks) {
      console.warn(`[ChunkTracker] Cannot mark as displayed: unknown content ${contentId}`);
      return;
    }
    
    for (const [chunkIndex, chunk] of contentChunks.entries()) {
      contentChunks.set(chunkIndex, {
        ...chunk,
        status: ChunkStatus.DISPLAYED,
        timestamp: Date.now()
      });
    }
    
    console.log(`[ChunkTracker] Marked all chunks for content ${contentId} as displayed`);
  }
  
  /**
   * Clean up all chunks for a content
   * @param contentId Content ID
   */
  cleanupChunks(contentId: string): void {
    if (this.chunkRegistry.has(contentId)) {
      console.log(`[ChunkTracker] Cleaning up all chunks for content ${contentId}`);
      this.chunkRegistry.delete(contentId);
    }
  }
  
  /**
   * Get all content IDs with pending chunks
   * @returns Array of content IDs
   */
  getContentIdsWithPendingChunks(): string[] {
    const contentIds: string[] = [];
    
    for (const [contentId, contentChunks] of this.chunkRegistry.entries()) {
      for (const chunk of contentChunks.values()) {
        if (chunk.status === ChunkStatus.PENDING) {
          contentIds.push(contentId);
          break;
        }
      }
    }
    
    return contentIds;
  }
  
  /**
   * Find orphaned chunks (chunks for content that no longer exists)
   * @param activeContentIds Set of active content IDs
   * @returns Array of orphaned content IDs
   */
  findOrphanedChunks(activeContentIds: Set<string>): string[] {
    const orphanedContentIds: string[] = [];
    
    for (const contentId of this.chunkRegistry.keys()) {
      if (!activeContentIds.has(contentId)) {
        orphanedContentIds.push(contentId);
      }
    }
    
    return orphanedContentIds;
  }

  /**
   * Track a chunk from the ContentChunk interface
   * @param chunk Content chunk
   */
  trackChunk(chunk: ContentChunk): void {
    this.registerChunk(chunk.contentId, chunk.chunkIndex);
  }

  /**
   * Get all tracked chunks for a content
   * @param contentId Content ID
   * @returns Map of chunk index to tracked chunk, or undefined if content not found
   */
  getTrackedChunks(contentId: string): Map<number, TrackedChunk> | undefined {
    return this.chunkRegistry.get(contentId);
  }

  /**
   * Check if all chunks for a content have been received
   * @param contentId Content ID
   * @param totalChunks Total number of chunks
   * @returns True if all chunks have been received
   */
  hasAllChunks(contentId: string, totalChunks: number): boolean {
    const contentChunks = this.chunkRegistry.get(contentId);
    if (!contentChunks) {
      return false;
    }
    
    return contentChunks.size === totalChunks;
  }
}

// Create a singleton instance
export const chunkTrackingService = new ChunkTrackingService();