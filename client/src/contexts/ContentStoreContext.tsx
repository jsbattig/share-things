import React, { createContext, useContext, useState, useEffect } from 'react';
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

// Content store context interface
interface ContentStoreContextType {
  contents: Map<string, ContentEntry>;
  addContent: (content: SharedContent, data?: Blob | string) => void;
  addChunk: (chunk: ContentChunk) => Promise<boolean>;
  getContent: (contentId: string) => ContentEntry | undefined;
  getChunkStore: (contentId: string) => ChunkStore | undefined;
  updateContentLastAccessed: (contentId: string) => void;
  getContentList: () => SharedContent[];
  removeContent: (contentId: string) => boolean;
  clearContents: () => void;
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
  
  // Use a ref to store chunks directly - this will persist between renders
  const chunkStoresRef = React.useRef<Map<string, ChunkStore>>(new Map());
  
  // Socket context
  const { socket } = useSocket();
  
  // Services
  const { chunkTrackingService, urlRegistry } = useServices();
  
  // Store socket in a ref to avoid dependency issues
  
  // Get passphrase from localStorage
  const getPassphrase = (): string => {
    return localStorage.getItem('passphrase') || '';
  };

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Handle content received
    const handleContent = async (data: { sessionId: string, content: SharedContent, data?: string }) => {
      const { content, data: contentData } = data;
      const passphrase = getPassphrase();
      
      // Enhanced debug logging for content metadata
      console.log(`[ContentStore] Received content ID: ${content.contentId}, Timestamp: ${content.timestamp}, Type: ${typeof content.timestamp}`);
      console.log(`[ContentStore] Received content ID: ${content.contentId}, Size: ${content.metadata.size}, Type: ${typeof content.metadata.size}`);
      console.log(`[ContentStore] Received content sender: ${content.senderName} (${content.senderId})`);
      console.log(`[ContentStore] Full content metadata:`, JSON.stringify(content));
      
      // DEBUG: Log existing content IDs before adding new content
      console.log(`[ContentStore] Existing content IDs before adding:`, Array.from(contents.keys()));
      
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
          
          // Add decrypted content to store
          addContent(content, parsedData);
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
        const { chunk: serializedChunk } = data;
        const passphrase = getPassphrase();
        
        console.log(`[ContentStore] Received chunk data:`, serializedChunk);
        
        // Check if content metadata exists before processing chunk
        const contentExists = contents.has(serializedChunk.contentId as string);
        console.log(`[ContentStore] Content metadata exists for ${serializedChunk.contentId}: ${contentExists}`);
        
        // DEBUG: Log all content IDs to help diagnose metadata issues
        console.log(`[ContentStore] All content IDs in store:`, Array.from(contents.keys()));
        
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
          
          // Use setTimeout to ensure state updates have been processed
          setTimeout(async () => {
            try {
              await decryptAndReassembleContent(chunk.contentId, passphrase);
              console.log(`[ContentStore] Reassembly completed successfully for ${chunk.contentId}`);
              
              // Double-check that the content is marked as complete
              setContents(prev => {
                const newContents = new Map(prev);
                const content = newContents.get(chunk.contentId);
                
                if (content && !content.isComplete) {
                  console.log(`[ContentStore] Forcing content ${chunk.contentId} to be marked as complete`);
                  newContents.set(chunk.contentId, {
                    ...content,
                    isComplete: true,
                    lastAccessed: new Date()
                  });
                }
                
                return newContents;
              });
            } catch (error) {
              console.error(`[ContentStore] Error during reassembly for ${chunk.contentId}:`, error);
            }
          }, 100); // Small delay to ensure state updates have been processed
        }
      } catch (error) {
        console.error('Error handling chunk:', error);
      }
    };

    // Add event listeners
    socket.on('content', handleContent);
    socket.on('chunk', handleChunk);

    // Clean up on unmount
    return () => {
      socket.off('content', handleContent);
      socket.off('chunk', handleChunk);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  /**
   * Adds content to the store
   * @param content Content metadata
   * @param data Optional content data
   */
  const addContent = (content: SharedContent, data?: Blob | string) => {
    console.log('[ContentStore] Adding content:', content.contentId, 'Type:', content.contentType);
    console.log('[ContentStore] Current content count before adding:', contents.size);
    console.log('[ContentStore] Current content IDs before adding:', Array.from(contents.keys()));
    
    setContents(prevContents => {
      const newContents = new Map(prevContents);
      
      // Check if content already exists
      if (newContents.has(content.contentId)) {
        console.log('[ContentStore] Content already exists in store:', content.contentId);
      }
      
      newContents.set(content.contentId, {
        metadata: content,
        data,
        lastAccessed: new Date(),
        isComplete: !content.isChunked || (data !== undefined)
      });
      
      console.log('[ContentStore] Content added to store:', content.contentId);
      console.log('[ContentStore] New content count:', newContents.size);
      console.log('[ContentStore] All content IDs after adding:', Array.from(newContents.keys()));
      return newContents;
    });

    // Create chunk store if chunked content
    if (content.isChunked && !data) {
      console.log('[ContentStore] Creating chunk store for chunked content:', content.contentId);
      setChunkStores(prevChunkStores => {
        const newChunkStores = new Map(prevChunkStores);
        
        newChunkStores.set(content.contentId, {
          chunks: new Map(),
          totalChunks: content.totalChunks || 0, // Default to 0 if undefined
          receivedChunks: 0
        });
        
        return newChunkStores;
      });
    }
  };

  /**
   * Adds a chunk to the store
   * @param chunk Content chunk
   * @returns Promise that resolves to true if all chunks are received
   */
  const addChunk = async (chunk: ContentChunk): Promise<boolean> => {
    console.log(`[addChunk] Processing chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId}`);
    
    // Check if content metadata exists for this chunk
    const contentExists = contents.has(chunk.contentId);
    console.log(`[addChunk] Content metadata exists for ${chunk.contentId}: ${contentExists}`);
    
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
      const contentEntry = contents.get(chunk.contentId);
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
            await decryptAndReassembleContent(chunk.contentId, passphrase);
          } catch(error) {
            console.error(`[addChunk] Error during immediate reassembly: ${error}`);
            
            // If reassembly fails, try again after a short delay
            // This helps when content metadata arrives slightly after chunks
            setTimeout(async () => {
              try {
                console.log(`[addChunk] Retrying reassembly for content ${chunk.contentId} after delay`);
                await decryptAndReassembleContent(chunk.contentId, passphrase);
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
  };

  /**
   * Decrypts and reassembles chunked content
   * @param contentId Content ID
   * @param passphrase Encryption passphrase
   */
  const decryptAndReassembleContent = async (contentId: string, passphrase: string): Promise<void> => {
    console.log(`[decryptAndReassemble] Starting reassembly for content ${contentId}`);
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
      const content = contents.get(contentId);
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
        
        effectiveContent = {
          metadata: {
            contentId: contentId,
            senderId: socketId || 'unknown',
            senderName: clientName || 'Unknown Sender',
            contentType: ContentType.IMAGE, // Assume image as default
            timestamp: Date.now(),
            metadata: {
              mimeType: 'image/png', // Default mime type
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
        
        console.log(`[decryptAndReassemble] Created fallback content with sender: ${effectiveContent.metadata.senderName} (${effectiveContent.metadata.senderId})`);
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
      
      // Decrypt and concatenate chunks
      const decryptedChunks: ArrayBuffer[] = [];
      
      for (const chunk of orderedChunks) {
        try {
          console.log(`[decryptAndReassemble] Decrypting chunk ${chunk.chunkIndex}`);
          // Decrypt chunk
          const decryptedChunk = await decryptData(key, chunk.encryptedData, chunk.iv);
          decryptedChunks.push(decryptedChunk);
          console.log(`[decryptAndReassemble] Chunk ${chunk.chunkIndex} decrypted successfully, size: ${decryptedChunk.byteLength} bytes`);
        } catch (error) {
          console.error(`[decryptAndReassemble] Error decrypting chunk ${chunk.chunkIndex}:`, error);
          throw error;
        }
      }
      
      // Use a more direct approach for all images regardless of size
      console.log(`[decryptAndReassemble] Total chunks to reassemble: ${decryptedChunks.length}`);
      
      // For images, use a more memory-efficient approach with Blobs
      if (effectiveContent.metadata.contentType === ContentType.IMAGE) {
        console.log(`[decryptAndReassemble] Using direct Blob approach for image data`);
        
        try {
          // Create chunks of Blobs directly from decrypted chunks
          const chunkBlobs = decryptedChunks.map(chunk => new Blob([chunk]));
          console.log(`[decryptAndReassemble] Created ${chunkBlobs.length} chunk blobs`);
          
          // Create a single Blob from all chunk Blobs
          const mimeType = effectiveContent.metadata.metadata.mimeType || 'image/png';
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
          
          // CRITICAL FIX: Use the functional state update pattern to ensure we're working with the latest state
          setContents(prevContents => {
            // Create a new map from the previous contents to maintain all existing content
            const newContents = new Map(prevContents);
            const latestContent = prevContents.get(contentId) || effectiveContent;
            
            console.log(`[decryptAndReassemble] Current content count before blob update: ${prevContents.size}`);
            console.log(`[decryptAndReassemble] Current content IDs before blob update:`, Array.from(prevContents.keys()));
            
            // Create a properly typed ContentEntry
            const updatedContent: ContentEntry = {
              metadata: {
                ...latestContent.metadata,
                // Ensure metadata has the correct size
                metadata: {
                  ...latestContent.metadata.metadata,
                  size: reassembledBlob.size,
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
            
            // Update just this specific content entry while preserving all others
            newContents.set(contentId, updatedContent);
            
            // Log the content IDs in the new map before returning
            console.log(`[decryptAndReassemble] New content count: ${newContents.size}`);
            console.log(`[decryptAndReassemble] Content IDs in new map:`, Array.from(newContents.keys()));
            
            // Content has been updated with the reassembled blob
            
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
      setContents(prevContents => {
        const newContents = new Map(prevContents);
        console.log(`[decryptAndReassemble] Updating content with reassembled data`);
        console.log(`[decryptAndReassemble] Current content count before non-image update: ${prevContents.size}`);
        console.log(`[decryptAndReassemble] Current content IDs before non-image update:`, Array.from(prevContents.keys()));
        
        // Get the latest content entry in case it was updated
        const latestContent = prevContents.get(contentId) || effectiveContent;
        
        // Create a properly typed ContentEntry
        const updatedEntry: ContentEntry = {
          metadata: latestContent.metadata,
          data: finalData,
          isComplete: true,
          lastAccessed: new Date()
        };
        
        // Update just this specific content entry while preserving all others
        newContents.set(contentId, updatedEntry);
        
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
  const getContent = (contentId: string): ContentEntry | undefined => {
    const content = contents.get(contentId);
    
    // Don't update last accessed time during render as it causes infinite loops
    // Instead, we'll update it only when content is actually accessed for operations
    // like copying, downloading, etc.
    
    return content;
  };

  /**
   * Gets a list of all content
   * @returns Array of content metadata
   */
  const getContentList = (): SharedContent[] => {
    return Array.from(contents.values()).map(entry => entry.metadata);
  };

  /**
   * Removes content from the store
   * @param contentId Content ID
   * @returns True if content was removed
   */
  const removeContent = (contentId: string): boolean => {
    const content = contents.get(contentId);
    
    if (!content) {
      return false;
    }
    
    console.log(`[ContentStore] Removing content: ${contentId}`);
    
    // 1. Revoke all URL objects for this content (don't preserve any URLs when explicitly removing content)
    urlRegistry.revokeAllUrls(contentId, false);
    
    // 2. Remove content from contents map
    setContents(prevContents => {
      const newContents = new Map(prevContents);
      newContents.delete(contentId);
      return newContents;
    });
    
    // 3. Remove chunk store from chunkStores map
    setChunkStores(prevChunkStores => {
      const newChunkStores = new Map(prevChunkStores);
      newChunkStores.delete(contentId);
      return newChunkStores;
    });
    
    // 4. Remove from chunkStoresRef.current
    if (chunkStoresRef.current.has(contentId)) {
      console.log(`[ContentStore] Removing content from chunkStoresRef: ${contentId}`);
      chunkStoresRef.current.delete(contentId);
    }
    
    // 5. Clean up any remaining chunks in tracking service
    chunkTrackingService.cleanupChunks(contentId);
    
    return true;
  };

  /**
   * Clears all content from the store
   */
  const clearContents = () => {
    // Get all content IDs
    const contentIds = Array.from(contents.keys());
    
    // Revoke all URLs for all contents (don't preserve any URLs when clearing all contents)
    contentIds.forEach(contentId => {
      urlRegistry.revokeAllUrls(contentId, false);
      chunkTrackingService.cleanupChunks(contentId);
    });
    
    // Clear all content and chunk stores
    setContents(new Map());
    setChunkStores(new Map());
    chunkStoresRef.current.clear();
  };

  /**
   * Updates the last accessed time for a content item
   * This should be called explicitly when content is accessed for operations
   * like copying, downloading, etc., not during rendering
   * @param contentId Content ID
   */
  const updateContentLastAccessed = (contentId: string): void => {
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
  };

  /**
   * Gets a chunk store for a content ID
   * @param contentId Content ID
   * @returns Chunk store or undefined if not found
   */
  const getChunkStore = (contentId: string): ChunkStore | undefined => {
    return chunkStoresRef.current.get(contentId);
  };

  // Context value
  const value: ContentStoreContextType = {
    contents,
    addContent,
    addChunk,
    getContent,
    getChunkStore,
    updateContentLastAccessed,
    getContentList,
    removeContent,
    clearContents
  };

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
  }, [contents, chunkTrackingService, urlRegistry]);

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