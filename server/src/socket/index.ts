import { Server, Socket } from 'socket.io';
import { SessionManager } from '../services/SessionManager';
import { PassphraseFingerprint } from '../services/SessionManager';
import { FileSystemChunkStorage } from '../infrastructure/storage/FileSystemChunkStorage';
import { storageConfig } from '../infrastructure/config/storage.config';
import { ContentMetadata } from '../domain/ChunkStorage.interface';


// Define interfaces for content and chunk data
interface ContentData {
  contentId: string;
  senderId: string;
  senderName: string;
  contentType: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  isChunked: boolean;
  totalChunks?: number;
  totalSize: number;
  encryptionMetadata?: {
    iv: number[];
  };
  [key: string]: unknown;
}

interface ChunkData {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  encryptedData: number[];
  iv: number[];
  [key: string]: unknown;
}

// Define callback types
interface SocketCallback {
  (response: Record<string, unknown>): void;
}

// Create a singleton chunk storage instance
let globalChunkStorage: FileSystemChunkStorage | null = null;

// Function to get or create the chunk storage
async function getChunkStorage(): Promise<FileSystemChunkStorage> {
  if (!globalChunkStorage) {
    globalChunkStorage = new FileSystemChunkStorage({
      storagePath: storageConfig.storagePath
    });
    
    try {
      await globalChunkStorage.initialize();
      
      // Fix existing large file metadata
      try {
        await globalChunkStorage.fixLargeFileMetadata();
      } catch (error) {
        console.error('Error fixing large file metadata:', error);
      }
    } catch (error) {
      console.error('Failed to initialize chunk storage:', error);
      throw error;
    }
  }
  
  return globalChunkStorage;
}

export function setupSocketHandlers(io: Server, sessionManager: SessionManager, chunkStorage?: FileSystemChunkStorage): { cleanup: () => Promise<void> } {
  // Use provided chunk storage or create one
  const chunkStoragePromise = chunkStorage ? Promise.resolve(chunkStorage) : getChunkStorage();
  
  // Cleanup function to close storage
  const cleanup = async (): Promise<void> => {
    try {
      if (chunkStorage) {
        await chunkStorage.close();
      } else if (globalChunkStorage) {
        await globalChunkStorage.close();
        globalChunkStorage = null;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  };

  io.on('connection', (socket: Socket) => {
    
    // Handle join session
    socket.on('join', async (data: { 
      sessionId: string; 
      clientName: string; 
      fingerprint: PassphraseFingerprint;
      cachedContentIds?: string[];
    }, callback?: SocketCallback) => {
      try {
        const { sessionId, clientName, fingerprint, cachedContentIds } = data;
        
        console.log(`Client joined session: ${sessionId}`);
        
        // Join the session
        const result = await sessionManager.joinSession(sessionId, fingerprint, socket.id, clientName, socket);
        
        if (!result.success) {
          console.error(`Failed to join session: ${result.error}`);
          if (callback) {
            callback({ success: false, error: result.error });
          }
          return;
        }

        // Store session info in socket data
        socket.data.sessionId = sessionId;
        socket.data.sessionToken = result.token;
        
        // Join the socket.io room
        socket.join(sessionId);
        
        // Get list of clients in the session
        const session = sessionManager.getSession(sessionId);
        const clientsList = session ? Array.from(session.clients.values()).map(client => ({
          id: client.clientId,
          name: client.clientName,
          joinedAt: client.connectedAt
        })) : [];

        if (callback) {
          callback({
            success: true,
            token: result.token,
            clients: clientsList
          });
        }

        // Get existing content for this session (first page only for initial load)
        try {
          const chunkStorage = await chunkStoragePromise;
          
          // Get total count first
          const allContentList = await chunkStorage.listContent(sessionId);
          const totalContentCount = allContentList.length;

          // Apply pagination - only send first page (default limit: 5)
          const limit = 5;
          let contentList = allContentList.slice(0, limit);
          const hasMore = totalContentCount > limit;

          // Filter out content that the client already has cached
          if (cachedContentIds && cachedContentIds.length > 0) {
            contentList = contentList.filter(content => !cachedContentIds.includes(content.contentId));
          }

          // Send content metadata first, then chunks with proper async handling
          for (const content of contentList) {
            if (!content.isComplete) {
              continue;
            }

            // Send content metadata
            socket.emit('content', {
              sessionId: sessionId,
              content: {
                contentId: content.contentId,
                senderId: 'server',
                senderName: 'Server',
                contentType: content.contentType,
                timestamp: content.createdAt,
                metadata: content.additionalMetadata ? JSON.parse(content.additionalMetadata) : {},
                isChunked: content.totalChunks > 1,
                totalChunks: content.totalChunks,
                totalSize: content.totalSize,
                isPinned: content.isPinned || false,
                isLargeFile: content.isLargeFile,
                encryptionMetadata: {
                  iv: Array.from(content.encryptionIv)
                }
              }
            });

            // Only send chunks for non-large files
            if (!content.isLargeFile) {
              // Send chunks at full speed - client can handle rapid processing
              for (let i = 0; i < content.totalChunks; i++) {
                const chunkData = await chunkStorage.getChunk(content.contentId, i);
                const chunkMetadata = await chunkStorage.getChunkMetadata(content.contentId, i);
                
                if (chunkData && chunkMetadata) {
                  socket.emit('chunk', {
                    sessionId: sessionId,
                    chunk: {
                      contentId: content.contentId,
                      chunkIndex: i,
                      totalChunks: content.totalChunks,
                      encryptedData: Array.from(chunkData),
                      iv: Array.from(chunkMetadata.iv)
                    }
                  });
                }
              }
            }
          }

          // Send pagination info to client
          socket.emit('content-pagination-info', {
            sessionId: sessionId,
            totalCount: totalContentCount,
            currentPage: 1,
            pageSize: limit,
            hasMore: hasMore
          });

        } catch (storageError) {
          console.error(`Error retrieving content from storage for session ${sessionId}:`, storageError);
        }

        // CRITICAL FIX: Broadcast to existing clients that a new user has joined
        socket.to(sessionId).emit('client-joined', {
          clientId: socket.id,
          clientName: clientName,
          sessionId: sessionId
        });

      } catch (error) {
        console.error('Error in join handler:', error);
        if (callback) {
          callback({ success: false, error: 'Internal server error' });
        }
      }
    });

    // Handle leave session
    socket.on('leave', async (data: { sessionId: string, cleanupContent?: boolean }) => {
      try {
        const { sessionId, cleanupContent } = data;
        
        // Verify client is in the session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to leave session ${sessionId} but is not in it`);
          return;
        }

        // Get session and client info before removal
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.error(`Session ${sessionId} not found`);
          return;
        }

        const client = session.clients.get(socket.id);
        if (!client) {
          console.error(`Client ${socket.id} not found in session ${sessionId}`);
          return;
        }

        console.log(`Client ${client.clientName} (${socket.id}) left session ${sessionId}`);

        // Clean up content if requested
        if (cleanupContent) {
          try {
            const chunkStorage = await chunkStoragePromise;
            await chunkStorage.cleanupAllSessionContent(sessionId);
          } catch (cleanupError) {
            console.error(`Error cleaning up content for session ${sessionId}:`, cleanupError);
          }
        }

        // Remove client from session
        sessionManager.removeClientFromSession(sessionId, socket.id);

        // Leave the socket.io room
        socket.leave(sessionId);

        // Clear session data
        delete socket.data.sessionId;
        delete socket.data.sessionToken;

        // Notify other clients
        socket.to(sessionId).emit('client-left', {
          clientName: client.clientName,
          clientId: socket.id
        });

      } catch (error) {
        console.error('Error in leave handler:', error);
      }
    });

    // Handle content sharing
    socket.on('content', async (data: { sessionId: string, content: ContentData, data?: string }, callback?: SocketCallback) => {
      try {
        const { sessionId, content, data: contentData } = data;
        let chunkStorage: FileSystemChunkStorage;

        try {
          chunkStorage = await chunkStoragePromise;
        } catch (storageError) {
          console.error('Failed to get chunk storage:', storageError);
          if (callback) {
            callback({ success: false, error: 'Storage not available' });
          }
          return;
        }

        console.log(`Content shared: ${content.contentId} in session ${sessionId}`);

        // Verify client is in the session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to share content in session ${sessionId} but is not in it (socket.data.sessionId: ${socket.data.sessionId})`);
          if (callback) {
            callback({ success: false, error: 'Not in session' });
          }
          return;
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.error(`Session ${sessionId} not found`);
          if (callback) {
            callback({ success: false, error: 'Session not found' });
          }
          return;
        }

        // Validate session token
        const token = socket.data.sessionToken;
        if (!token || !sessionManager.validateSessionToken(socket.id, token)) {
          console.error(`[CONTENT] Invalid token for client ${socket.id} in session ${sessionId}`);
          if (callback) {
            callback({ success: false, error: 'Invalid session token' });
          }
          return;
        }

        // Update content with sender info
        content.senderId = socket.id;
        const client = session.clients.get(socket.id);
        content.senderName = client?.clientName || 'Unknown';
        content.timestamp = Date.now();

        // Save content to storage
        try {
          if (!content.isChunked && contentData) {
            console.log(`[STORAGE-DEBUG] Saving content ${content.contentId} to storage for session ${sessionId}`);
            
            // For non-chunked content, save it as a single chunk
            const encryptedData = Buffer.from(contentData, 'base64');
            const iv = content.encryptionMetadata?.iv ? new Uint8Array(content.encryptionMetadata.iv) : new Uint8Array(12);
            
            await chunkStorage.saveChunk(
              new Uint8Array(encryptedData),
              {
                contentId: content.contentId,
                sessionId: sessionId,
                chunkIndex: 0,
                totalChunks: 1,
                size: content.totalSize || encryptedData.length,
                iv: iv,
                contentType: content.contentType || 'text',
                mimeType: (content.metadata?.mimeType as string) || 'text/plain'
              }
            );

            // Mark content as complete since it's a single chunk
            await chunkStorage.markContentComplete(content.contentId);
            
            // Update the metadata with the full content metadata
            if (content.metadata && typeof chunkStorage.updateContentMetadata === 'function') {
              await chunkStorage.updateContentMetadata(content.contentId, content.metadata);
            }
            
            console.log(`[STORAGE-DEBUG] Content ${content.contentId} saved successfully to storage`);
            
            // Verify the content was saved by checking storage
            const savedContent = await chunkStorage.listContent(sessionId, 50);
            console.log(`[STORAGE-DEBUG] After saving, found ${savedContent.length} items in session ${sessionId}`);
          } else if (!content.isChunked && !contentData) {
            // For metadata-only content (no actual data), save metadata to storage
            console.log(`[STORAGE-DEBUG] Saving metadata-only content ${content.contentId} to storage for session ${sessionId}`);
            
            const iv = content.encryptionMetadata?.iv ? new Uint8Array(content.encryptionMetadata.iv) : new Uint8Array(12);
            const isLargeFile = content.totalSize > storageConfig.largeFileThreshold;
            
            await chunkStorage.saveContent({
              contentId: content.contentId,
              sessionId: sessionId,
              contentType: content.contentType || 'application/octet-stream',
              totalChunks: content.totalChunks || 1,
              totalSize: content.totalSize || 0,
              createdAt: Date.now(),
              encryptionIv: iv,
              additionalMetadata: content.metadata ? JSON.stringify(content.metadata) : null,
              isComplete: true,
              isPinned: false,
              isLargeFile: isLargeFile
            });
            
            console.log(`[STORAGE-DEBUG] Metadata-only content ${content.contentId} saved successfully to storage`);
          } else if (content.isChunked && content.totalChunks) {
            // For chunked content (including large files), save metadata directly
            console.log(`[STORAGE-DEBUG] Saving metadata for chunked content ${content.contentId} (${content.totalSize} bytes)`);
            console.log(`[METADATA-DEBUG] Original content.metadata:`, content.metadata);
            
            const iv = content.encryptionMetadata?.iv ? new Uint8Array(content.encryptionMetadata.iv) : new Uint8Array(12);
            const isLargeFile = content.totalSize > storageConfig.largeFileThreshold;
            
            // CRITICAL FIX: Ensure metadata is preserved for large files
            let metadataToStore = content.metadata;
            
            // Log what we received from client
            console.log(`[METADATA-FIX-DEBUG] Received metadata from client:`, content.metadata);
            console.log(`[METADATA-FIX-DEBUG] Content object keys:`, Object.keys(content));
            
            if (!metadataToStore && isLargeFile) {
              // For large files without metadata, create basic metadata with size info
              metadataToStore = {
                size: content.totalSize,
                mimeType: content.contentType || 'application/octet-stream',
                fileName: 'File' // Default filename
              };
              console.log(`[METADATA-DEBUG] Created fallback metadata for large file:`, metadataToStore);
            } else if (metadataToStore && isLargeFile) {
              // We have metadata from client - ensure it has required fields
              if (!metadataToStore.fileName) {
                metadataToStore.fileName = 'File'; // Default if missing
              }
              console.log(`[METADATA-DEBUG] Using client metadata for large file:`, metadataToStore);
            }
            
            await chunkStorage.saveContent({
              contentId: content.contentId,
              sessionId: sessionId,
              contentType: content.contentType || 'application/octet-stream',
              totalChunks: content.totalChunks,
              totalSize: content.totalSize || 0,
              createdAt: Date.now(),
              encryptionIv: iv,
              additionalMetadata: metadataToStore ? JSON.stringify(metadataToStore) : null,
              isComplete: true,
              isPinned: false,
              isLargeFile: isLargeFile
            });
            
            // CRITICAL FIX: For chunked content, also update metadata using updateContentMetadata
            // This ensures the metadata is properly stored even if the content record was created by saveChunk first
            if (metadataToStore && typeof chunkStorage.updateContentMetadata === 'function') {
              console.log(`[METADATA-UPDATE-DEBUG] Updating metadata for chunked content ${content.contentId}`);
              await chunkStorage.updateContentMetadata(content.contentId, metadataToStore);
              console.log(`[METADATA-UPDATE-DEBUG] Metadata updated successfully for ${content.contentId}`);
            }
            
            console.log(`[STORAGE-DEBUG] Chunked content metadata ${content.contentId} saved successfully to storage`);
          }
        } catch (storageError) {
          console.error(`[STORAGE-DEBUG] Error saving content to storage:`, storageError);
        }

        // Check if this is a large file that should not be broadcasted
        const isLargeFile = content.totalSize > storageConfig.largeFileThreshold;
        
        if (isLargeFile) {
          // For large files, only send metadata to other clients (no chunks will be sent)
          socket.to(sessionId).emit('content', {
            sessionId,
            content: {
              ...content,
              isLargeFile: true
            }
          });
        } else {
          // Broadcast normally for regular files - include content data for real-time sharing
          socket.to(sessionId).emit('content', {
            sessionId,
            content,
            data: contentData  // Include encrypted content data for regular files
          });
        }

        if (callback) {
          callback({ success: true });
        }
      } catch (error) {
        console.error('Error in content handler:', error);
        if (callback) {
          callback({ success: false, error: 'Internal server error' });
        }
      }
    });

    // Handle chunk sharing
    socket.on('chunk', async (data: { sessionId: string, chunk: ChunkData }, callback?: SocketCallback) => {
      try {
        const { sessionId, chunk } = data;
        let chunkStorage: FileSystemChunkStorage;

        try {
          chunkStorage = await chunkStoragePromise;
        } catch (storageError) {
          console.error('Failed to get chunk storage:', storageError);
          if (callback) {
            callback({ success: false, error: 'Storage not available' });
          }
          return;
        }

        

        // Verify client is in the session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to share chunk in session ${sessionId} but is not in it`);
          if (callback) {
            callback({ success: false, error: 'Not in session' });
          }
          return;
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.error(`Session ${sessionId} not found`);
          if (callback) {
            callback({ success: false, error: 'Session not found' });
          }
          return;
        }

        // Save chunk to storage first
        try {
          await chunkStorage.saveChunk(
            new Uint8Array(chunk.encryptedData),
            {
              contentId: chunk.contentId,
              sessionId: sessionId,
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunks,
              size: chunk.encryptedData.length,
              iv: new Uint8Array(chunk.iv),
              contentType: 'unknown' // Will be updated when content metadata is received
            }
          );

          // Check if all chunks have been received
          const receivedChunks = await chunkStorage.getReceivedChunkCount(chunk.contentId);
          
          // Mark content as complete if all chunks have been received
          if (receivedChunks === chunk.totalChunks) {
            await chunkStorage.markContentComplete(chunk.contentId);
            console.log(`File upload completed: ${chunk.contentId} (${chunk.totalChunks} chunks)`);
          }
        } catch (storageError) {
          console.error(`Error saving chunk to storage:`, storageError);
        }

        // Check if this is a large file - if so, don't broadcast chunks
        try {
          const isLargeFile = await chunkStorage.isLargeFile(chunk.contentId);
          
          if (!isLargeFile) {
            // Forward chunk to other clients for regular files
            // Broadcast to other clients in the session
            socket.to(sessionId).emit('chunk', {
              sessionId,
              chunk
            });
          }
        } catch (error) {
          console.error(`Error checking if content is large file:`, error);
          // Default to broadcasting if we can't determine file size
          socket.to(sessionId).emit('chunk', {
            sessionId,
            chunk
          });
        }

        if (callback) {
          callback({ success: true });
        }

      } catch (error) {
        console.error('Error in chunk handler:', error);
        if (callback) {
          callback({ success: false, error: 'Internal server error' });
        }
      }
    });

    // Handle content removal
    socket.on('remove-content', async (data: { sessionId: string, contentId: string }, callback?: SocketCallback) => {
      try {
        const { sessionId, contentId } = data;
        
        console.log(`Client ${socket.id} requesting to remove content ${contentId} from session ${sessionId}`);

        // Verify client is in the session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to remove content from session ${sessionId} but is not in it`);
          if (callback) {
            callback({ success: false, error: 'Not in session' });
          }
          return;
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.error(`Session ${sessionId} not found`);
          if (callback) {
            callback({ success: false, error: 'Session not found' });
          }
          return;
        }

        try {
          const chunkStorage = await chunkStoragePromise;
          const result = await chunkStorage.removeContent(contentId);
          
          if (result.success) {
            // Notify all clients in the session
            socket.to(sessionId).emit('content-removed', {
              sessionId,
              contentId,
              removedBy: socket.id
            });

            if (callback) {
              callback({ success: true });
            }

            console.log(`Content ${contentId} removed from session ${sessionId}`);
          } else {
            if (callback) {
              callback({ success: false, error: result.error || 'Failed to remove content' });
            }
          }
        } catch (storageError) {
          console.error(`Error removing content ${contentId}:`, storageError);
          if (callback) {
            callback({ success: false, error: 'Storage error' });
          }
        }
      } catch (error) {
        console.error('Error in remove-content handler:', error);
        if (callback) {
          callback({ success: false, error: 'Internal server error' });
        }
      }
    });

    // Handle ping for session validation
    socket.on('ping', async (data: { sessionId: string }, callback?: (response: { valid: boolean, error?: string }) => void) => {
      try {
        const { sessionId } = data;
        
        // Verify client is in the session
        if (socket.data.sessionId !== sessionId) {
          console.log(`[Ping] Client ${socket.id} pinged session ${sessionId} but is not in it`);
          if (callback) {
            callback({ valid: false, error: 'Not in session' });
          }
          return;
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.log(`[Ping] Session ${sessionId} not found`);
          if (callback) {
            callback({ valid: false, error: 'Session not found' });
          }
          return;
        }

        // Validate session token
        const token = socket.data.sessionToken;
        if (!token || !sessionManager.validateSessionToken(socket.id, token)) {
          console.log(`[Ping] Invalid token for client ${socket.id} in session ${sessionId}`);
          if (callback) {
            callback({ valid: false, error: 'Invalid session token' });
          }
          return;
        }

        console.log(`[Ping] Session ${sessionId} valid for client ${socket.id}`);
        if (callback) {
          callback({ valid: true });
        }
      } catch (error) {
        console.error('Error in ping handler:', error);
        if (callback) {
          callback({ valid: false, error: 'Internal server error' });
        }
      }
    });

    // Handle content pagination
    socket.on('list-content', async (data: {
      sessionId: string;
      offset?: number;
      limit?: number;
    }, callback?: (response: {
      success: boolean;
      content?: ContentMetadata[];
      totalCount?: number;
      hasMore?: boolean;
      error?: string;
    }) => void) => {
      try {
        const { sessionId, offset: rawOffset = 0, limit: rawLimit = 5 } = data;
        
        // Sanitize pagination parameters
        const offset = Math.max(0, rawOffset); // Ensure offset is never negative
        const limit = Math.max(1, rawLimit); // Ensure limit is at least 1
        
        // Validate session membership
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          if (callback) {
            callback({ success: false, error: 'Session not found' });
          }
          return;
        }

        const client = session.clients.get(socket.id);
        if (!client) {
          if (callback) {
            callback({ success: false, error: 'Not a member of this session' });
          }
          return;
        }

        // Get content with pagination
        const chunkStorage = await chunkStoragePromise;
        
        // Get total count first
        const allContent = await chunkStorage.listContent(sessionId);
        const totalCount = allContent.length;
        
        // Apply pagination
        const paginatedContent = allContent.slice(offset, offset + limit);
        const hasMore = offset + limit < totalCount;

        console.log(`[PAGINATION] Session ${sessionId}: offset=${offset}, limit=${limit}, total=${totalCount}, returned=${paginatedContent.length}, hasMore=${hasMore}`);

        // Send the actual content items with chunks (like during session join)
        for (const content of paginatedContent) {
          if (!content.isComplete) {
            console.log(`Skipping incomplete content ${content.contentId}`);
            continue;
          }

          // Send content metadata
          socket.emit('content', {
            sessionId: sessionId,
            content: {
              contentId: content.contentId,
              senderId: 'server',
              senderName: 'Server',
              contentType: content.contentType,
              timestamp: content.createdAt,
              metadata: content.additionalMetadata ? JSON.parse(content.additionalMetadata) : {},
              isChunked: content.totalChunks > 1,
              totalChunks: content.totalChunks,
              totalSize: content.totalSize,
              isPinned: (() => {
                console.log(`[DEBUG-EMIT-2] Content ${content.contentId} isPinned value:`, content.isPinned, typeof content.isPinned);
                console.log(`[DEBUG-EMIT-2] Full content object:`, JSON.stringify(content, null, 2));
                return content.isPinned || false;
              })(),
              encryptionMetadata: {
                iv: Array.from(content.encryptionIv)
              }
            }
          });

          // Send chunks
          for (let i = 0; i < content.totalChunks; i++) {
            const chunkData = await chunkStorage.getChunk(content.contentId, i);
            const chunkMetadata = await chunkStorage.getChunkMetadata(content.contentId, i);
            
            if (chunkData && chunkMetadata) {
              socket.emit('chunk', {
                sessionId: sessionId,
                chunk: {
                  contentId: content.contentId,
                  chunkIndex: i,
                  totalChunks: content.totalChunks,
                  encryptedData: Array.from(chunkData),
                  iv: Array.from(chunkMetadata.iv)
                }
              });
            }
          }
        }

        if (callback) {
          callback({
            success: true,
            content: paginatedContent,
            totalCount,
            hasMore
          });
        }
      } catch (error) {
        console.error('Error in list-content handler:', error);
        if (callback) {
          callback({ success: false, error: 'Internal server error' });
        }
      }
    });

    // Handle content pinning
    socket.on('pin-content', async (data: { sessionId: string, contentId: string }, callback?: SocketCallback) => {
      console.log(`[PIN-DEBUG] Received pin-content event:`, { data, hasCallback: !!callback });
      try {
        console.log(`[Socket] Pin content request: ${data.contentId} in session ${data.sessionId}`);
        
        // Validate session
        const session = sessionManager.getSession(data.sessionId);
        if (!session) {
          console.error(`[Socket] Session not found: ${data.sessionId}`);
          if (callback) callback({ success: false, error: 'Session not found' });
          return;
        }

        console.log(`[PIN-DEBUG] Session found, proceeding with pin operation`);

        // Pin the content
        const chunkStorage = await chunkStoragePromise;
        console.log(`[PIN-DEBUG] About to call chunkStorage.pinContent(${data.contentId})`);
        await chunkStorage.pinContent(data.contentId);
        console.log(`[PIN-DEBUG] chunkStorage.pinContent completed successfully`);
        
        // Notify all clients in the session
        console.log(`[PIN-DEBUG] Emitting content-pinned event to session ${data.sessionId}`);
        io.to(data.sessionId).emit('content-pinned', { contentId: data.contentId });
        
        console.log(`[Socket] Content pinned successfully: ${data.contentId}`);
        console.log(`[PIN-DEBUG] Calling success callback`);
        if (callback) callback({ success: true });
        
      } catch (error) {
        console.error(`[Socket] Error pinning content ${data.contentId}:`, error);
        console.error(`[PIN-DEBUG] Full error details:`, error);
        
        // Notify the requesting client of the error
        socket.emit('pin-error', {
          contentId: data.contentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        if (callback) callback({ success: false, error: 'Failed to pin content' });
      }
    });

    // Handle content unpinning
    socket.on('unpin-content', async (data: { sessionId: string, contentId: string }, callback?: SocketCallback) => {
      try {
        console.log(`[Socket] Unpin content request: ${data.contentId} in session ${data.sessionId}`);
        
        // Validate session
        const session = sessionManager.getSession(data.sessionId);
        if (!session) {
          console.error(`[Socket] Session not found: ${data.sessionId}`);
          if (callback) callback({ success: false, error: 'Session not found' });
          return;
        }

        // Unpin the content
        const chunkStorage = await chunkStoragePromise;
        await chunkStorage.unpinContent(data.contentId);
        
        // Notify all clients in the session
        io.to(data.sessionId).emit('content-unpinned', { contentId: data.contentId });
        
        console.log(`[Socket] Content unpinned successfully: ${data.contentId}`);
        if (callback) callback({ success: true });
        
      } catch (error) {
        console.error(`[Socket] Error unpinning content ${data.contentId}:`, error);
        
        // Notify the requesting client of the error
        socket.emit('unpin-error', {
          contentId: data.contentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        if (callback) callback({ success: false, error: 'Failed to unpin content' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Clean up session membership
      const sessionId = socket.data.sessionId;
      if (sessionId) {
        try {
          const session = sessionManager.getSession(sessionId);
          if (session) {
            const client = session.clients.get(socket.id);
            
            await sessionManager.removeClientFromSession(sessionId, socket.id);

            // Notify other clients
            socket.to(sessionId).emit('client-left', {
              clientName: client?.clientName || 'Unknown',
              clientId: socket.id
            });

            console.log(`Client ${client?.clientName || socket.id} removed from session ${sessionId} due to disconnect`);

            // Check if session is empty and clean up if needed
            const updatedSession = sessionManager.getSession(sessionId);
            if (updatedSession && updatedSession.clients.size === 0) {
              console.log(`Session ${sessionId} is now empty`);
              // Could add cleanup logic here if needed
            }
          }
        } catch (error) {
          console.error(`Error cleaning up session for disconnected client ${socket.id}:`, error);
        }
      }
    });

    // Add middleware for authentication on protected events
    socket.use((packet, next) => {
      const [event] = packet;
      
      // Skip authentication for join and disconnect events
      if (['join', 'disconnect'].includes(event)) {
        return next();
      }

      // Check if client has valid session
      const sessionId = socket.data.sessionId;
      const token = socket.data.sessionToken;
      
      if (!sessionId || !token) {
        console.error(`[Middleware] Missing sessionId or token for ${event} event from client ${socket.id}`);
        return next(new Error('Authentication required'));
      }

      if (!sessionManager.validateSessionToken(socket.id, token)) {
        console.error(`[Middleware] Invalid token for ${event} event from client ${socket.id}`);
        return next(new Error('Invalid session token'));
      }

      // Verify session exists
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        console.error(`[Middleware] Session ${sessionId} not found for ${event} event from client ${socket.id}`);
        return next(new Error('Session not found'));
      }

      next();
    });
  });

  return { cleanup };
}