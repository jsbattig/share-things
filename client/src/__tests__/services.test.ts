import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ChunkTrackingService, ChunkStatus } from '../services/ChunkTrackingService';
import { UrlRegistry } from '../services/UrlRegistry';

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('ChunkTrackingService', () => {
  let chunkTrackingService: ChunkTrackingService;

  beforeEach(() => {
    chunkTrackingService = new ChunkTrackingService();
  });

  test('should register and track chunks', () => {
    // Register chunks
    chunkTrackingService.registerChunk('content-1', 0);
    chunkTrackingService.registerChunk('content-1', 1);
    chunkTrackingService.registerChunk('content-2', 0);

    // Check if chunks are tracked
    expect(chunkTrackingService.hasAllChunks('content-1', 2)).toBe(true);
    expect(chunkTrackingService.hasAllChunks('content-1', 3)).toBe(false);
    expect(chunkTrackingService.hasAllChunks('content-2', 1)).toBe(true);
    expect(chunkTrackingService.hasAllChunks('content-3', 1)).toBe(false);
  });

  test('should update chunk status', () => {
    // Register chunks
    chunkTrackingService.registerChunk('content-1', 0);
    chunkTrackingService.registerChunk('content-1', 1);

    // Update status
    chunkTrackingService.updateChunkStatus('content-1', 0, ChunkStatus.PROCESSED);
    
    // Get tracked chunks
    const trackedChunks = chunkTrackingService.getTrackedChunks('content-1');
    
    // Check status
    expect(trackedChunks?.get(0)?.status).toBe(ChunkStatus.PROCESSED);
    expect(trackedChunks?.get(1)?.status).toBe(ChunkStatus.PENDING);
  });

  test('should mark all chunks as processed', () => {
    // Register chunks
    chunkTrackingService.registerChunk('content-1', 0);
    chunkTrackingService.registerChunk('content-1', 1);

    // Mark as processed
    chunkTrackingService.markContentProcessed('content-1');
    
    // Get tracked chunks
    const trackedChunks = chunkTrackingService.getTrackedChunks('content-1');
    
    // Check status
    expect(trackedChunks?.get(0)?.status).toBe(ChunkStatus.PROCESSED);
    expect(trackedChunks?.get(1)?.status).toBe(ChunkStatus.PROCESSED);
  });

  test('should mark all chunks as displayed', () => {
    // Register chunks
    chunkTrackingService.registerChunk('content-1', 0);
    chunkTrackingService.registerChunk('content-1', 1);

    // Mark as displayed
    chunkTrackingService.markContentDisplayed('content-1');
    
    // Get tracked chunks
    const trackedChunks = chunkTrackingService.getTrackedChunks('content-1');
    
    // Check status
    expect(trackedChunks?.get(0)?.status).toBe(ChunkStatus.DISPLAYED);
    expect(trackedChunks?.get(1)?.status).toBe(ChunkStatus.DISPLAYED);
  });

  test('should cleanup chunks', () => {
    // Register chunks
    chunkTrackingService.registerChunk('content-1', 0);
    chunkTrackingService.registerChunk('content-1', 1);

    // Cleanup
    chunkTrackingService.cleanupChunks('content-1');
    
    // Check if chunks are tracked
    expect(chunkTrackingService.hasAllChunks('content-1', 2)).toBe(false);
  });

  test('should find orphaned chunks', () => {
    // Register chunks
    chunkTrackingService.registerChunk('content-1', 0);
    chunkTrackingService.registerChunk('content-2', 0);

    // Find orphaned chunks
    const activeContentIds = new Set(['content-1']);
    const orphanedContentIds = chunkTrackingService.findOrphanedChunks(activeContentIds);
    
    // Check orphaned chunks
    expect(orphanedContentIds).toContain('content-2');
    expect(orphanedContentIds).not.toContain('content-1');
  });
});

describe('UrlRegistry', () => {
  let urlRegistry: UrlRegistry;

  beforeEach(() => {
    urlRegistry = new UrlRegistry();
    (global.URL.createObjectURL as ReturnType<typeof vi.fn>).mockClear();
    (global.URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear();
  });

  test('should create and register URLs', () => {
    // Create URLs
    const url1 = urlRegistry.createUrl('content-1', new Blob());
    const url2 = urlRegistry.createUrl('content-1', new Blob());
    const url3 = urlRegistry.createUrl('content-2', new Blob());

    // Check URLs
    expect(url1).toBe('mock-url');
    expect(url2).toBe('mock-url');
    expect(url3).toBe('mock-url');
    
    // Check URL count
    expect(urlRegistry.getUrlCount()).toBe(3);
    
    // Check URL.createObjectURL calls
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  test('should revoke specific URL', () => {
    // Create URLs
    const url1 = urlRegistry.createUrl('content-1', new Blob());
    const url2 = urlRegistry.createUrl('content-1', new Blob());

    // Revoke specific URL
    urlRegistry.revokeUrl('content-1', url1);
    
    // Check URL count
    expect(urlRegistry.getUrlCount()).toBe(1);
    
    // Check URL.revokeObjectURL calls
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(url1);
  });

  test('should revoke all URLs for a content', () => {
    // Create URLs
    urlRegistry.createUrl('content-1', new Blob());
    urlRegistry.createUrl('content-1', new Blob());
    urlRegistry.createUrl('content-2', new Blob());

    // Revoke all URLs for content-1
    urlRegistry.revokeAllUrls('content-1');
    
    // Check URL count
    expect(urlRegistry.getUrlCount()).toBe(1);
    
    // Check URL.revokeObjectURL calls
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  test('should cleanup orphaned URLs', () => {
    // Create URLs
    urlRegistry.createUrl('content-1', new Blob());
    urlRegistry.createUrl('content-2', new Blob());

    // Cleanup orphaned URLs
    const activeContentIds = new Set(['content-1']);
    urlRegistry.cleanupOrphanedUrls(activeContentIds);
    
    // Check URL count
    expect(urlRegistry.getUrlCount()).toBe(1);
    
    // Check URL.revokeObjectURL calls
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  test('should revoke all URLs globally', () => {
    // Create URLs
    urlRegistry.createUrl('content-1', new Blob());
    urlRegistry.createUrl('content-2', new Blob());

    // Revoke all URLs
    urlRegistry.revokeAllUrlsGlobally();
    
    // Check URL count
    expect(urlRegistry.getUrlCount()).toBe(0);
    
    // Check URL.revokeObjectURL calls
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});