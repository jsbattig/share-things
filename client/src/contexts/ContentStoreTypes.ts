/**
 * New Content Store Types for Refactored Architecture
 * This file contains all the interfaces for the two-dictionary cache system
 */

import { ContentType, SharedContent, ContentChunk } from './ContentStoreContext';

// ===== CACHE ENTRY TYPES =====

export interface ContentMetadataEntry {
  contentId: string;
  metadata: SharedContent;
  receivedAt: number;
}

export interface ContentChunkEntry {
  contentId: string;
  chunkIndex: number;
  chunk: ContentChunk;
  receivedAt: number;
}

// ===== PROGRESS TRACKING =====

export enum ContentStatus {
  RECEIVING = 'receiving',
  READY_TO_RENDER = 'ready_to_render',
  RENDERING = 'rendering',
  RENDERED = 'rendered',
  ERROR = 'error'
}

export interface ContentProgress {
  contentId: string;
  status: ContentStatus;
  metadata?: ContentMetadataEntry;
  chunks: Map<number, ContentChunkEntry>;
  totalChunks?: number;
  receivedChunks: number;
  isReadyToRender: boolean;
  progressPercentage: number;
  lastUpdated: number;
  errorMessage?: string;
}

// ===== RENDERED CONTENT =====

export interface RenderedContent {
  contentId: string;
  metadata: SharedContent;
  textData?: string;  // Only for text content
  diskCachePath?: string;  // For binary content (contentId used as path)
  renderedAt: number;
  lastAccessed: number;
}

// ===== CACHE SYSTEM INTERFACES =====

export interface ContentCacheState {
  // Two primary dictionaries
  metadataCache: Map<string, ContentMetadataEntry>;
  chunkCache: Map<string, Map<number, ContentChunkEntry>>;
  
  // Progress tracking
  contentProgress: Map<string, ContentProgress>;
  
  // Final rendered content
  renderedContent: Map<string, RenderedContent>;
  
  // Statistics
  stats: {
    totalMetadataEntries: number;
    totalChunkEntries: number;
    totalProgressEntries: number;
    totalRenderedEntries: number;
    memoryUsage: number;
    diskUsage: number;
  };
}

// ===== OPERATIONS =====

export interface ContentCacheOperations {
  // Metadata operations
  addMetadata: (metadata: SharedContent) => void;
  getMetadata: (contentId: string) => ContentMetadataEntry | undefined;
  
  // Chunk operations
  addChunk: (chunk: ContentChunk) => void;
  getChunks: (contentId: string) => Map<number, ContentChunkEntry> | undefined;
  
  // Progress operations
  getProgress: (contentId: string) => ContentProgress | undefined;
  updateProgress: (contentId: string) => void;
  
  // Render operations
  checkRenderCondition: (contentId: string) => boolean;
  renderContent: (contentId: string) => Promise<void>;
  
  // Rendered content operations
  getRenderedContent: (contentId: string) => RenderedContent | undefined;
  getAllRenderedContent: () => RenderedContent[];
  
  // Cleanup operations
  clearMemoryCache: (contentId: string) => void;
  clearAllMemoryCache: () => void;
  removeContent: (contentId: string) => Promise<void>;
  
  // Download/Copy operations
  downloadContent: (contentId: string) => Promise<void>;
  copyToClipboard: (contentId: string) => Promise<void>;
  
  // Utility operations
  getStats: () => ContentCacheState['stats'];
}

// ===== CONTEXT INTERFACE =====

export interface RefactoredContentStoreContextType {
  // Cache state (read-only)
  cacheState: ContentCacheState;
  
  // Operations
  operations: ContentCacheOperations;
  
  // Legacy compatibility (for gradual migration)
  getContentList: () => SharedContent[];
  getContent: (contentId: string) => RenderedContent | undefined;
  
  // Download/Copy operations
  downloadContent: (contentId: string) => Promise<void>;
  copyToClipboard: (contentId: string) => Promise<void>;
  
  // Session operations
  clearSession: () => Promise<void>;
  getSessionStats: () => {
    totalContent: number;
    memoryUsage: number;
    diskUsage: number;
    progressItems: number;
  };
}

// ===== UTILITY TYPES =====

export interface ContentOperationResult {
  success: boolean;
  contentId: string;
  message?: string;
  error?: Error;
}

export interface RenderResult extends ContentOperationResult {
  renderedContent?: RenderedContent;
  renderTime?: number;
}

export interface ProgressUpdate {
  contentId: string;
  oldProgress: ContentProgress;
  newProgress: ContentProgress;
  changeType: 'metadata_added' | 'chunk_added' | 'ready_to_render' | 'rendered' | 'error';
}

// ===== EVENTS =====

export interface ContentStoreEvents {
  onProgressUpdate: (update: ProgressUpdate) => void;
  onContentRendered: (result: RenderResult) => void;
  onContentRemoved: (contentId: string) => void;
  onError: (error: Error, contentId?: string) => void;
}

// ===== CONFIGURATION =====

export interface ContentStoreConfig {
  // Memory limits
  maxMemoryCacheSize: number; // bytes
  maxConcurrentRenders: number;
  
  // Disk cache settings
  enableDiskCache: boolean;
  maxDiskCacheSize: number; // bytes
  diskCacheCleanupThreshold: number; // percentage
  
  // Progress settings
  progressUpdateInterval: number; // ms
  showProgressForSingleChunk: boolean;
  
  // Cleanup settings
  autoCleanupInterval: number; // ms
  maxContentAge: number; // ms
  
  // Debug settings
  enableDebugLogging: boolean;
  logPerformanceMetrics: boolean;
}

export const DEFAULT_CONTENT_STORE_CONFIG: ContentStoreConfig = {
  maxMemoryCacheSize: 100 * 1024 * 1024, // 100MB
  maxConcurrentRenders: 3,
  enableDiskCache: true,
  maxDiskCacheSize: 500 * 1024 * 1024, // 500MB
  diskCacheCleanupThreshold: 80, // 80%
  progressUpdateInterval: 100, // 100ms
  showProgressForSingleChunk: false,
  autoCleanupInterval: 5 * 60 * 1000, // 5 minutes
  maxContentAge: 24 * 60 * 60 * 1000, // 24 hours
  enableDebugLogging: true,
  logPerformanceMetrics: true
};