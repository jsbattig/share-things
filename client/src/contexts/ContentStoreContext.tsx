import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useServices } from './ServiceContext';
import { deriveKeyFromPassphrase, decryptData } from '../utils/encryption';
import { deserializeChunk } from '../utils/chunking';
import { ChunkStatus } from '../services/ChunkTrackingService';

// Content types
export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  OTHER = 'other'
}

// Content metadata interface
export interface ContentMetadata {
  fileName?: string;
  mimeType: string;
  size: number;
  textInfo?: {
    encoding: string;
    language?: string;
    lineCount?: number;
  };
  imageInfo?: {
    width: number;
    height: number;
    thumbnailData?: string;
    format: string;
  };
  fileInfo?: {
    extension: string;
    icon?: string;
  };
}

// Shared content interface
export interface SharedContent {
  contentId: string;
  senderId: string;
  senderName: string;
  contentType: ContentType;
  timestamp: number;
  metadata: ContentMetadata;
  isChunked: boolean;
  totalChunks?: number;
  totalSize: number;
  encryptionMetadata?: {
    iv: number[];
  };
}

// Content chunk interface
export interface ContentChunk {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  encryptedData: Uint8Array;
  iv: Uint8Array;
}

// Content entry interface
export interface ContentEntry {
  metadata: SharedContent;
  data?: Blob | string;
  lastAccessed: Date;
  isComplete: boolean;
}

// Chunk store interface
export interface ChunkStore {
  chunks: Map<number, ContentChunk>;
  totalChunks: number;
  receivedChunks: number;
}

// Pagination info interface
interface PaginationInfo {
  totalCount: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
}

// Content store context interface
interface ContentStoreContextType {
  contents: Map<string, ContentEntry>;
  paginationInfo: PaginationInfo | null;
  addContent: (content: SharedContent, data?: Blob | string) => void;
  addChunk: (chunk: ContentChunk) => Promise<boolean>;
  getContent: (contentId: string) => ContentEntry | undefined;
  getChunkStore: (contentId: string) => ChunkStore | undefined;
  updateContentLastAccessed: (contentId: string) => void;
  getContentList: () => SharedContent[];
  removeContent: (contentId: string) => Promise<boolean>;
  clearContents: () => void;
  clearSessionStorage: () => void;
  getCachedContentIds: () => string[];
  restoreCachedContent: () => string[];
  isContentComplete: (contentId: string) => boolean;
  updateSessionPassphrase: (passphrase: string) => void;
  loadMoreContent: () => Promise<void>;
}

// Create context
const ContentStoreContext = createContext<ContentStoreContextType | null>(null);

/**
 * Content store provider component
 */
export const ContentStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State
  const [contents, setContents] = useState<Map<string, ContentEntry>>(new Map());
  const [chunkStores, setChunkStores] = useState<Map<string, ChunkStore>>(new Map());
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null);
  
  // Use refs to store state directly - this will persist between renders and avoid stale closures
  const contentsRef = React.useRef<Map<string, ContentEntry>>(new Map());
  const chunkStoresRef = React.useRef<Map<string, ChunkStore>>(new Map());
  
  // Track reassembly operations to prevent multiple simultaneous reassemblies
  const reassemblyInProgress = React.useRef<Set<string>>(new Set());
  
  // Store current sessionId
  const currentSessionId = React.useRef<string | null>(null);
  
  // Keep refs in sync with state
  React.useEffect(() => {
    contentsRef.current = contents;
  }, [contents]);
  
  React.useEffect(() => {
    chunkStoresRef.current = chunkStores;
  }, [chunkStores]);
  
  // Socket context
  const socketContext = useSocket();
  const { socket } = socketContext;
  
  // Services
  const { chunkTrackingService, urlRegistry } = useServices();
  
  // Store socket in a ref to avoid dependency issues
  
  // Store the session passphrase using a ref for immediate access
  // This ensures all users in the session use the same passphrase for content encryption/decryption
  const sessionPassphraseRef = React.useRef<string>('');
  
  // Get session passphrase - this should be the same for all users in the session
  const getSessionPassphrase = (): string => {
    // If we have a stored session passphrase, use it
    if (sessionPassphraseRef.current) {
      console.log(`[ContentStore] Using stored session passphrase: ${sessionPassphraseRef.current.substring(0, 2)}***`);
      return sessionPassphraseRef.current;
    }
    // Otherwise fall back to localStorage (for backward compatibility)
    const fallbackPassphrase = localStorage.getItem('passphrase') || '';
    console.log(`[ContentStore] Using fallback passphrase from localStorage: ${fallbackPassphrase.substring(0, 2)}***`);
    return fallbackPassphrase;
  };
  
  // Update session passphrase when joining a session
  const updateSessionPassphrase = useCallback((passphrase: string) => {
    console.log(`[ContentStore] Setting session passphrase for content encryption: ${passphrase.substring(0, 2)}***`);
    sessionPassphraseRef.current = passphrase;
  }, []);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Handle content received
    const handleContent = async (data: { sessionId: string, content: SharedContent, data?: string }) => {
      const { sessionId, content, data: contentData } = data;
      
      // Store current sessionId
      currentSessionId.current = sessionId;
      const passphrase = getSessionPassphrase();
      
      // CRITICAL DIAGNOSTIC: Log content metadata timing
      console.log(`[METADATA-TIMING] Content metadata received for ${content.contentId}`);
      console.log(`[METADATA-TIMING] Current timestamp: ${Date.now()}`);
      console.log(`[METADATA-TIMING] Content is chunked: ${content.isChunked}, Total chunks: ${content.totalChunks}`);
      
      // Enhanced debug logging for content metadata
      console.log(`[ContentStore] Received content ID: ${content.contentId}, Timestamp: ${content.timestamp}, Type: ${typeof content.timestamp}`);
      console.log(`[ContentStore] Received content ID: ${content.contentId}, Size: ${content.metadata.size}, Type: ${typeof content.metadata.size}`);
      console.log(`[ContentStore] Received content sender: ${content.senderName} (${content.senderId})`);
      console.log(`[ContentStore] Full content metadata:`, JSON.stringify(content));
      
      // DEBUG: Log existing content IDs before adding new content
      console.log(`[ContentStore] Existing content IDs before adding:`, Array.from(contents.keys()));
      
      // CRITICAL FIX: Immediately store the content metadata in both state and ref
      console.log(`[METADATA-FIX] Storing content metadata immediately for ${content.contentId}`);
      
      // Update the ref immediately for synchronous access
      const newContentEntry: ContentEntry = {
        metadata: content,
        isComplete: !content.isChunked, // Non-chunked content is immediately complete
        lastAccessed: new Date(),
        data: undefined // Will be set when chunks are reassembled
      };
      
      contentsRef.current.set(content.contentId, newContentEntry);
      console.log(`[METADATA-FIX] Content metadata stored in ref, count: ${contentsRef.current.size}`);
      
      // Also update state for UI reactivity
      setContents(prevContents => {
        const newContents = new Map(prevContents);
        newContents.set(content.contentId, newContentEntry);
        console.log(`[METADATA-FIX] Content metadata stored in state, count: ${newContents.size}`);
        return newContents;
      });
      
      // Add content to store
      if (contentData) {
        try {
          // If data is provided, it's a small content that needs decryption
          let parsedData: Blob | string;
          
          // Convert base64 to array buffer for decryption
          const byteCharacters = atob(contentData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const encryptedData = new Uint8Array(byteNumbers).buffer;
          
          // Get IV from content metadata
          const iv = content.encryptionMetadata?.iv
            ? new Uint8Array(content.encryptionMetadata.iv)
            : new Uint8Array(12); // Fallback empty IV
          
          // Derive key from passphrase
          const key = await deriveKeyFromPassphrase(passphrase);
          
          // Decrypt the data
          const decryptedData = await decryptData(key, encryptedData, iv);
          
          if (content.contentType === ContentType.TEXT) {
            // For text content, convert to string
            const decoder = new TextDecoder();
            parsedData = decoder.decode(decryptedData);
          } else {
            // For binary content, create a blob
            parsedData = new Blob([decryptedData], { type: content.metadata.mimeType });
          }
          
          // CRITICAL FIX: Update existing content with decrypted data instead of calling addContent
          setContents(prevContents => {
            const newContents = new Map(prevContents);
            const existingContent = newContents.get(content.contentId);
            
            if (existingContent) {
              // Update existing content with decrypted data
              newContents.set(content.contentId, {
                ...existingContent,
                data: parsedData,
                isComplete: true,
                lastAccessed: new Date()
              });
              console.log(`[RENDER-FIX] Updated existing content ${content.contentId} with decrypted data`);
            } else {
              // Create new content entry with data
              newContents.set(content.contentId, {
                metadata: content,
                data: parsedData,
                isComplete: true,
                lastAccessed: new Date()
              });
              console.log(`[RENDER-FIX] Created new content ${content.contentId} with decrypted data`);
            }
            
            return newContents;
          });
        } catch (error) {
          console.error('Error decrypting content:', error);
          // Add content without data as a fallback
          addContent(content);
        }
      } else {
        // If no data is provided, it's a chunked content
        addContent(content);
      }
    };

    // Handle chunk received
    const handleChunk = async (data: { sessionId: string, chunk: { contentId: string; [key: string]: unknown } }) => {
      try {
        // Store current sessionId
        currentSessionId.current = data.sessionId;
        const { chunk: serializedChunk } = data;
        const passphrase = getSessionPassphrase();
        
        console.log(`[ContentStore] Received chunk data:`, serializedChunk);
        console.log(`[CHUNK-TIMING] Chunk ${serializedChunk.chunkIndex}/${serializedChunk.totalChunks} received for ${serializedChunk.contentId}`);
        
        // CRITICAL FIX: Simple but effective race condition handling
        // Check if content metadata exists, if not, process chunk anyway
        // The addChunk function will handle missing metadata gracefully
        // Use contentsRef for immediate synchronous access
        const contentExists = contentsRef.current.has(serializedChunk.contentId as string);
        console.log(`[ContentStore] Content metadata exists for ${serializedChunk.contentId}: ${contentExists}`);
        
        if (!contentExists) {
          console.log(`[RACE-CONDITION-FIX] Metadata missing for chunk ${serializedChunk.chunkIndex}, will process anyway`);
        }
        
        // DEBUG: Log all content IDs to help diagnose metadata issues
        console.log(`[ContentStore] All content IDs in store:`, Array.from(contents.keys()));
        
        // DIAGNOSTIC: Log detailed state for debugging
        console.log(`[DIAGNOSTIC] Content store state:`, {
          contentId: serializedChunk.contentId,
          contentsMapSize: contents.size,
          chunkStoresMapSize: chunkStoresRef.current.size,
          contentExists: contentExists,
          chunkStoreExists: chunkStoresRef.current.has(serializedChunk.contentId as string),
          allContentIds: Array.from(contents.keys()),
          allChunkStoreIds: Array.from(chunkStoresRef.current.keys())
        });
        
        // Create a properly typed SerializedChunk object from the received data
        const typedChunk: import('../utils/chunking').SerializedChunk = {
          contentId: serializedChunk.contentId as string,
          chunkIndex: serializedChunk.chunkIndex as number,
          totalChunks: serializedChunk.totalChunks as number,
          encryptedData: serializedChunk.encryptedData as number[],
          iv: serializedChunk.iv as number[]
        };
        
        // Deserialize the chunk
        const chunk = deserializeChunk(typedChunk);
        console.log(`[ContentStore] Deserialized chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId}`);
        
        // Track the chunk
        chunkTrackingService.trackChunk(chunk);
        
        // Add the chunk to the store
        const isComplete = await addChunk(chunk);
        console.log(`[ContentStore] Added chunk ${chunk.chunkIndex}/${chunk.totalChunks}, isComplete: ${isComplete}`);
        
        // If all chunks are received, decrypt and reassemble the content
        if (isComplete) {
          console.log(`[ContentStore] All chunks received for ${chunk.contentId}, starting reassembly`);
          
          // CRITICAL FIX: Ensure content is marked as complete BEFORE reassembly
          setContents(prev => {
            const newContents = new Map(prev);
            const content = newContents.get(chunk.contentId);
            
            if (content) {
              console.log(`[COMPLETION-FIX] Marking content ${chunk.contentId} as complete before reassembly`);
              newContents.set(chunk.contentId, {
                ...content,
                isComplete: true,
                lastAccessed: new Date()
              });
            } else {
              console.error(`[COMPLETION-FIX] Content ${chunk.contentId} not found in contents map during completion`);
            }
            
            return newContents;
          });
          
          // Use setTimeout to ensure state updates have been processed
          setTimeout(async () => {
            try {
              // Check if reassembly is already in progress to prevent multiple calls
              if (!reassemblyInProgress.current.has(chunk.contentId)) {
                reassemblyInProgress.current.add(chunk.contentId);
                try {
                  await decryptAndReassembleContent(chunk.contentId, passphrase);
                  console.log(`[ContentStore] Reassembly completed successfully for ${chunk.contentId}`);
                } finally {
                  reassemblyInProgress.current.delete(chunk.contentId);
                }
              } else {
                console.log(`[STORE] Reassembly already in progress for ${chunk.contentId.substring(0, 8)}, skipping duplicate call`);
              }
            } catch (error) {
              console.error(`[ContentStore] Error during reassembly for ${chunk.contentId}:`, error);
            }
          }, 100); // Small delay to ensure state updates have been processed
        }
      } catch (error) {
        console.error('Error handling chunk:', error);
      }
    };

    // Handle content removal by other clients
    const handleContentRemoved = (data: { sessionId: string, contentId: string }) => {
      console.log(`[DELETION-DEBUG] Received content-removed event for ${data.contentId}`);
      performLocalContentCleanup(data.contentId);
    };

    // Handle pagination info
    const handlePaginationInfo = (data: {
      sessionId: string;
      totalCount: number;
      currentPage: number;
      pageSize: number;
      hasMore: boolean;
    }) => {
      console.log(`[PAGINATION] Received pagination info: total=${data.totalCount}, page=${data.currentPage}, pageSize=${data.pageSize}, hasMore=${data.hasMore}`);
      setPaginationInfo({
        totalCount: data.totalCount,
        currentPage: data.currentPage,
        pageSize: data.pageSize,
        hasMore: data.hasMore
      });
    };

    // Add event listeners
    socket.on('content', handleContent);
    socket.on('chunk', handleChunk);
    socket.on('content-removed', handleContentRemoved);
    socket.on('content-pagination-info', handlePaginationInfo);

    // Clean up on unmount
    return () => {
      socket.off('content', handleContent);
      socket.off('chunk', handleChunk);
      socket.off('content-removed', handleContentRemoved);
      socket.off('content-pagination-info', handlePaginationInfo);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  /**
   * Adds content to the store
   * @param content Content metadata
   * @param data Optional content data
   */
  // Create stable function references that don't depend on state
  const addContent = React.useCallback((content: SharedContent, data?: Blob | string) => {
    // Use refs to check current state without causing re-renders
    const currentContents = contentsRef.current;
    
    // Check for existing content to prevent duplicates
    if (currentContents.has(content.contentId)) {
      return;
    }

    setContents(prevContents => {
      const newContents = new Map(prevContents);
      const contentEntry: ContentEntry = {
        metadata: content,
        data,
        lastAccessed: new Date(),
        // UNIFIED COMPLETION LOGIC: If we have data locally, it's complete
        // This ensures locally shared content is immediately marked as complete
        isComplete: data ? true : !content.isChunked
      };

      newContents.set(content.contentId, contentEntry);
      console.log(`[addContent] Added content ${content.contentId}, isComplete: ${contentEntry.isComplete}, hasData: ${!!data}, isChunked: ${content.isChunked}`);
      return newContents;
    });

    // Initialize chunk store for chunked content
    if (content.isChunked) {
      console.log('[ContentStore] Creating chunk store for chunked content:', content.contentId);
      setChunkStores(prevChunkStores => {
        const newChunkStores = new Map(prevChunkStores);
        newChunkStores.set(content.contentId, {
          chunks: new Map(),
          totalChunks: content.totalChunks || 0,
          receivedChunks: 0
        });
        return newChunkStores;
      });
    }
  }, []);


  /**
   * Adds a chunk to the store
   * @param chunk Content chunk
   * @returns Promise that resolves to true if all chunks are received
   */
  const addChunk = React.useCallback(async (chunk: ContentChunk): Promise<boolean> => {
    console.log(`[addChunk] Processing chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId}`);
    
    // Use refs to get current state without causing re-renders
    const currentContents = contentsRef.current;
    const currentChunkStores = chunkStoresRef.current;
    
    // Check if content metadata exists for this chunk
    const contentExists = currentContents.has(chunk.contentId);
    console.log(`[addChunk] Content metadata exists for ${chunk.contentId}: ${contentExists}`);
    
    // CRITICAL FIX: Skip chunk processing for locally shared content that's already complete
    if (contentExists) {
      const existingContent = currentContents.get(chunk.contentId);
      if (existingContent && existingContent.isComplete && existingContent.data) {
        console.log(`[addChunk] Skipping chunk processing for locally shared content ${chunk.contentId} - already complete with data`);
        return true; // Return true to indicate content is complete
      }
    }
    
    // ADDITIONAL FIX: Also check the contents state map for existing complete content
    const contentsMapContent = contents.get(chunk.contentId);
    if (contentsMapContent && contentsMapContent.isComplete && contentsMapContent.data) {
      console.log(`[addChunk] Skipping chunk processing for content ${chunk.contentId} - already complete in contents map`);
      return true; // Return true to indicate content is complete
    }
    
    // Check if this chunk already exists to prevent duplicate processing
    const existingChunkStore = currentChunkStores.get(chunk.contentId);
    if (existingChunkStore && existingChunkStore.chunks.has(chunk.chunkIndex)) {
      console.log(`[addChunk] Chunk ${chunk.chunkIndex} already exists for content ${chunk.contentId}, skipping duplicate`);
      return existingChunkStore.receivedChunks === existingChunkStore.totalChunks;
    }
    
    // If content metadata doesn't exist, try to find it by matching the first part of the ID
    if (!contentExists) {
      const shortId = chunk.contentId.substring(0, 8);
      console.log(`[addChunk] Content metadata not found, trying to find by prefix: ${shortId}`);
      
      let matchingContentId: string | undefined;
      
      for (const [key] of contents.entries()) {
        if (key.startsWith(shortId) || chunk.contentId.startsWith(key.substring(0, 8))) {
          console.log(`[addChunk] Found potential matching content with ID: ${key}`);
          matchingContentId = key;
          break;
        }
      }
      
      // If a matching content ID is found, update the chunk's content ID
      if (matchingContentId) {
        console.log(`[addChunk] Updating chunk contentId from ${chunk.contentId} to ${matchingContentId}`);
        chunk.contentId = matchingContentId;
      }
    }
    
    // Track the chunk in the tracking service
    chunkTrackingService.trackChunk(chunk);
    chunkTrackingService.updateChunkStatus(chunk.contentId, chunk.chunkIndex, ChunkStatus.PENDING);
    
    // CRITICAL FIX: Use a ref to store chunks directly
    // Get or create the chunk store for this content in the ref
    let store = chunkStoresRef.current.get(chunk.contentId);
    if (!store) {
      console.log(`[addChunk] Creating brand new chunk store for content ${chunk.contentId}`);
      store = {
        chunks: new Map(),
        totalChunks: chunk.totalChunks,
        receivedChunks: 0
      };
      chunkStoresRef.current.set(chunk.contentId, store);
    }
    
    // Add the chunk if it doesn't exist
    if (!store.chunks.has(chunk.chunkIndex)) {
      // Flag that a new chunk was added (for tracking purposes)
      console.log(`[addChunk] Adding new chunk ${chunk.chunkIndex} to store`);
      
      // Create a deep copy of the chunk to avoid reference issues
      const chunkCopy = {
        contentId: chunk.contentId,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        encryptedData: chunk.encryptedData,
        iv: chunk.iv
      };
      
      // Add the chunk to the store in the ref
      store.chunks.set(chunk.chunkIndex, chunkCopy);
      store.receivedChunks++;
      // Chunk was added successfully
      
      // Update the React state to trigger a re-render
      // But use the ref for the actual data
      setChunkStores(new Map(chunkStoresRef.current));
      
      // Log the current state of the chunk store
      console.log(`[addChunk] Updated chunk store, now have ${store.receivedChunks}/${store.totalChunks} chunks`);
      
      // Log all chunk indices we have so far
      const indices = Array.from(store.chunks.keys()).sort((a, b) => a - b);
      console.log(`[addChunk] Current chunks: [${indices.join(', ')}]`);
    } else {
      console.log(`[addChunk] Chunk ${chunk.chunkIndex} already exists in store, skipping`);
    }
    
    // Check if we have all chunks
    const allChunksReceived = store.receivedChunks === store.totalChunks;
    
    if (allChunksReceived) {
      console.log(`[addChunk] All chunks received (${store.receivedChunks}/${store.totalChunks}) for content ${chunk.contentId}`);
      
      // Update chunk status in tracking service
      chunkTrackingService.markContentProcessed(chunk.contentId);
      
      // Log the chunks we have to verify
      const chunkIndices = Array.from(store.chunks.keys()).sort((a: number, b: number) => a - b);
      console.log(`[addChunk] Received chunks: [${chunkIndices.join(', ')}]`);
      console.log(`[addChunk] Expected chunks: ${Array.from({length: store.totalChunks}, (_, i) => i).join(', ')}`);
      
      // Double-check that we have all expected chunks
      const hasAllChunks = Array.from({length: store.totalChunks}, (_, i) => i)
        .every(index => store.chunks.has(index));
      
      if (!hasAllChunks) {
        console.error(`[addChunk] Missing some chunks for content ${chunk.contentId}. Have ${chunkIndices.join(', ')}`);
        return false;
      }
      
      // Force update the content to mark it as complete
      // CRITICAL FIX: Check contentsRef first, then fallback to contents state
      let contentEntry = contentsRef.current.get(chunk.contentId);
      if (!contentEntry) {
        contentEntry = contents.get(chunk.contentId);
      }
      
      if (contentEntry) {
        console.log(`[addChunk] Marking content ${chunk.contentId} as complete`);
        
        // Create a new content entry with isComplete set to true
        const updatedContent = {
          ...contentEntry,
          isComplete: true,
          lastAccessed: new Date()
        };
        
        // Update the contents map
        setContents(prev => {
          const newContents = new Map(prev);
          newContents.set(chunk.contentId, updatedContent);
          return newContents;
        });
        
        // Immediately trigger reassembly without waiting for state updates
        console.log(`[addChunk] Immediately triggering reassembly for content ${chunk.contentId}`);
        const passphrase = localStorage.getItem('passphrase') || '';
        
        // Use setTimeout to ensure this runs after the current execution context
        // Add a slightly longer delay to ensure content metadata is available
        setTimeout(async () => {
          try {
            // Check if reassembly is already in progress to prevent multiple calls
            if (!reassemblyInProgress.current.has(chunk.contentId)) {
              reassemblyInProgress.current.add(chunk.contentId);
              try {
                await decryptAndReassembleContent(chunk.contentId, passphrase);
              } finally {
                reassemblyInProgress.current.delete(chunk.contentId);
              }
            } else {
              console.log(`[STORE] Reassembly already in progress for ${chunk.contentId.substring(0, 8)}, skipping duplicate call`);
            }
          } catch(error) {
            console.error(`[addChunk] Error during immediate reassembly: ${error}`);
            
            // If reassembly fails, try again after a short delay
            // This helps when content metadata arrives slightly after chunks
            setTimeout(async () => {
              try {
                console.log(`[addChunk] Retrying reassembly for content ${chunk.contentId} after delay`);
                // Check if reassembly is already in progress to prevent multiple calls
                if (!reassemblyInProgress.current.has(chunk.contentId)) {
                  reassemblyInProgress.current.add(chunk.contentId);
                  try {
                    await decryptAndReassembleContent(chunk.contentId, passphrase);
                  } finally {
                    reassemblyInProgress.current.delete(chunk.contentId);
                  }
                } else {
                  console.log(`[STORE] Reassembly already in progress for ${chunk.contentId.substring(0, 8)}, skipping retry call`);
                }
              } catch(retryError) {
                console.error(`[addChunk] Error during retry reassembly: ${retryError}`);
              }
            }, 500);
          }
        }, 100);
      } else {
        console.warn(`[addChunk] Content ${chunk.contentId} not found in contents map`);
      }
      
      return true;
    }
    
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Unified function to check if content is complete
   * Content is complete when:
   * 1. It has data locally (for sent content or small received content), OR
   * 2. It has metadata AND all chunks have been received (for chunked received content)
   */
  const isContentComplete = React.useCallback((contentId: string): boolean => {
    const content = contentsRef.current.get(contentId);
    const chunkStore = chunkStoresRef.current.get(contentId);
    
    if (!content) {
      return false;
    }
    
    // If we have data locally, it's complete regardless of chunking status
    if (content.data) {
      console.log(`[isContentComplete] Content ${contentId} is complete - has local data`);
      return true;
    }
    
    // If it's not chunked and we have metadata, it's complete
    if (!content.metadata.isChunked) {
      console.log(`[isContentComplete] Content ${contentId} is complete - not chunked with metadata`);
      return true;
    }
    
    // For chunked content, check if all chunks are received
    if (chunkStore && content.metadata.totalChunks) {
      const hasAllChunks = chunkStore.receivedChunks === content.metadata.totalChunks;
      console.log(`[isContentComplete] Content ${contentId} chunked completion: ${chunkStore.receivedChunks}/${content.metadata.totalChunks} chunks = ${hasAllChunks}`);
      return hasAllChunks;
    }
    
    console.log(`[isContentComplete] Content ${contentId} is not complete - missing chunks or metadata`);
    return false;
  }, []);

  /**
   * Decrypts and reassembles chunked content
   * @param contentId Content ID
   * @param passphrase Encryption passphrase
   */
  const decryptAndReassembleContent = async (contentId: string, passphrase: string): Promise<void> => {
    console.log(`[decryptAndReassemble] Starting reassembly for content ${contentId}`);
    
    // COMPREHENSIVE GUARD: Check if content is already complete and has valid blob/data
    const existingContent = contents.get(contentId);
    if (existingContent && existingContent.isComplete && existingContent.data) {
      // Check if data is a valid Blob or string
      const hasValidData = (existingContent.data instanceof Blob && existingContent.data.size > 0) ||
                          (typeof existingContent.data === 'string' && existingContent.data.length > 0);
      
      if (hasValidData) {
        console.log(`[decryptAndReassemble] Content ${contentId} already complete with valid data (${typeof existingContent.data}), skipping reassembly`);
        return;
      }
    }
    
    // ADDITIONAL GUARD: Check contentsRef for existing complete content
    const existingContentRef = contentsRef.current.get(contentId);
    if (existingContentRef && existingContentRef.isComplete && existingContentRef.data) {
      const hasValidDataRef = (existingContentRef.data instanceof Blob && existingContentRef.data.size > 0) ||
                             (typeof existingContentRef.data === 'string' && existingContentRef.data.length > 0);
      
      if (hasValidDataRef) {
        console.log(`[decryptAndReassemble] Content ${contentId} already complete in ref with valid data (${typeof existingContentRef.data}), skipping reassembly`);
        return;
      }
    }
    
    console.log(`[decryptAndReassemble] Current contents map has ${contents.size} entries`);
    console.log(`[decryptAndReassemble] Current content IDs before reassembly:`, Array.from(contents.keys()));
    console.log(`[decryptAndReassemble] Current chunkStores map has ${chunkStores.size} entries`);
    
    // Mark chunks as being processed in tracking service
    chunkTrackingService.markContentProcessed(contentId);
    
    // Force mark content as complete before reassembly
    setContents(prevContents => {
      const newContents = new Map(prevContents);
      const content = newContents.get(contentId);
      
      if (content && !content.isComplete) {
        console.log(`[decryptAndReassemble] Force marking content ${contentId} as complete before reassembly`);
        newContents.set(contentId, {
          ...content,
          isComplete: true,
          lastAccessed: new Date()
        });
      }
      
      console.log(`[decryptAndReassemble] Content count after marking complete: ${newContents.size}`);
      console.log(`[decryptAndReassemble] Content IDs after marking complete:`, Array.from(newContents.keys()));
      return newContents;
    });
    try {
      // Get content and chunk store
      // CRITICAL FIX: Check contentsRef first, then fallback to contents state
      let content = contentsRef.current.get(contentId);
      if (!content) {
        content = contents.get(contentId);
      }
      const chunkStore = chunkStoresRef.current.get(contentId);
      
      if (!chunkStore) {
        console.error(`[decryptAndReassemble] Chunk store not found for reassembly. Cannot proceed.`);
        return;
      }
      
      if (!content) {
        // This is a critical issue - content metadata is missing
        console.error(`[decryptAndReassemble] Content metadata not found for reassembly. This will cause "Unknown Sender" and missing metadata.`);
        console.error(`[decryptAndReassemble] Current contents map keys:`, Array.from(contents.keys()));
        
        // Log all content IDs to help debug
        console.log(`[decryptAndReassemble] All content IDs in store:`, Array.from(contents.keys()));
        console.log(`[decryptAndReassemble] Looking for content ID: ${contentId}`);
        
        // DEBUG: Log the first few characters of each content ID to help identify partial matches
        console.log(`[decryptAndReassemble] Content ID prefixes in store:`,
          Array.from(contents.keys()).map(id => `${id.substring(0, 8)} (${id})`));
        
        // Continue with reassembly attempt - but we know metadata will be missing
      }
      
      // If content is undefined, create a default content structure to use for reassembly
      // Try to extract filename from the first chunk's contentId
      const firstChunk = chunkStore.chunks.get(0);
      const possibleFilename = firstChunk ? `image-${firstChunk.contentId.substring(0, 8)}.png` : `image-${contentId.substring(0, 8)}.png`;
      
      // If content is missing, we need to create a fallback but also try to find it by a different key
      // This is a workaround for potential ID mismatch issues
      let effectiveContent = content;
      
      if (!effectiveContent) {
        // Try to find content by matching the first part of the ID (in case of ID format changes)
        const shortId = contentId.substring(0, 8);
        console.log(`[decryptAndReassemble] Trying to find content with ID starting with: ${shortId}`);
        
        // First try exact prefix match
        for (const [key, value] of contents.entries()) {
          if (key.startsWith(shortId) || contentId.startsWith(key.substring(0, 8))) {
            console.log(`[decryptAndReassemble] Found potential matching content with ID: ${key}`);
            effectiveContent = value;
            
            // Update the content map to include an entry with the chunk's content ID
            // This ensures future lookups will succeed
            if (key !== contentId) {
              console.log(`[decryptAndReassemble] Adding alias entry for content ID ${contentId} -> ${key}`);
              setContents(prev => {
                const newContents = new Map(prev);
                newContents.set(contentId, value);
                return newContents;
              });
            }
            
            break;
          }
        }
        
        // If still not found, try to find the most recently added content
        if (!effectiveContent && contents.size > 0) {
          console.log(`[decryptAndReassemble] No ID match found, trying to use most recent content`);
          
          // Convert to array and sort by timestamp (most recent first)
          const contentArray = Array.from(contents.entries())
            .map(([key, value]) => ({ key, value, timestamp: value.metadata.timestamp }))
            .sort((a, b) => b.timestamp - a.timestamp);
          
          if (contentArray.length > 0) {
            const mostRecent = contentArray[0];
            console.log(`[decryptAndReassemble] Using most recent content with ID: ${mostRecent.key}, timestamp: ${new Date(mostRecent.timestamp).toISOString()}`);
            
            effectiveContent = mostRecent.value;
            
            // Add an alias entry for this content ID
            console.log(`[decryptAndReassemble] Adding alias entry for content ID ${contentId} -> ${mostRecent.key}`);
            setContents(prev => {
              const newContents = new Map(prev);
              newContents.set(contentId, mostRecent.value);
              return newContents;
            });
          }
        }
      }
      
      // If still not found, use fallback
      if (!effectiveContent) {
        console.log(`[decryptAndReassemble] No matching content found, using fallback with default values`);
        
        // Try to extract sender info from localStorage if available
        const clientName = localStorage.getItem('clientName');
        const socketId = socket?.id; // Use the current socket directly
        
        // Try to determine content type from chunk data if available
        let defaultContentType = ContentType.TEXT; // Default to text instead of image
        let defaultMimeType = 'text/plain';
        
        // If we have chunk data, try to detect the type from the first chunk
        if (chunkStore.chunks.size > 0) {
          try {
            const firstChunk = chunkStore.chunks.get(0);
            if (firstChunk && firstChunk.encryptedData) {
              // Decrypt first chunk to check data signature
              const keyMaterial = await deriveKeyFromPassphrase(passphrase);
              const decryptedData = await decryptData(keyMaterial, firstChunk.encryptedData, firstChunk.iv);
              
              // Check for common image signatures
              const dataView = new Uint8Array(decryptedData);
              const signature = Array.from(dataView.slice(0, 8)).map((b: number) => b.toString(16).padStart(2, '0')).join('');
              
              if (signature.startsWith('89504e47')) { // PNG
                defaultContentType = ContentType.IMAGE;
                defaultMimeType = 'image/png';
              } else if (signature.startsWith('ffd8ff')) { // JPEG
                defaultContentType = ContentType.IMAGE;
                defaultMimeType = 'image/jpeg';
              } else if (signature.startsWith('47494638')) { // GIF
                defaultContentType = ContentType.IMAGE;
                defaultMimeType = 'image/gif';
              } else if (signature.startsWith('25504446')) { // PDF
                defaultContentType = ContentType.FILE;
                defaultMimeType = 'application/pdf';
              }
              // If no image signature detected, keep as text
            }
          } catch (error) {
            console.log(`[decryptAndReassemble] Could not detect content type from data, defaulting to text`);
          }
        }
        
        effectiveContent = {
          metadata: {
            contentId: contentId,
            senderId: socketId || 'unknown',
            senderName: clientName || 'Unknown Sender',
            contentType: defaultContentType,
            timestamp: Date.now(),
            metadata: {
              mimeType: defaultMimeType,
              size: 0, // Will be updated after reassembly
              fileName: possibleFilename, // Use a more descriptive filename
            },
            isChunked: true,
            totalChunks: chunkStore.totalChunks,
            totalSize: 0, // Will be updated after reassembly
          },
          lastAccessed: new Date(),
          isComplete: false
        };
        
        console.log(`[decryptAndReassemble] Created fallback content with sender: ${effectiveContent.metadata.senderName} (${effectiveContent.metadata.senderId}), detected type: ${defaultContentType}`);
      }
      
      // Log content info
      console.log(`[decryptAndReassemble] Content type: ${effectiveContent.metadata.contentType}, Total chunks: ${chunkStore.totalChunks}, Received chunks: ${chunkStore.receivedChunks}`);
      
      // Get all chunks in order
      const orderedChunks: ContentChunk[] = [];
      for (let i = 0; i < chunkStore.totalChunks; i++) {
        const chunk = chunkStore.chunks.get(i);
        if (chunk) {
          orderedChunks.push(chunk);
          console.log(`[decryptAndReassemble] Added chunk ${i} to ordered chunks array`);
        } else {
          console.error(`[decryptAndReassemble] Missing chunk ${i} for content ${contentId}`);
          
          // Log which chunks we do have
          const availableChunks = Array.from(chunkStore.chunks.keys()).sort((a, b) => a - b);
          console.log(`[decryptAndReassemble] Available chunks: [${availableChunks.join(', ')}]`);
          return;
        }
      }
      
      console.log(`[decryptAndReassemble] All ${orderedChunks.length} chunks collected in order`);
      
      // Derive key from passphrase
      const key = await deriveKeyFromPassphrase(passphrase);
      console.log(`[decryptAndReassemble] Key derived from passphrase`);
      console.log(`[decryptAndReassemble] Using passphrase: ${passphrase ? `${passphrase.substring(0, 2)}***` : 'undefined'}`);
      console.log(`[decryptAndReassemble] Passphrase length: ${passphrase ? passphrase.length : 0}`);
      
      // Decrypt and concatenate chunks
      const decryptedChunks: ArrayBuffer[] = [];
      
      for (const chunk of orderedChunks) {
        try {
          console.log(`[decryptAndReassemble] Decrypting chunk ${chunk.chunkIndex}`);
          
          // DIAGNOSTIC: Log encryption details before decryption
          console.log(`[DIAGNOSTIC] Chunk ${chunk.chunkIndex} encryption details:`, {
            encryptedDataLength: chunk.encryptedData.byteLength,
            ivLength: chunk.iv.byteLength,
            encryptedDataType: chunk.encryptedData.constructor.name,
            ivType: chunk.iv.constructor.name,
            keyType: key.constructor.name
          });
          
          // Decrypt chunk
          const decryptedChunk = await decryptData(key, chunk.encryptedData, chunk.iv);
          decryptedChunks.push(decryptedChunk);
          console.log(`[decryptAndReassemble] Chunk ${chunk.chunkIndex} decrypted successfully, size: ${decryptedChunk.byteLength} bytes`);
        } catch (error) {
          console.error(`[decryptAndReassemble] Error decrypting chunk ${chunk.chunkIndex}:`, error);
          
          // DIAGNOSTIC: Log detailed error information
          console.error(`[DIAGNOSTIC] Decryption failure details:`, {
            chunkIndex: chunk.chunkIndex,
            encryptedDataLength: chunk.encryptedData?.byteLength || 'undefined',
            ivLength: chunk.iv?.byteLength || 'undefined',
            errorMessage: error instanceof Error ? error.message : String(error),
            contentId: contentId,
            passphrase: passphrase ? `${passphrase.substring(0, 2)}***` : 'undefined',
            contentType: effectiveContent.metadata.contentType,
            errorStack: error instanceof Error ? error.stack : 'No stack trace'
          });
          
          // Mark content with decryption error for better user feedback
          setContents(prev => {
            const newContents = new Map(prev);
            const content = newContents.get(contentId);
            if (content) {
              newContents.set(contentId, {
                ...content,
                data: `[Decryption failed: ${error instanceof Error ? error.message : 'Wrong passphrase or corrupted data'}]`,
                isComplete: true,
                lastAccessed: new Date()
              });
            }
            return newContents;
          });
          
          // Clean up and return early
          console.log(`[decryptAndReassemble] Cleaning up after error for content ${contentId}`);
          
          // Remove from chunk stores to prevent memory leaks
          setChunkStores(prev => {
            const newStores = new Map(prev);
            newStores.delete(contentId);
            return newStores;
          });
          
          return;
        }
      }
      
      // Use a more direct approach for all images regardless of size
      console.log(`[decryptAndReassemble] Total chunks to reassemble: ${decryptedChunks.length}`);
      
      // Detect actual content type from decrypted data for legacy content
      const firstDecryptedChunk = new Uint8Array(decryptedChunks[0]);
      const header = firstDecryptedChunk.slice(0, 8);
      const hexSignature = Array.from(header).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      console.log(`[decryptAndReassemble] Data signature: ${hexSignature}`);
      console.log(`[decryptAndReassemble] First chunk size: ${firstDecryptedChunk.byteLength} bytes`);
      console.log(`[decryptAndReassemble] Header bytes: [${Array.from(header).join(', ')}]`);
      console.log(`[decryptAndReassemble] Expected PNG signature: 89504e470d0a1a0a`);
      console.log(`[decryptAndReassemble] Expected PNG bytes: [137, 80, 78, 71, 13, 10, 26, 10]`);
      
      let detectedContentType = effectiveContent.metadata.contentType;
      let detectedMimeType = effectiveContent.metadata.metadata.mimeType;
      
      // Check for PNG signature: 89 50 4E 47 0D 0A 1A 0A
      if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
        detectedContentType = ContentType.IMAGE;
        detectedMimeType = 'image/png';
        console.log(`[decryptAndReassemble] Detected PNG image, overriding content type from ${effectiveContent.metadata.contentType} to image`);
      }
      // Check for JPEG signature: FF D8 FF
      else if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
        detectedContentType = ContentType.IMAGE;
        detectedMimeType = 'image/jpeg';
        console.log(`[decryptAndReassemble] Detected JPEG image, overriding content type from ${effectiveContent.metadata.contentType} to image`);
      }
      // Check for GIF signature: 47 49 46 38
      else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
        detectedContentType = ContentType.IMAGE;
        detectedMimeType = 'image/gif';
        console.log(`[decryptAndReassemble] Detected GIF image, overriding content type from ${effectiveContent.metadata.contentType} to image`);
      }
      
      // For images, use a more memory-efficient approach with Blobs
      if (detectedContentType === ContentType.IMAGE) {
        console.log(`[decryptAndReassemble] Using direct Blob approach for image data`);
        
        try {
          // Create chunks of Blobs directly from decrypted chunks
          const chunkBlobs = decryptedChunks.map(chunk => new Blob([chunk]));
          console.log(`[decryptAndReassemble] Created ${chunkBlobs.length} chunk blobs`);
          
          // Create a single Blob from all chunk Blobs
          const mimeType = detectedMimeType || 'image/png';
          console.log(`[decryptAndReassemble] Creating final blob with MIME type: ${mimeType}`);
          
          // Create the blob with explicit type
          const reassembledBlob = new Blob(chunkBlobs, { type: mimeType });
          console.log(`[decryptAndReassemble] Created reassembled Blob of size: ${reassembledBlob.size} bytes`);
          
          // Create a temporary URL to verify the blob is valid
          try {
            const tempUrl = urlRegistry.createUrl(contentId, reassembledBlob);
            console.log(`[decryptAndReassemble] Successfully created URL from blob: ${tempUrl}`);
            
            // Clean up the URL immediately
            urlRegistry.revokeUrl(contentId, tempUrl);
          } catch (urlError) {
            console.error(`[decryptAndReassemble] Error creating URL from blob:`, urlError);
            // Continue anyway as this is just a test
          }
          
          // Immediately update content with the blob
          console.log(`[decryptAndReassemble] Updating content with reassembled Blob`);
          
          // CRITICAL FIX: Update both ref and state with the reassembled data
          const latestContent = contentsRef.current.get(contentId) || effectiveContent;
          
          // Create a properly typed ContentEntry
          const updatedContent: ContentEntry = {
            metadata: {
              ...latestContent.metadata,
              contentType: detectedContentType,
              // Ensure metadata has the correct size and MIME type
              metadata: {
                ...latestContent.metadata.metadata,
                size: reassembledBlob.size,
                mimeType: detectedMimeType,
                imageInfo: latestContent.metadata.contentType === ContentType.IMAGE ? {
                  // Safely copy existing image info properties or create default ones
                  width: latestContent.metadata.metadata.imageInfo?.width || 800,
                  height: latestContent.metadata.metadata.imageInfo?.height || 600,
                  format: latestContent.metadata.metadata.imageInfo?.format || 'png',
                  thumbnailData: latestContent.metadata.metadata.imageInfo?.thumbnailData
                } : undefined
              }
            },
            
            data: reassembledBlob,
            isComplete: true,
            lastAccessed: new Date()
          };
          
          // Update ref immediately for synchronous access
          contentsRef.current.set(contentId, updatedContent);
          console.log(`[decryptAndReassemble] Updated contentsRef with blob data`);
          
          // Also update state for UI reactivity
          setContents(prevContents => {
            const newContents = new Map(prevContents);
            newContents.set(contentId, updatedContent);
            
            console.log(`[decryptAndReassemble] Current content count before blob update: ${prevContents.size}`);
            console.log(`[decryptAndReassemble] Current content IDs before blob update:`, Array.from(prevContents.keys()));
            console.log(`[decryptAndReassemble] New content count: ${newContents.size}`);
            console.log(`[decryptAndReassemble] Content IDs in new map:`, Array.from(newContents.keys()));
            
            return newContents;
          });
          
          console.log(`[decryptAndReassemble] Content updated with Blob data, isComplete set to true`);
          // Use the content from the latest state instead of the variable from inside the state updater function
          console.log(`[decryptAndReassemble] Image info:`, contents.get(contentId)?.metadata.metadata.imageInfo);
          
          // Double-check after a short delay to ensure content is marked as complete
          setTimeout(() => {
            console.log(`[decryptAndReassemble] Running completion check for ${contentId}`);
            
            // CRITICAL FIX: Use the functional state update pattern to ensure we're working with the latest state
            setContents(prevContents => {
              const currentContent = prevContents.get(contentId);
              
              if (!currentContent || !currentContent.isComplete || !currentContent.data) {
                console.log(`[decryptAndReassemble] Content still not complete in timeout, forcing update`);
                console.log(`[decryptAndReassemble] Current content count in timeout: ${prevContents.size}`);
                console.log(`[decryptAndReassemble] Current content IDs in timeout:`, Array.from(prevContents.keys()));
                
                // Create a new map from the previous contents to maintain all existing content
                const newContents = new Map(prevContents);
                
                // Create a properly typed ContentEntry
                const finalContent: ContentEntry = {
                  metadata: {
                    ...(currentContent || effectiveContent).metadata,
                    // Ensure metadata has the correct size
                    metadata: {
                      ...(currentContent || effectiveContent).metadata.metadata,
                      size: reassembledBlob.size,
                      imageInfo: (currentContent || effectiveContent).metadata.contentType === ContentType.IMAGE ? {
                        // Safely copy existing image info properties or create default ones
                        width: (currentContent || effectiveContent).metadata.metadata.imageInfo?.width || 800,
                        height: (currentContent || effectiveContent).metadata.metadata.imageInfo?.height || 600,
                        format: (currentContent || effectiveContent).metadata.metadata.imageInfo?.format || 'png',
                        thumbnailData: (currentContent || effectiveContent).metadata.metadata.imageInfo?.thumbnailData
                      } : undefined
                    }
                  },
                  data: reassembledBlob,
                  isComplete: true,
                  lastAccessed: new Date()
                };
                
                // Update just this specific content entry while preserving all others
                newContents.set(contentId, finalContent);
                
                console.log(`[decryptAndReassemble] New content count in timeout: ${newContents.size}`);
                console.log(`[decryptAndReassemble] Content IDs in timeout after update:`, Array.from(newContents.keys()));
                console.log(`[decryptAndReassemble] Final content with image info:`, finalContent.metadata.metadata.imageInfo);
                
                return newContents;
              } else {
                console.log(`[decryptAndReassemble] Content already complete in timeout check`);
                return prevContents; // No changes needed
              }
            });
          }, 500);
          
          // Remove chunk store to free memory
          setChunkStores(prevChunkStores => {
            const newChunkStores = new Map(prevChunkStores);
            console.log(`[decryptAndReassemble] Removing chunk store to free memory`);
            newChunkStores.delete(contentId);
            return newChunkStores;
          });
          
          // Also remove from chunkStoresRef.current
          if (chunkStoresRef.current.has(contentId)) {
            console.log(`[decryptAndReassemble] Removing from chunkStoresRef.current`);
            chunkStoresRef.current.delete(contentId);
          }
          
          // Mark content as displayed in tracking service
          chunkTrackingService.markContentDisplayed(contentId);
          
          console.log(`[decryptAndReassemble] Content ${contentId} successfully reassembled and stored as Blob`);
          
          // For images, we'll skip the rest of the function
          return;
        } catch (error) {
          console.error(`[decryptAndReassemble] Error creating Blob for image:`, error);
          // Fall back to the standard approach if Blob creation fails
        }
      }
      
      // For non-image content or if the Blob approach failed, use the standard approach
      console.log(`[decryptAndReassemble] Using standard approach for content reassembly`);
      const totalLength = decryptedChunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      console.log(`[decryptAndReassemble] Total reassembled data length: ${totalLength} bytes`);
      
      // Create a single Uint8Array for the content
      const reassembledData = new Uint8Array(totalLength);
      
      let offset = 0;
      for (const chunk of decryptedChunks) {
        reassembledData.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      console.log(`[decryptAndReassemble] All chunks concatenated successfully`);
      
      // Create final blob or text based on content type
      let finalData: Blob | string;
      
      if (effectiveContent.metadata.contentType === ContentType.TEXT) {
        // Convert to text
        const decoder = new TextDecoder();
        finalData = decoder.decode(reassembledData);
        console.log(`[decryptAndReassemble] Converted to text, length: ${finalData.length} chars`);
      } else {
        try {
          // Create blob with explicit type
          const mimeType = effectiveContent.metadata.metadata.mimeType || 'application/octet-stream';
          console.log(`[decryptAndReassemble] Creating blob with MIME type: ${mimeType}`);
          
          // Log the size of the data we're trying to create a blob from
          console.log(`[decryptAndReassemble] Creating blob from data of size: ${reassembledData.byteLength} bytes`);
          
          // Create the blob in a try-catch to catch any memory errors
          try {
            finalData = new Blob([reassembledData], { type: mimeType });
            console.log(`[decryptAndReassemble] Created blob successfully, size: ${finalData.size} bytes, type: ${finalData.type}`);
          } catch (blobError) {
            console.error(`[decryptAndReassemble] Error creating blob:`, blobError);
            throw blobError;
          }
          
          // For images, skip the test image creation which might cause issues
          if (effectiveContent.metadata.contentType === ContentType.IMAGE) {
            console.log(`[decryptAndReassemble] Skipping test image creation for image content`);
          } else {
            // For non-image content, we can still test the blob
            // Create a temporary URL to verify the blob is valid
            let tempUrl: string | undefined;
            try {
              tempUrl = urlRegistry.createUrl(contentId, finalData);
              console.log(`[decryptAndReassemble] Created temporary URL: ${tempUrl}`);
              
              // Clean up the URL after a short delay
              setTimeout(() => {
                if (tempUrl) {
                  urlRegistry.revokeUrl(contentId, tempUrl);
                  console.log(`[decryptAndReassemble] Revoked temporary URL`);
                }
              }, 1000);
            } catch (urlError) {
              console.error(`[decryptAndReassemble] Error creating object URL:`, urlError);
              // Continue anyway, as this is just a test
            }
          }
        } catch (error) {
          console.error(`[decryptAndReassemble] Error creating blob:`, error);
          throw error;
        }
      }
      
      // Update content with reassembled data
      console.log(`[decryptAndReassemble] Updating content with reassembled data`);
      
      // Get the latest content entry from ref
      const latestContent = contentsRef.current.get(contentId) || effectiveContent;
      
      // Create a properly typed ContentEntry
      const updatedEntry: ContentEntry = {
        metadata: latestContent.metadata,
        data: finalData,
        isComplete: true,
        lastAccessed: new Date()
      };
      
      // Update ref immediately for synchronous access
      contentsRef.current.set(contentId, updatedEntry);
      console.log(`[decryptAndReassemble] Updated contentsRef with text/blob data`);
      
      // Also update state for UI reactivity
      setContents(prevContents => {
        const newContents = new Map(prevContents);
        newContents.set(contentId, updatedEntry);
        
        console.log(`[decryptAndReassemble] Current content count before non-image update: ${prevContents.size}`);
        console.log(`[decryptAndReassemble] Current content IDs before non-image update:`, Array.from(prevContents.keys()));
        console.log(`[decryptAndReassemble] New content count after non-image update: ${newContents.size}`);
        console.log(`[decryptAndReassemble] Content IDs after non-image update:`, Array.from(newContents.keys()));
        console.log(`[decryptAndReassemble] Content updated with data, isComplete set to true`);
        return newContents;
      });
      
      // Double-check after a short delay to ensure content is marked as complete
      setTimeout(() => {
        setContents(prevContents => {
          const newContents = new Map(prevContents);
          const currentContent = prevContents.get(contentId);
          
          if (currentContent) {
            console.log(`[decryptAndReassemble] Final check: Force marking content ${contentId} as complete`);
            console.log(`[decryptAndReassemble] Current content count in final check: ${prevContents.size}`);
            console.log(`[decryptAndReassemble] Current content IDs in final check:`, Array.from(prevContents.keys()));
            
            // Create a properly typed ContentEntry
            const finalContent: ContentEntry = {
              metadata: {
                ...currentContent.metadata,
                // Ensure metadata has the correct size if we have data
                metadata: {
                  ...currentContent.metadata.metadata,
                  size: currentContent.data instanceof Blob ? currentContent.data.size : currentContent.metadata.metadata.size,
                  imageInfo: currentContent.metadata.contentType === ContentType.IMAGE ? {
                    // Safely copy existing image info properties or create default ones
                    width: currentContent.metadata.metadata.imageInfo?.width || 800,
                    height: currentContent.metadata.metadata.imageInfo?.height || 600,
                    format: currentContent.metadata.metadata.imageInfo?.format || 'png',
                    thumbnailData: currentContent.metadata.metadata.imageInfo?.thumbnailData
                  } : undefined
                }
              },
              data: currentContent.data,
              isComplete: true,
              lastAccessed: new Date()
            };
            
            // Update just this specific content entry while preserving all others
            newContents.set(contentId, finalContent);
            
            console.log(`[decryptAndReassemble] New content count in final check: ${newContents.size}`);
            console.log(`[decryptAndReassemble] Content IDs in final check after update:`, Array.from(newContents.keys()));
            console.log(`[decryptAndReassemble] Final check content with image info:`, finalContent.metadata.metadata.imageInfo);
          }
          
          return newContents;
        });
      }, 500);
      
      // Remove chunk store to free memory
      setChunkStores(prevChunkStores => {
        const newChunkStores = new Map(prevChunkStores);
        console.log(`[decryptAndReassemble] Removing chunk store to free memory`);
        newChunkStores.delete(contentId);
        return newChunkStores;
      });
      
      // Also remove from chunkStoresRef.current
      if (chunkStoresRef.current.has(contentId)) {
        console.log(`[decryptAndReassemble] Removing from chunkStoresRef.current`);
        chunkStoresRef.current.delete(contentId);
      }
      
      // Mark content as displayed in tracking service
      chunkTrackingService.markContentDisplayed(contentId);
      
      console.log(`[decryptAndReassemble] Content ${contentId} successfully reassembled and stored`);
      
      // Force a final state update to ensure UI reactivity
      setContents(prevContents => {
        const newContents = new Map(prevContents);
        const currentContent = newContents.get(contentId);
        if (currentContent) {
          console.log(`[decryptAndReassemble] Final UI update for content ${contentId}`);
          // Create a new object to force React to detect the change
          newContents.set(contentId, { ...currentContent });
        }
        return newContents;
      });
    } catch (error) {
      console.error('[decryptAndReassemble] Error decrypting and reassembling content:', error);
      
      // Even in case of error, try to clean up any partial resources
      // This prevents resource leaks when reassembly fails
      try {
        if (chunkStoresRef.current.has(contentId)) {
          console.log(`[decryptAndReassemble] Cleaning up after error for content ${contentId}`);
          chunkStoresRef.current.delete(contentId);
          
          setChunkStores(prevChunkStores => {
            const newChunkStores = new Map(prevChunkStores);
            newChunkStores.delete(contentId);
            return newChunkStores;
          });
        }
      } catch (cleanupError) {
        console.error('[decryptAndReassemble] Error during cleanup after reassembly failure:', cleanupError);
      }
    }
  };
  
  /**
   * Gets content from the store
   * @param contentId Content ID
   * @returns Content entry or undefined if not found
   */
  // Create stable references that only change when content count changes
  const contentCount = contents.size;
  const contentKeys = React.useMemo(() => Array.from(contents.keys()).sort().join(','), [contents]);
  const contentStates = React.useMemo(() => {
    // Create a hash of content states to detect when content is updated (not just added/removed)
    return Array.from(contents.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, entry]) => `${id}:${entry.isComplete}:${!!entry.data}`)
      .join('|');
  }, [contents]);

  const getContent = React.useCallback((contentId: string): ContentEntry | undefined => {
    const content = contents.get(contentId);
    
    // Don't update last accessed time during render as it causes infinite loops
    // Instead, we'll update it only when content is actually accessed for operations
    // like copying, downloading, etc.
    
    return content;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentCount, contentKeys, contentStates]); // contentCount, contentKeys, and contentStates used intentionally for performance optimization

  /**
   * Gets a list of all content
   * @returns Array of content metadata
   */
  const getContentList = React.useCallback((): SharedContent[] => {
    return Array.from(contents.values()).map(entry => entry.metadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKeys, contentStates]); // contentKeys and contentStates used intentionally for performance optimization

  /**
   * Performs local cleanup of content (used both for local removal and when receiving content-removed events)
   */
  const performLocalContentCleanup = React.useCallback((contentId: string) => {
    console.log(`[DELETION-DEBUG] Performing local cleanup for content: ${contentId}`);
    
    // 1. Revoke all URL objects for this content (don't preserve any URLs when explicitly removing content)
    console.log(`[DELETION-DEBUG] Step 1: Revoking URLs for ${contentId}`);
    urlRegistry.revokeAllUrls(contentId, false);
    
    // 2. & 3. Remove content and chunk store - batch these updates
    console.log(`[DELETION-DEBUG] Step 2-3: Removing from state maps`);
    React.startTransition(() => {
      setContents(prevContents => {
        const newContents = new Map(prevContents);
        const wasDeleted = newContents.delete(contentId);
        console.log(`[DELETION-DEBUG] Content deleted from contents map: ${wasDeleted}, new size: ${newContents.size}`);
        return newContents;
      });
      
      setChunkStores(prevChunkStores => {
        const newChunkStores = new Map(prevChunkStores);
        const wasDeleted = newChunkStores.delete(contentId);
        console.log(`[DELETION-DEBUG] Chunk store deleted from chunk stores map: ${wasDeleted}, new size: ${newChunkStores.size}`);
        return newChunkStores;
      });
    });
    
    // 4. Remove from chunkStoresRef.current
    if (chunkStoresRef.current.has(contentId)) {
      console.log(`[DELETION-DEBUG] Step 4: Removing content from chunkStoresRef: ${contentId}`);
      const wasDeleted = chunkStoresRef.current.delete(contentId);
      console.log(`[DELETION-DEBUG] Removed from chunkStoresRef: ${wasDeleted}, new size: ${chunkStoresRef.current.size}`);
    } else {
      console.log(`[DELETION-DEBUG] Step 4: Content ${contentId} not found in chunkStoresRef`);
    }
    
    // 5. Clean up any remaining chunks in tracking service
    console.log(`[DELETION-DEBUG] Step 5: Cleaning up chunks in tracking service`);
    chunkTrackingService.cleanupChunks(contentId);
    
    // 6. CRITICAL: Clear from sessionStorage to prevent resurrection on reload
    console.log(`[DELETION-DEBUG] Step 6: Clearing from sessionStorage to prevent resurrection`);
    try {
      const cachedState = sessionStorage.getItem('contentStoreState');
      if (cachedState) {
        const parsedState = JSON.parse(cachedState);
        if (parsedState.contents && parsedState.contents[contentId]) {
          delete parsedState.contents[contentId];
          sessionStorage.setItem('contentStoreState', JSON.stringify(parsedState));
          console.log(`[DELETION-DEBUG] Removed ${contentId} from sessionStorage cache`);
        }
      }
    } catch (error) {
      console.error(`[DELETION-DEBUG] Error clearing sessionStorage:`, error);
    }
    
    console.log(`[DELETION-DEBUG] Local cleanup completed for ${contentId}`);
  }, [urlRegistry, chunkTrackingService]);

  /**
   * Removes content from the store
   * @param contentId Content ID
   * @returns True if content was removed
   */
  const removeContent = React.useCallback(async (contentId: string): Promise<boolean> => {
    const content = contents.get(contentId);
    
    if (!content) {
      console.log(`[DELETION-DEBUG] Content ${contentId} not found for removal`);
      return false;
    }
    
    console.log(`[DELETION-DEBUG] Starting removal of content: ${contentId}`);
    console.log(`[DELETION-DEBUG] Content metadata:`, content.metadata);
    console.log(`[DELETION-DEBUG] Content is complete: ${content.isComplete}`);
    console.log(`[DELETION-DEBUG] Current contents count: ${contents.size}`);
    console.log(`[DELETION-DEBUG] Current chunk stores count: ${chunkStoresRef.current.size}`);
    
    // CRITICAL FIX: First notify the server to remove the content
    console.log(`[DELETION-DEBUG] Step 1: Notifying server to remove content from session`);
    try {
      const sessionId = currentSessionId.current || localStorage.getItem('sessionId');
      if (socketContext && socket && sessionId) {
        const result = await socketContext.removeContent(sessionId, contentId);
        if (!result.success) {
          console.error(`[DELETION-DEBUG] Server failed to remove content: ${result.error}`);
          // Continue with local cleanup even if server removal fails
        } else {
          console.log(`[DELETION-DEBUG] Server successfully removed content ${contentId}`);
        }
      } else {
        console.warn(`[DELETION-DEBUG] No active session found, performing local cleanup only`);
      }
    } catch (error) {
      console.error(`[DELETION-DEBUG] Error communicating with server:`, error);
      // Continue with local cleanup even if server communication fails
    }
    
    // Perform local cleanup (this will also be triggered by the content-removed event)
    performLocalContentCleanup(contentId);
    
    return true;
  }, [contents, socketContext, socket, performLocalContentCleanup]);

  /**
   * Clears all content from the store
   */
  const clearContents = React.useCallback(() => {
    // Get all content IDs
    const contentIds = Array.from(contents.keys());
    
    // Revoke all URLs for all contents (don't preserve any URLs when clearing all contents)
    contentIds.forEach(contentId => {
      urlRegistry.revokeAllUrls(contentId, false);
      chunkTrackingService.cleanupChunks(contentId);
    });
    
    // Clear all content and chunk stores - batch these updates
    React.startTransition(() => {
      setContents(new Map());
      setChunkStores(new Map());
    });
    chunkStoresRef.current.clear();
  }, [contents, urlRegistry, chunkTrackingService]);

  /**
   * Updates the last accessed time for a content item
   * This should be called explicitly when content is accessed for operations
   * like copying, downloading, etc., not during rendering
   * @param contentId Content ID
   */
  const updateContentLastAccessed = React.useCallback((contentId: string): void => {
    const content = contents.get(contentId);
    
    if (content) {
      setContents(prevContents => {
        const newContents = new Map(prevContents);
        newContents.set(contentId, {
          ...content,
          lastAccessed: new Date()
        });
        return newContents;
      });
    }
  }, [contents]);

  /**
   * Gets a chunk store for a content ID
   * @param contentId Content ID
   * @returns Chunk store or undefined if not found
   */
  const getChunkStore = React.useCallback((contentId: string): ChunkStore | undefined => {
    return chunkStoresRef.current.get(contentId);
  }, []);

  /**
   * Completely clears sessionStorage for debugging
   */
  const clearSessionStorage = React.useCallback(() => {
    try {
      sessionStorage.removeItem('contentStoreState');
    } catch (error) {
      console.error('[STORE] Error clearing sessionStorage:', error);
    }
  }, []);

  /**
   * Gets cached content IDs for session sync
   */
  const getCachedContentIds = React.useCallback((): string[] => {
    return Array.from(contents.keys());
  }, [contents]);

  /**
   * Restores cached content by emitting to self using existing handlers
   * Returns array of content IDs that were restored
   */
  const restoreCachedContent = React.useCallback((): string[] => {
    const restoredIds: string[] = [];
    
    try {
      const savedState = sessionStorage.getItem('contentStoreState');
      if (!savedState) {
        return restoredIds;
      }

      const parsedState = JSON.parse(savedState);
      const parsedContents = parsedState.contents || [];
      
      // Emit each cached content to self using existing handlers
      for (const [contentId, contentEntry] of parsedContents) {
        if (contentEntry.metadata && contentEntry.isComplete) {
          // KISS: Check if this is a serialized blob placeholder (which means no actual blob data)
          const isSerializedBlobPlaceholder = contentEntry.data &&
            typeof contentEntry.data === 'object' &&
            contentEntry.data._blobType &&
            contentEntry.data._blobData === null;
          
          if (isSerializedBlobPlaceholder) {
            // KISS: This is a blob placeholder without actual data - mark as incomplete
            addContent(contentEntry.metadata, undefined);
            restoredIds.push(contentId);
          } else if (contentEntry.data) {
            // Use the existing addContent function to restore cached content with actual data
            addContent(contentEntry.metadata, contentEntry.data);
            restoredIds.push(contentId);
          } else {
            // No data at all
            addContent(contentEntry.metadata, undefined);
            restoredIds.push(contentId);
          }
        }
      }
    } catch (error) {
      console.error('[STORE] Error restoring cached content:', error);
    }
    
    return restoredIds;
  }, [addContent]);

  /**
   * Load more content using pagination
   */
  const loadMoreContent = useCallback(async () => {
    if (!socket || !paginationInfo || !paginationInfo.hasMore) {
      console.log('[PAGINATION] Cannot load more: no socket, pagination info, or no more content');
      return;
    }

    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      console.error('[PAGINATION] No session ID found');
      return;
    }

    try {
      const nextOffset = paginationInfo.currentPage * paginationInfo.pageSize;
      console.log(`[PAGINATION] Loading more content: offset=${nextOffset}, limit=${paginationInfo.pageSize}`);
      
      // Use the existing list-content endpoint
      socket.emit('list-content', {
        sessionId,
        offset: nextOffset,
        limit: paginationInfo.pageSize
      }, (response: { success: boolean; content?: unknown[]; totalCount?: number; hasMore?: boolean; error?: string }) => {
        if (response.success && response.content) {
          console.log(`[PAGINATION] Received ${response.content.length} more items`);
          
          // Update pagination info
          setPaginationInfo(prev => prev ? {
            totalCount: response.totalCount || prev.totalCount,
            currentPage: prev.currentPage + 1,
            pageSize: prev.pageSize,
            hasMore: response.hasMore || false
          } : null);

          // The content will be automatically added through the 'content' and 'chunk' event handlers
          // when the server sends the content items
        } else {
          console.error('[PAGINATION] Failed to load more content:', response.error);
        }
      });
    } catch (error) {
      console.error('[PAGINATION] Error loading more content:', error);
    }
  }, [socket, paginationInfo]);

  // Context value - properly memoized to prevent unnecessary re-renders
  const value: ContentStoreContextType = React.useMemo(() => ({
    contents,
    paginationInfo,
    addContent,
    addChunk,
    getContent,
    getChunkStore,
    updateContentLastAccessed,
    getContentList,
    removeContent,
    clearContents,
    clearSessionStorage,
    getCachedContentIds,
    restoreCachedContent,
    isContentComplete,
    updateSessionPassphrase,
    loadMoreContent
  }), [
    contents,
    paginationInfo,
    addContent,
    addChunk,
    getContent,
    getChunkStore,
    updateContentLastAccessed,
    getContentList,
    removeContent,
    clearContents,
    clearSessionStorage,
    getCachedContentIds,
    restoreCachedContent,
    isContentComplete,
    updateSessionPassphrase,
    loadMoreContent
  ]);

  // Set up periodic cleanup for orphaned chunks and URLs
  useEffect(() => {
    // Run cleanup every 30 minutes (increased from 5 minutes to be less aggressive)
    const cleanupInterval = setInterval(() => {
      console.log('[ChunkCleanup] Running periodic cleanup');
      
      // Get all content IDs from the contents map
      const activeContentIds = new Set(Array.from(contents.keys()));
      
      // Only clean up chunks that are definitely orphaned (no corresponding content)
      // and have been processed (not pending chunks)
      for (const [contentId] of chunkStoresRef.current.entries()) {
        if (!activeContentIds.has(contentId)) {
          // Check if this content has been fully processed before cleaning it up
          const trackedChunks = chunkTrackingService.getTrackedChunks(contentId);
          const allProcessed = trackedChunks && Array.from(trackedChunks.values()).every(
            chunk => chunk.status === ChunkStatus.PROCESSED || chunk.status === ChunkStatus.DISPLAYED
          );
          
          if (allProcessed) {
            console.log(`[ChunkCleanup] Found orphaned chunks for content ${contentId}, cleaning up`);
            chunkStoresRef.current.delete(contentId);
            
            setChunkStores(prevChunkStores => {
              const newChunkStores = new Map(prevChunkStores);
              newChunkStores.delete(contentId);
              return newChunkStores;
            });
          } else {
            console.log(`[ChunkCleanup] Found chunks for content ${contentId}, but they're still being processed. Skipping cleanup.`);
          }
        }
      }
      
      // Only clean up URLs for content that is definitely gone
      urlRegistry.cleanupOrphanedUrls(activeContentIds);
      
      // Only clean up tracked chunks for content that is definitely gone and processed
      const orphanedContentIds = chunkTrackingService.findOrphanedChunks(activeContentIds);
      orphanedContentIds.forEach(contentId => {
        // Check if this content has been fully processed before cleaning it up
        const trackedChunks = chunkTrackingService.getTrackedChunks(contentId);
        const allProcessed = trackedChunks && Array.from(trackedChunks.values()).every(
          chunk => chunk.status === ChunkStatus.PROCESSED || chunk.status === ChunkStatus.DISPLAYED
        );
        
        if (allProcessed) {
          console.log(`[ChunkCleanup] Cleaning up orphaned tracked chunks for content ${contentId}`);
          chunkTrackingService.cleanupChunks(contentId);
        }
      });
    }, 30 * 60 * 1000); // 30 minutes
    
    // Clean up on unmount
    return () => {
      clearInterval(cleanupInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkTrackingService, urlRegistry]);

  return (
    <ContentStoreContext.Provider value={value}>
      {children}
    </ContentStoreContext.Provider>
  );
};

/**
 * Hook to use the content store context
 */
export const useContentStore = (): ContentStoreContextType => {
  const context = useContext(ContentStoreContext);
  
  if (!context) {
    throw new Error('useContentStore must be used within a ContentStoreProvider');
  }
  
  return context;
};