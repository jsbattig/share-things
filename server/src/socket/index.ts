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
    console.log(`[DEBUG] Creating new FileSystemChunkStorage instance`);
    globalChunkStorage = new FileSystemChunkStorage({
      storagePath: storageConfig.storagePath
    });
    
    try {
      console.log(`[DEBUG] Initializing chunk storage with path: ${storageConfig.storagePath}`);
      await globalChunkStorage.initialize();
      console.log('Chunk storage initialized successfully');
    } catch (error) {
      console.error('Failed to initialize chunk storage:', error);
      throw error;
    }
  }
  
  return globalChunkStorage;
}

export function setupSocketHandlers(io: Server, sessionManager: SessionManager): { cleanup: () => Promise<void> } {
  // Initialize chunk storage
  const chunkStoragePromise = getChunkStorage();
  
  // Cleanup function to close storage
  const cleanup = async (): Promise<void> => {
    try {
      if (globalChunkStorage) {
        await globalChunkStorage.close();
        globalChunkStorage = null;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  };

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle join session
    socket.on('join', async (data: { 
      sessionId: string; 
      clientName: string; 
      fingerprint: PassphraseFingerprint;
      cachedContentIds?: string[];
    }, callback?: SocketCallback) => {
      try {
        const { sessionId, clientName, fingerprint, cachedContentIds } = data;
        
        console.log(`Client ${socket.id} attempting to join session ${sessionId}`);
        
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

        // CRITICAL FIX: Send callback BEFORE content transmission to prevent timeout
        if (callback) {
          console.log(`[CALLBACK-DEBUG] Sending join success callback to client ${socket.id}`);
          callback({
            success: true,
            token: result.token,
            clients: clientsList
          });
          console.log(`[CALLBACK-DEBUG] Join callback sent successfully to client ${socket.id}`);
        } else {
          console.log(`[CALLBACK-DEBUG] WARNING: No callback provided for join request from client ${socket.id}`);
        }

        // Get existing content for this session (first page only for initial load)
        try {
          const chunkStorage = await chunkStoragePromise;
          console.log(`[STORAGE] Retrieving first page of content for new client ${socket.id} in session ${sessionId}`);
          
          // Get total count first
          const allContentList = await chunkStorage.listContent(sessionId);
          const totalContentCount = allContentList.length;
          console.log(`[DEBUG] Found ${totalContentCount} total content items for session ${sessionId}`);

          // Apply pagination - only send first page (default limit: 5)
          const limit = 5;
          let contentList = allContentList.slice(0, limit);
          const hasMore = totalContentCount > limit;

          // Filter out content that the client already has cached
          if (cachedContentIds && cachedContentIds.length > 0) {
            const originalContentCount = contentList.length;
            contentList = contentList.filter(content => !cachedContentIds.includes(content.contentId));
            console.log(`[KISS] Filtered content list: ${originalContentCount} total -> ${contentList.length} missing (client has ${originalContentCount - contentList.length} cached)`);
          }

          if (contentList.length > 0) {
            console.log(`[DEBUG] Content IDs to send (first page): ${contentList.map(c => c.contentId).join(', ')}`);
          } else {
            console.log(`[DEBUG] No content found for session ${sessionId}`);
          }

          console.log(`[DEBUG] About to send ${contentList.length} content items (first page) to client ${socket.id}. Total: ${totalContentCount}, hasMore: ${hasMore}`);

          // Send content metadata first, then chunks with proper async handling
          for (const content of contentList) {
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
                encryptionMetadata: {
                  iv: Array.from(content.encryptionIv)
                }
              }
            });

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

          // Send pagination info to client
          socket.emit('content-pagination-info', {
            sessionId: sessionId,
            totalCount: totalContentCount,
            currentPage: 1,
            pageSize: limit,
            hasMore: hasMore
          });

          console.log(`Finished sending first page of content to client ${socket.id}. Total: ${totalContentCount}, sent: ${contentList.length}, hasMore: ${hasMore}`);
        } catch (storageError) {
          console.error(`Error retrieving content from storage for session ${sessionId}:`, storageError);
        }

        // CRITICAL FIX: Broadcast to existing clients that a new user has joined
        socket.to(sessionId).emit('client-joined', {
          clientId: socket.id,
          clientName: clientName,
          sessionId: sessionId
        });

        console.log(`Client ${clientName} (${socket.id}) joined session ${sessionId}`);
        console.log(`[USER-LIST-FIX] Broadcasted client-joined event to existing clients in session ${sessionId}`);
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
            console.log(`Cleaning up content for session ${sessionId} as requested by client ${socket.id}`);
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

        console.log(`[CONTENT] Client ${socket.id} sending content ${content.contentId} in session ${sessionId}`);
        console.log(`[CONTENT-DEBUG] Client ${socket.id} socket.data.sessionId: ${socket.data.sessionId}, requested sessionId: ${sessionId}`);

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

        // Save non-chunked content to storage
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
                size: encryptedData.length,
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
          }
        } catch (storageError) {
          console.error(`[STORAGE-DEBUG] Error saving non-chunked content to storage:`, storageError);
        }

        // Broadcast to other clients in the session
        socket.to(sessionId).emit('content', {
          sessionId,
          content
        });

        if (callback) {
          callback({ success: true });
        }

        console.log(`Content ${content.contentId} shared in session ${sessionId}`);
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

        console.log(`Received chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId} from client ${socket.id}`);

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

        // Forward chunk to other clients
        const recipients = Array.from(session.clients.keys()).filter(id => id !== socket.id);

        // Broadcast to other clients in the session
        socket.to(sessionId).emit('chunk', {
          sessionId,
          chunk
        });

        // Save chunk to storage
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
          console.log(`Content ${chunk.contentId} now has ${receivedChunks}/${chunk.totalChunks} chunks`);
          
          // Mark content as complete if all chunks have been received
          if (receivedChunks === chunk.totalChunks) {
            await chunkStorage.markContentComplete(chunk.contentId);
            console.log(`Content ${chunk.contentId} marked as complete - all ${chunk.totalChunks} chunks received`);
          }

          console.log(`Chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId} saved to storage`);
        } catch (storageError) {
          console.error(`Error saving chunk to storage:`, storageError);
        }

        if (callback) {
          callback({ success: true });
        }

        console.log(`Chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId} forwarded to ${recipients.length} recipients`);
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
        const { sessionId, offset = 0, limit = 5 } = data;
        
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