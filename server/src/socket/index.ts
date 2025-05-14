import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../services/SessionManager';

/**
 * Sets up Socket.IO event handlers
 * @param io Socket.IO server instance
 * @param sessionManager Session manager
 */
export function setupSocketHandlers(io: Server, sessionManager: SessionManager): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Ping handler to verify session validity
    socket.on('ping', (data: { sessionId: string }, callback) => {
      try {
        const { sessionId } = data;
        
        // Check if session exists
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.log(`[Ping] Session ${sessionId} not found for client ${socket.id}`);
          callback({ valid: false, error: 'Session not found' });
          return;
        }
        
        // Check if client is in session
        const client = session.clients.get(socket.id);
        if (!client) {
          console.log(`[Ping] Client ${socket.id} not found in session ${sessionId}`);
          callback({ valid: false, error: 'Client not in session' });
          return;
        }
        
        // Check if token is valid
        const token = socket.data.sessionToken;
        if (!token || !sessionManager.validateSessionToken(socket.id, token)) {
          console.log(`[Ping] Invalid token for client ${socket.id} in session ${sessionId}`);
          callback({ valid: false, error: 'Invalid token' });
          return;
        }
        
        console.log(`[Ping] Session ${sessionId} valid for client ${socket.id}`);
        callback({ valid: true });
      } catch (error) {
        console.error('[Ping] Error:', error);
        callback({ valid: false, error: 'Internal error' });
      }
    });
    
    // Client rejoined notification
    socket.on('client-rejoined', (data: { sessionId: string, clientName: string }) => {
      try {
        const { sessionId, clientName } = data;
        
        console.log(`[Rejoin] Client ${socket.id} (${clientName}) rejoined session ${sessionId}`);
        
        // Get session
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.log(`[Rejoin] Session ${sessionId} not found`);
          return;
        }
        
        // Notify other clients
        socket.to(sessionId).emit('client-rejoined', {
          sessionId,
          clientId: socket.id,
          clientName
        });
      } catch (error) {
        console.error('[Rejoin] Error:', error);
      }
    });
    
    // Join session
    socket.on('join', async (data: { 
      sessionId: string, 
      clientName: string,
      fingerprint: any
    }, callback) => {
      try {
        console.log(`Client ${socket.id} attempting to join session ${data.sessionId}`);
        const sessionExists = sessionManager.getSession(data.sessionId) !== undefined;
        console.log(`Session ${data.sessionId} exists: ${sessionExists}`);

        // Join session
        const result = await sessionManager.joinSession(
          data.sessionId,
          data.fingerprint,
          socket.id,
          data.clientName,
          socket
        );
        
        if (!result.success) {
          callback({
            success: false,
            error: result.error
          });
          return;
        }
        
        // Join Socket.IO room
        socket.join(data.sessionId);
        
        // Store session info in socket data
        socket.data.sessionId = data.sessionId;
        socket.data.sessionToken = result.token;
        
        // Get session
        const session = sessionManager.getSession(data.sessionId);
        
        // Notify other clients
        console.log(`Notifying clients in session ${data.sessionId} about new client ${socket.id} (${data.clientName})`);
        console.log(`Current clients in session: ${Array.from(session!.clients.keys()).join(', ')}`);
        
        socket.to(data.sessionId).emit('client-joined', {
          sessionId: data.sessionId,
          clientId: socket.id,
          clientName: data.clientName
        });
        
        // Return success with token and existing clients
        const clientsList = Array.from(session!.clients.values()).map(client => ({
          id: client.clientId,
          name: client.clientName
        }));
        
        console.log(`Sending initial client list to ${socket.id}:`, clientsList);
        
        // Check for duplicate client IDs in the list
        const clientIds = clientsList.map(client => client.id);
        const hasDuplicates = clientIds.length !== new Set(clientIds).size;
        if (hasDuplicates) {
          console.warn(`WARNING: Duplicate client IDs detected in session ${data.sessionId}:`,
            clientIds.filter((id, index) => clientIds.indexOf(id) !== index));
        }
        
        callback({
          success: true,
          token: result.token,
          clients: clientsList
        });
        
        console.log(`Client ${data.clientName} (${socket.id}) joined session ${data.sessionId}`);
      } catch (error) {
        console.error('Error joining session:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    
    // Leave session
    socket.on('leave', (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        
        // Validate session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to leave session ${sessionId} but is not in it`);
          return;
        }
        
        // Get session
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return;
        }
        
        // Get client
        const client = session.clients.get(socket.id);
        if (!client) {
          return;
        }
        
        console.log(`Client ${client.clientName} (${socket.id}) left session ${sessionId}`);
        
        // Remove client from session
        sessionManager.removeClientFromSession(sessionId, socket.id);
        
        // Leave Socket.IO room
        socket.leave(sessionId);
        
        // Clear session data
        delete socket.data.sessionId;
        delete socket.data.sessionToken;
        
        // Notify other clients
        socket.to(sessionId).emit('client-left', {
          sessionId,
          clientId: socket.id
        });
      } catch (error) {
        console.error('Error leaving session:', error);
      }
    });
    
    // Content sharing
    socket.on('content', (data: { sessionId: string, content: any, data?: string }, callback) => {
      try {
        const { sessionId, content, data: contentData } = data;
        
        // Validate session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to share content in session ${sessionId} but is not in it`);
          if (callback) callback({ success: false, error: 'Invalid session' });
          return;
        }
        
        // Get session
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          if (callback) callback({ success: false, error: 'Session not found' });
          return;
        }
        
        // Broadcast content to other clients
        socket.to(sessionId).emit('content', {
          sessionId,
          content,
          data: contentData
        });
        
        console.log(`Content ${content.contentId} shared in session ${sessionId}`);
        if (callback) callback({ success: true });
      } catch (error) {
        console.error('Error sharing content:', error);
      }
    });
    
    // Chunk sharing
    socket.on('chunk', (data: { sessionId: string, chunk: any }, callback) => {
      try {
        const { sessionId, chunk } = data;
        
        // Log every chunk for debugging
        console.log(`Received chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId} from client ${socket.id}`);
        
        // Validate session
        if (socket.data.sessionId !== sessionId) {
          console.error(`Client ${socket.id} tried to share chunk in session ${sessionId} but is not in it`);
          if (callback) callback({ success: false, error: 'Invalid session' });
          return;
        }
        
        // Get session
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          console.error(`Session ${sessionId} not found for chunk ${chunk.chunkIndex}`);
          if (callback) callback({ success: false, error: 'Session not found' });
          return;
        }
        
        // Broadcast chunk to other clients
        const recipients = Array.from(session.clients.keys()).filter(id => id !== socket.id);
        console.log(`Broadcasting chunk ${chunk.chunkIndex}/${chunk.totalChunks} to ${recipients.length} clients in session ${sessionId}`);
        
        socket.to(sessionId).emit('chunk', {
          sessionId,
          chunk
        });
        
        console.log(`Chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId} shared in session ${sessionId}`);
        if (callback) callback({ success: true });
      } catch (error) {
        console.error('Error sharing chunk:', error);
      }
    });
    
    // Disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Check if client is in a session
      const sessionId = socket.data.sessionId;
      if (sessionId) {
        // Get session
        const session = sessionManager.getSession(sessionId);
        if (session) {
          // Get client
          const client = session.clients.get(socket.id);
          
          // Remove client from session
          sessionManager.removeClientFromSession(sessionId, socket.id);
          
          // Notify other clients
          socket.to(sessionId).emit('client-left', {
            sessionId,
            clientId: socket.id
          });
          
          console.log(`Client ${client?.clientName || socket.id} removed from session ${sessionId} due to disconnect`);
        }
      }
    });
    
    // Middleware to validate session token for content-related events
    socket.use((packet, next) => {
      const [event] = packet;
      
      if (['content', 'chunk'].includes(event)) {
        const sessionId = socket.data.sessionId;
        const token = socket.data.sessionToken;
        
        if (!sessionId || !token || !sessionManager.validateSessionToken(socket.id, token)) {
          return next(new Error('Invalid session'));
        }
      }
      
      next();
    });
  });
}