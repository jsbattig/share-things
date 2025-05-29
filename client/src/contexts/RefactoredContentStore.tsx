/**
 * Refactored Content Store Implementation
 * Two-Dictionary Cache System with Progress Tracking
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './SocketContext';
import { useServices } from './ServiceContext';
import { deriveKeyFromPassphrase, decryptData } from '../utils/encryption';
import { deserializeChunk } from '../utils/chunking';
import { diskCacheService } from '../services/DiskCacheService';
import {
  ContentMetadataEntry,
  ContentChunkEntry,
  ContentProgress,
  ContentStatus,
  RenderedContent,
  ContentCacheState,
  RefactoredContentStoreContextType,
  ContentOperationResult,
  RenderResult,
  ProgressUpdate,
  DEFAULT_CONTENT_STORE_CONFIG,
  ContentStoreConfig
} from './ContentStoreTypes';
import { SharedContent, ContentChunk, ContentType } from './ContentStoreContext';

// Create context
const RefactoredContentStoreContext = createContext<RefactoredContentStoreContextType | null>(null);

/**
 * Refactored Content Store Provider
 */
export const RefactoredContentStoreProvider: React.FC<{ 
  children: React.ReactNode;
  config?: Partial<ContentStoreConfig>;
}> = ({ children, config = {} }) => {
  
  // ===== CONFIGURATION =====
  const storeConfig = { ...DEFAULT_CONTENT_STORE_CONFIG, ...config };
  
  // ===== STATE: TWO-DICTIONARY CACHE SYSTEM =====
  const [metadataCache] = useState<Map<string, ContentMetadataEntry>>(new Map());
  const [chunkCache] = useState<Map<string, Map<number, ContentChunkEntry>>>(new Map());
  const [contentProgress] = useState<Map<string, ContentProgress>>(new Map());
  const [renderedContent] = useState<Map<string, RenderedContent>>(new Map());
  
  // ===== REFS FOR PERFORMANCE =====
  const metadataCacheRef = useRef(metadataCache);
  const chunkCacheRef = useRef(chunkCache);
  const contentProgressRef = useRef(contentProgress);
  const renderedContentRef = useRef(renderedContent);
  
  // ===== STATE TRIGGERS FOR UI UPDATES =====
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [progressUpdateTrigger, setProgressUpdateTrigger] = useState(0);
  
  // ===== RENDERING STATE =====
  const renderingInProgress = useRef<Set<string>>(new Set());
  
  // ===== SOCKET AND SERVICES =====
  const { socket } = useSocket();
  const { chunkTrackingService } = useServices();
  
  // ===== UTILITY FUNCTIONS =====
  
  const triggerUpdate = useCallback(() => {
    setUpdateTrigger(prev => prev + 1);
  }, []);
  
  const triggerProgressUpdate = useCallback(() => {
    setProgressUpdateTrigger(prev => prev + 1);
  }, []);
  
  const log = useCallback((message: string, ...args: any[]) => {
    if (storeConfig.enableDebugLogging) {
      console.log(`[RefactoredContentStore] ${message}`, ...args);
    }
  }, [storeConfig.enableDebugLogging]);
  
  const getPassphrase = useCallback((): string => {
    return localStorage.getItem('passphrase') || '';
  }, []);
  
  // ===== CORE OPERATIONS =====
  
  const addMetadata = useCallback((metadata: SharedContent) => {
    const contentId = metadata.contentId;
    log(`Adding metadata for ${contentId}`);
    
    const entry: ContentMetadataEntry = {
      contentId,
      metadata,
      receivedAt: Date.now()
    };
    
    metadataCacheRef.current.set(contentId, entry);
    
    // Update or create progress entry
    let progress = contentProgressRef.current.get(contentId);
    if (!progress) {
      progress = {
        contentId,
        status: ContentStatus.RECEIVING,
        chunks: new Map(),
        receivedChunks: 0,
        isReadyToRender: false,
        progressPercentage: 0,
        lastUpdated: Date.now()
      };
      contentProgressRef.current.set(contentId, progress);
    }
    
    progress.metadata = entry;
    progress.totalChunks = metadata.totalChunks;
    progress.lastUpdated = Date.now();
    
    // Update progress percentage
    if (progress.totalChunks && progress.totalChunks > 0) {
      progress.progressPercentage = (progress.receivedChunks / progress.totalChunks) * 100;
    }
    
    // Check if ready to render
    updateProgress(contentId);
    
    triggerProgressUpdate();
    log(`Metadata added for ${contentId}, total chunks: ${metadata.totalChunks}`);
  }, [log, triggerProgressUpdate]);
  
  const addChunk = useCallback((chunk: ContentChunk) => {
    const contentId = chunk.contentId;
    log(`Adding chunk ${chunk.chunkIndex}/${chunk.totalChunks} for ${contentId}`);
    
    const entry: ContentChunkEntry = {
      contentId,
      chunkIndex: chunk.chunkIndex,
      chunk,
      receivedAt: Date.now()
    };
    
    // Get or create chunk map for this content
    let chunkMap = chunkCacheRef.current.get(contentId);
    if (!chunkMap) {
      chunkMap = new Map();
      chunkCacheRef.current.set(contentId, chunkMap);
    }
    
    // Add chunk (avoid duplicates)
    if (!chunkMap.has(chunk.chunkIndex)) {
      chunkMap.set(chunk.chunkIndex, entry);
      
      // Update or create progress entry
      let progress = contentProgressRef.current.get(contentId);
      if (!progress) {
        progress = {
          contentId,
          status: ContentStatus.RECEIVING,
          chunks: new Map(),
          receivedChunks: 0,
          isReadyToRender: false,
          progressPercentage: 0,
          lastUpdated: Date.now()
        };
        contentProgressRef.current.set(contentId, progress);
      }
      
      progress.chunks.set(chunk.chunkIndex, entry);
      progress.receivedChunks = chunkMap.size;
      progress.totalChunks = chunk.totalChunks;
      progress.lastUpdated = Date.now();
      
      // Update progress percentage
      if (progress.totalChunks && progress.totalChunks > 0) {
        progress.progressPercentage = (progress.receivedChunks / progress.totalChunks) * 100;
      }
      
      // Track chunk
      chunkTrackingService.trackChunk(chunk);
      
      log(`Chunk ${chunk.chunkIndex} added, progress: ${progress.receivedChunks}/${progress.totalChunks}`);
      
      // Check if ready to render
      updateProgress(contentId);
      
      triggerProgressUpdate();
    } else {
      log(`Chunk ${chunk.chunkIndex} already exists for ${contentId}, skipping`);
    }
  }, [log, chunkTrackingService, triggerProgressUpdate]);
  
  const updateProgress = useCallback((contentId: string) => {
    const progress = contentProgressRef.current.get(contentId);
    if (!progress) return;
    
    const wasReadyToRender = progress.isReadyToRender;
    const hasMetadata = !!progress.metadata;
    const hasAllChunks = progress.totalChunks ? 
      progress.receivedChunks === progress.totalChunks : false;
    
    progress.isReadyToRender = hasMetadata && hasAllChunks;
    
    if (progress.isReadyToRender && !wasReadyToRender) {
      progress.status = ContentStatus.READY_TO_RENDER;
      log(`Content ${contentId} is ready to render!`);
      
      // Auto-render if not already rendering
      if (!renderingInProgress.current.has(contentId)) {
        setTimeout(() => renderContent(contentId), 0);
      }
    }
    
    progress.lastUpdated = Date.now();
  }, [log]);
  
  const checkRenderCondition = useCallback((contentId: string): boolean => {
    const progress = contentProgressRef.current.get(contentId);
    if (!progress) return false;
    
    const hasMetadata = !!progress.metadata;
    const hasAllChunks = progress.totalChunks ? 
      progress.receivedChunks === progress.totalChunks : false;
    
    return hasMetadata && hasAllChunks;
  }, []);
  
  const renderContent = useCallback(async (contentId: string): Promise<void> => {
    if (renderingInProgress.current.has(contentId)) {
      log(`Rendering already in progress for ${contentId}`);
      return;
    }
    
    const progress = contentProgressRef.current.get(contentId);
    if (!progress || !progress.isReadyToRender) {
      log(`Content ${contentId} not ready to render`);
      return;
    }
    
    renderingInProgress.current.add(contentId);
    progress.status = ContentStatus.RENDERING;
    triggerProgressUpdate();
    
    try {
      log(`Starting render for ${contentId}`);
      const startTime = Date.now();
      
      const metadata = progress.metadata!.metadata;
      const chunkMap = chunkCacheRef.current.get(contentId);
      
      if (!chunkMap) {
        throw new Error('Chunk map not found');
      }
      
      // Get chunks in order
      const orderedChunks: ContentChunk[] = [];
      for (let i = 0; i < progress.totalChunks!; i++) {
        const chunkEntry = chunkMap.get(i);
        if (!chunkEntry) {
          throw new Error(`Missing chunk ${i}`);
        }
        orderedChunks.push(chunkEntry.chunk);
      }
      
      // Decrypt and reassemble
      const passphrase = getPassphrase();
      const key = await deriveKeyFromPassphrase(passphrase);
      
      const decryptedChunks: ArrayBuffer[] = [];
      for (const chunk of orderedChunks) {
        const decryptedChunk = await decryptData(key, chunk.encryptedData, chunk.iv);
        decryptedChunks.push(decryptedChunk);
      }
      
      // Concatenate chunks
      const totalSize = decryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const reassembledData = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of decryptedChunks) {
        reassembledData.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      
      // Create rendered content
      const renderedEntry: RenderedContent = {
        contentId,
        metadata,
        renderedAt: Date.now(),
        lastAccessed: Date.now()
      };
      
      if (metadata.contentType === ContentType.TEXT) {
        // Store text in memory
        const decoder = new TextDecoder();
        renderedEntry.textData = decoder.decode(reassembledData);
        log(`Text content rendered: ${renderedEntry.textData.length} characters`);
      } else {
        // Store binary content to disk cache
        const blob = new Blob([reassembledData], { type: metadata.metadata.mimeType });
        await diskCacheService.storeContent(
          contentId, 
          blob, 
          metadata.metadata.mimeType, 
          metadata.metadata.fileName
        );
        renderedEntry.diskCachePath = contentId;
        log(`Binary content stored to disk cache: ${blob.size} bytes`);
      }
      
      // Store rendered content
      renderedContentRef.current.set(contentId, renderedEntry);
      
      // Update progress
      progress.status = ContentStatus.RENDERED;
      progress.lastUpdated = Date.now();
      
      // Clear memory cache for this content
      clearMemoryCache(contentId);
      
      const renderTime = Date.now() - startTime;
      log(`Content ${contentId} rendered successfully in ${renderTime}ms`);
      
      triggerUpdate();
      triggerProgressUpdate();
      
    } catch (error) {
      log(`Error rendering content ${contentId}:`, error);
      progress.status = ContentStatus.ERROR;
      progress.errorMessage = error instanceof Error ? error.message : String(error);
      progress.lastUpdated = Date.now();
      triggerProgressUpdate();
    } finally {
      renderingInProgress.current.delete(contentId);
    }
  }, [log, getPassphrase, triggerUpdate, triggerProgressUpdate]);
  
  const clearMemoryCache = useCallback((contentId: string) => {
    log(`Clearing memory cache for ${contentId}`);
    
    // Remove from metadata cache
    metadataCacheRef.current.delete(contentId);
    
    // Remove from chunk cache
    chunkCacheRef.current.delete(contentId);
    
    // Remove from progress (keep only if still rendering)
    if (!renderingInProgress.current.has(contentId)) {
      contentProgressRef.current.delete(contentId);
    }
    
    triggerProgressUpdate();
  }, [log, triggerProgressUpdate]);
  
  // ===== SOCKET EVENT HANDLERS =====
  
  useEffect(() => {
    if (!socket) return;
    
    const handleContent = async (data: { sessionId: string, content: SharedContent, data?: string }) => {
      const { content, data: contentData } = data;
      log(`Received content metadata for ${content.contentId}`);
      
      addMetadata(content);
      
      // Handle non-chunked content
      if (!content.isChunked && contentData) {
        try {
          const passphrase = getPassphrase();
          const key = await deriveKeyFromPassphrase(passphrase);
          
          // Decrypt data
          const encryptedData = new Uint8Array(JSON.parse(contentData).encryptedData);
          const iv = new Uint8Array(content.encryptionMetadata?.iv || []);
          const decryptedData = await decryptData(key, encryptedData, iv);
          
          // Create rendered content directly
          const renderedEntry: RenderedContent = {
            contentId: content.contentId,
            metadata: content,
            renderedAt: Date.now(),
            lastAccessed: Date.now()
          };
          
          if (content.contentType === ContentType.TEXT) {
            const decoder = new TextDecoder();
            renderedEntry.textData = decoder.decode(decryptedData);
          } else {
            const blob = new Blob([decryptedData], { type: content.metadata.mimeType });
            await diskCacheService.storeContent(
              content.contentId, 
              blob, 
              content.metadata.mimeType, 
              content.metadata.fileName
            );
            renderedEntry.diskCachePath = content.contentId;
          }
          
          renderedContentRef.current.set(content.contentId, renderedEntry);
          
          // Update progress to rendered
          const progress = contentProgressRef.current.get(content.contentId);
          if (progress) {
            progress.status = ContentStatus.RENDERED;
            progress.progressPercentage = 100;
            progress.lastUpdated = Date.now();
          }
          
          triggerUpdate();
          triggerProgressUpdate();
          
        } catch (error) {
          log(`Error processing non-chunked content ${content.contentId}:`, error);
        }
      }
    };
    
    const handleChunk = async (data: { sessionId: string, chunk: any }) => {
      try {
        const { chunk: serializedChunk } = data;
        log(`Received chunk ${serializedChunk.chunkIndex}/${serializedChunk.totalChunks} for ${serializedChunk.contentId}`);
        
        const typedChunk: import('../utils/chunking').SerializedChunk = {
          contentId: serializedChunk.contentId as string,
          chunkIndex: serializedChunk.chunkIndex as number,
          totalChunks: serializedChunk.totalChunks as number,
          encryptedData: serializedChunk.encryptedData as number[],
          iv: serializedChunk.iv as number[]
        };
        
        const chunk = deserializeChunk(typedChunk);
        addChunk(chunk);
        
      } catch (error) {
        log('Error processing chunk:', error);
      }
    };
    
    socket.on('content', handleContent);
    socket.on('chunk', handleChunk);
    
    return () => {
      socket.off('content', handleContent);
      socket.off('chunk', handleChunk);
    };
  }, [socket, addMetadata, addChunk, getPassphrase, log, triggerUpdate, triggerProgressUpdate]);
  
  // ===== DOWNLOAD/COPY OPERATIONS =====
  
  const downloadContent = useCallback(async (contentId: string) => {
    const rendered = renderedContentRef.current.get(contentId);
    if (!rendered) return;
    
    if (rendered.textData) {
      // Download text content
      const blob = new Blob([rendered.textData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = rendered.metadata.metadata.fileName || 'content.txt';
      a.click();
      URL.revokeObjectURL(url);
    } else if (rendered.diskCachePath) {
      // Download from disk cache
      const blob = await diskCacheService.retrieveContent(contentId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = rendered.metadata.metadata.fileName || 'content';
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  }, []);
  
  const copyToClipboard = useCallback(async (contentId: string) => {
    const rendered = renderedContentRef.current.get(contentId);
    if (!rendered) return;
    
    if (rendered.textData) {
      await navigator.clipboard.writeText(rendered.textData);
    } else if (rendered.diskCachePath) {
      const blob = await diskCacheService.retrieveContent(contentId);
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
      }
    }
  }, []);
  
  // ===== PUBLIC API =====
  
  const operations = {
    addMetadata,
    getMetadata: (contentId: string) => metadataCacheRef.current.get(contentId),
    addChunk,
    getChunks: (contentId: string) => chunkCacheRef.current.get(contentId),
    getProgress: (contentId: string) => contentProgressRef.current.get(contentId),
    updateProgress,
    checkRenderCondition,
    renderContent,
    getRenderedContent: (contentId: string) => renderedContentRef.current.get(contentId),
    getAllRenderedContent: () => Array.from(renderedContentRef.current.values()),
    clearMemoryCache,
    clearAllMemoryCache: () => {
      metadataCacheRef.current.clear();
      chunkCacheRef.current.clear();
      contentProgressRef.current.clear();
      triggerProgressUpdate();
    },
    removeContent: async (contentId: string) => {
      clearMemoryCache(contentId);
      renderedContentRef.current.delete(contentId);
      await diskCacheService.clearContent(contentId);
      triggerUpdate();
    },
    downloadContent,
    copyToClipboard,
    getStats: () => ({
      totalMetadataEntries: metadataCacheRef.current.size,
      totalChunkEntries: Array.from(chunkCacheRef.current.values()).reduce((sum, map) => sum + map.size, 0),
      totalProgressEntries: contentProgressRef.current.size,
      totalRenderedEntries: renderedContentRef.current.size,
      memoryUsage: 0, // TODO: Calculate actual memory usage
      diskUsage: 0 // TODO: Get from disk cache service
    })
  };
  
  const cacheState: ContentCacheState = {
    metadataCache: metadataCacheRef.current,
    chunkCache: chunkCacheRef.current,
    contentProgress: contentProgressRef.current,
    renderedContent: renderedContentRef.current,
    stats: operations.getStats()
  };
  
  const getContentList = useCallback(() => {
    return Array.from(renderedContentRef.current.values()).map(r => r.metadata);
  }, [updateTrigger]);
  
  const getContent = useCallback((contentId: string) => {
    return renderedContentRef.current.get(contentId);
  }, [updateTrigger]);
  
  const clearSession = useCallback(async () => {
    operations.clearAllMemoryCache();
    renderedContentRef.current.clear();
    await diskCacheService.clearAll();
    triggerUpdate();
  }, [operations, triggerUpdate]);
  
  const getSessionStats = useCallback(() => ({
    totalContent: renderedContentRef.current.size,
    memoryUsage: 0, // TODO: Calculate
    diskUsage: 0, // TODO: Get from disk cache
    progressItems: contentProgressRef.current.size
  }), [updateTrigger, progressUpdateTrigger]);
  
  const contextValue: RefactoredContentStoreContextType = {
    cacheState,
    operations,
    getContentList,
    getContent,
    downloadContent,
    copyToClipboard,
    clearSession,
    getSessionStats
  };
  
  return (
    <RefactoredContentStoreContext.Provider value={contextValue}>
      {children}
    </RefactoredContentStoreContext.Provider>
  );
};

/**
 * Hook to use the refactored content store
 */
export const useRefactoredContentStore = (): RefactoredContentStoreContextType => {
  const context = useContext(RefactoredContentStoreContext);
  if (!context) {
    throw new Error('useRefactoredContentStore must be used within a RefactoredContentStoreProvider');
  }
  return context;
};