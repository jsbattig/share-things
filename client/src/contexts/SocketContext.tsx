import React, { createContext, useContext, useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';

// Socket.IO client instance
// Define a Socket type for better type safety
type Socket = ReturnType<typeof socketIOClient>;
let socket: Socket | null = null;

// Socket context interface
// Define response types for better type safety
interface JoinResponse {
  success: boolean;
  token?: string;
  error?: string;
  clients?: Array<{ id: string, name: string }>;
}

interface ContentResponse {
  success: boolean;
  error?: string;
}

// Define content and chunk types
interface ContentMetadata {
  contentId: string;
  [key: string]: unknown;
}

interface ChunkData {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  [key: string]: unknown;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  connect: () => void;
  disconnect: () => void;
  joinSession: (sessionId: string, clientName: string, passphrase: string) => Promise<JoinResponse>;
  leaveSession: (sessionId: string) => void;
  sendContent: (sessionId: string, content: ContentMetadata, data?: string) => void;
  sendChunk: (sessionId: string, chunk: ChunkData) => void;
  rejoinSession: (sessionId: string, clientName: string, passphrase: string) => Promise<void>;
}

// Create context
const SocketContext = createContext<SocketContextType | null>(null);

/**
 * Creates a passphrase fingerprint for authentication
 * @param passphrase Session passphrase
 * @returns Fingerprint object with IV and encrypted data
 */
import { generateFingerprint } from '../utils/encryption';

/**
 * Socket provider component
 */
export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRejoining, setIsRejoining] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  // Initialize socket
  useEffect(() => {
    // Create socket instance if it doesn't exist
    if (!socket) {
      // Dynamically determine the backend URL based on the current window location
      const getBackendUrl = () => {
        // If an environment variable is set to a specific value (not 'auto'), use it
        if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL !== 'auto') {
          console.log(`[Socket] Using configured backend URL: ${import.meta.env.VITE_SOCKET_URL}`);
          return import.meta.env.VITE_SOCKET_URL;
        }
        
        // Otherwise, derive from the current URL
        const currentUrl = new URL(window.location.href);
        
        // Determine the appropriate port based on environment variables or fallback to default
        // Use the VITE_API_PORT environment variable with a default value of '3001'
        const port = import.meta.env.VITE_API_PORT || '3001';
        console.log(`[Socket] Using API port: ${port}`);
        // IMPORTANT: Do NOT use the current URL's port as a fallback
        // The frontend and backend are on different ports (15000 vs 15001)
        
        // Construct the backend URL
        const backendUrl = `${currentUrl.protocol}//${currentUrl.hostname}${port ? ':' + port : ''}`;
        console.log(`[Socket] Automatically determined backend URL: ${backendUrl}`);
        
        return backendUrl;
      };

      console.log(`[Socket] Connecting to backend at: ${getBackendUrl()}`);
      
      socket = socketIOClient(getBackendUrl(), {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10, // Increased from 5 to 10
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });
    }

    // Set up event listeners
    const onConnect = () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
      setConnectionStatus('connected');
    };

    const onDisconnect = (reason: string) => {
      console.log(`[Socket] Disconnected: ${reason}`);
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };

    const onConnectError = (error: Error) => {
      console.error('[Socket] Connection error:', error);
      setConnectionStatus('disconnected');
    };

    const onReconnect = (attemptNumber: number) => {
      console.log(`[Socket] Reconnected after ${attemptNumber} attempts`);
      setConnectionStatus('connected');
      
      // Auto-rejoin session if we have the credentials
      const sessionId = localStorage.getItem('sessionId');
      const clientName = localStorage.getItem('clientName');
      const passphrase = localStorage.getItem('passphrase');
      
      if (sessionId && clientName && passphrase) {
        console.log(`[Socket] Attempting to auto-rejoin session ${sessionId}`);
        rejoinSession(sessionId, clientName, passphrase);
      }
    };

    const onReconnecting = (attemptNumber: number) => {
      console.log(`[Socket] Reconnecting... Attempt ${attemptNumber}`);
      setConnectionStatus('reconnecting');
    };

    // Add event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('reconnect', onReconnect);
    socket.on('reconnecting', onReconnecting);
    socket.on('reconnect_error', (error: Error) => console.error('[Socket] Reconnection error:', error));
    socket.on('reconnect_failed', () => {
      console.error('[Socket] Failed to reconnect after all attempts');
      setConnectionStatus('disconnected');
    });

    // Connect socket
    if (!socket.connected) {
      socket.connect();
    }

    // Handle visibility change events
    const handleVisibilityChange = () => {
      console.log(`[Socket] Visibility changed: ${document.visibilityState}`);
      console.log(`[Socket] Socket connected: ${socket?.connected}`);
      
      if (document.visibilityState === 'visible') {
        // When app becomes visible again, check connection and rejoin if needed
        if (socket && !socket.connected) {
          console.log('[Socket] App visible again, reconnecting...');
          socket.connect();
        } else if (socket && socket.connected) {
          // Even if socket is connected, verify session is still valid
          const sessionId = localStorage.getItem('sessionId');
          const clientName = localStorage.getItem('clientName');
          const passphrase = localStorage.getItem('passphrase');
          
          if (sessionId && clientName && passphrase) {
            console.log(`[Socket] App visible again, verifying session ${sessionId}`);
            // We'll ping the server to verify our session is still valid
            socket.emit('ping', { sessionId }, (response: { valid: boolean }) => {
              if (!response || !response.valid) {
                console.log('[Socket] Session invalid, rejoining...');
                rejoinSession(sessionId, clientName, passphrase);
              } else {
                console.log('[Socket] Session still valid');
              }
            });
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Clean up on unmount
    return () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      socket?.off('connect_error', onConnectError);
      socket?.off('reconnect', onReconnect);
      socket?.off('reconnecting', onReconnecting);
      socket?.off('reconnect_error');
      socket?.off('reconnect_failed');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Rejoins a session with stored credentials
   * @param sessionId Session ID
   * @param clientName Client name
   * @param passphrase Session passphrase
   */
  const rejoinSession = async (sessionId: string, clientName: string, passphrase: string) => {
    if (!socket || !socket.connected || isRejoining) return;
    
    try {
      setIsRejoining(true);
      console.log(`[Socket] Rejoining session ${sessionId} as ${clientName}`);
      
      // Create passphrase fingerprint
      const fingerprint = await generateFingerprint(passphrase);
      
      // Join session
      socket.emit('join', { sessionId, clientName, fingerprint }, (response: JoinResponse) => {
        if (response.success) {
          // Update session token
          localStorage.setItem('sessionToken', response.token);
          console.log('[Socket] Successfully rejoined session');
          
          // Notify application that we've rejoined
          socket.emit('client-rejoined', { sessionId, clientName });
        } else {
          console.error('[Socket] Failed to rejoin session:', response.error);
        }
        setIsRejoining(false);
      });
    } catch (error) {
      console.error('[Socket] Error rejoining session:', error);
      setIsRejoining(false);
    }
  };

  /**
   * Connect to the socket server
   */
  const connect = () => {
    if (socket && !socket.connected) {
      socket.connect();
    }
  };

  /**
   * Disconnect from the socket server
   */
  const disconnect = () => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
  };

  /**
   * Join a session
   * @param sessionId Session ID
   * @param clientName Client name
   * @param passphrase Session passphrase
   * @returns Promise that resolves with session data
   */
  const joinSession = async (sessionId: string, clientName: string, passphrase: string): Promise<JoinResponse> => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      try {
        // Create passphrase fingerprint
        const fingerprint = await generateFingerprint(passphrase);

        // Join session
        socket.emit('join', { sessionId, clientName, fingerprint }, (response: JoinResponse) => {
          if (response.success) {
            // Store session token
            localStorage.setItem('sessionToken', response.token);
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to join session'));
          }
        });
      } catch (error) {
        console.error('Error creating passphrase fingerprint:', error);
        reject(new Error('Failed to create passphrase fingerprint'));
      }
    });
  };

  /**
   * Leave a session
   * @param sessionId Session ID
   */
  const leaveSession = (sessionId: string) => {
    if (socket) {
      socket.emit('leave', { sessionId });
      localStorage.removeItem('sessionToken');
    }
  };

  /**
   * Send content to a session
   * @param sessionId Session ID
   * @param content Content to send
   * @param data Optional data (for small content)
   */
  const sendContent = (sessionId: string, content: ContentMetadata, data?: string) => {
    if (socket) {
      console.log('[Socket] Sending content to session:', sessionId, 'Content ID:', content.contentId);
      
      if (!socket.connected) {
        console.warn('[Socket] Socket is not connected! Cannot send content.');
        // Attempt to reconnect
        socket.connect();
        return false;
      }
      
      socket.emit('content', { sessionId, content, data }, (response: ContentResponse) => {
        if (response && !response.success) {
          console.error('[Socket] Failed to send content:', response.error);
          
          // If token is invalid, try to rejoin the session
          if (response.error === 'Invalid session' || response.error === 'Invalid token') {
            const clientName = localStorage.getItem('clientName');
            const passphrase = localStorage.getItem('passphrase');
            
            if (clientName && passphrase) {
              console.log('[Socket] Session token invalid, attempting to rejoin');
              rejoinSession(sessionId, clientName, passphrase);
            }
          }
        } else {
          console.log('[Socket] Content sent successfully for:', content.contentId);
        }
      });
    } else {
      console.error('[Socket] Cannot send content: Socket is null');
      return false;
    }
    return true;
  };

  /**
   * Send a chunk to a session
   * @param sessionId Session ID
   * @param chunk Chunk to send
   */
  const sendChunk = (sessionId: string, chunk: ChunkData) => {
    if (socket) {
      console.log(`[Socket] Sending chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId}`);
      
      if (!socket.connected) {
        console.warn('[Socket] Socket is not connected! Cannot send chunk.');
        // Attempt to reconnect
        socket.connect();
        return false;
      }
      
      socket.emit('chunk', { sessionId, chunk }, (response: ContentResponse) => {
        if (response && !response.success) {
          console.error('[Socket] Failed to send chunk:', response.error);
          
          // If token is invalid, try to rejoin the session
          if (response.error === 'Invalid session' || response.error === 'Invalid token') {
            const clientName = localStorage.getItem('clientName');
            const passphrase = localStorage.getItem('passphrase');
            
            if (clientName && passphrase) {
              console.log('[Socket] Session token invalid, attempting to rejoin');
              rejoinSession(sessionId, clientName, passphrase);
            }
          }
        } else {
          console.log(`[Socket] Chunk sent successfully for chunk ${chunk.chunkIndex}`);
        }
      });
    } else {
      console.error('[Socket] Cannot send chunk: Socket is null');
      return false;
    }
    return true;
  };

  // Context value
  const value: SocketContextType = {
    socket,
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    joinSession,
    leaveSession,
    sendContent,
    sendChunk,
    rejoinSession
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * Hook to use the socket context
 */
export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  
  return context;
};