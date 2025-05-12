import React, { createContext, useContext, useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';

// Socket.IO client instance
let socket: any | null = null;

// Socket context interface
interface SocketContextType {
  socket: any | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  joinSession: (sessionId: string, clientName: string, passphrase: string) => Promise<any>;
  leaveSession: (sessionId: string) => void;
  sendContent: (sessionId: string, content: any, data?: string) => void;
  sendChunk: (sessionId: string, chunk: any) => void;
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

  // Initialize socket
  useEffect(() => {
    // Create socket instance if it doesn't exist
    if (!socket) {
      // Dynamically determine the backend URL based on the current window location
      const getBackendUrl = () => {
        // If an environment variable is set, use it
        if (import.meta.env.VITE_SOCKET_URL) {
          return import.meta.env.VITE_SOCKET_URL;
        }
        
        // Otherwise, derive from the current URL
        const currentUrl = new URL(window.location.href);
        // Use the same hostname but with port 3001
        return `${currentUrl.protocol}//${currentUrl.hostname}:3001`;
      };

      console.log(`[Socket] Connecting to backend at: ${getBackendUrl()}`);
      
      socket = socketIOClient(getBackendUrl(), {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });
    }

    // Set up event listeners
    const onConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
    };

    const onDisconnect = (reason: string) => {
      console.log(`Socket disconnected: ${reason}`);
      setIsConnected(false);
    };

    const onConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
    };

    // Add event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // Connect socket
    if (!socket.connected) {
      socket.connect();
    }

    // Clean up on unmount
    return () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      socket?.off('connect_error', onConnectError);
    };
  }, []);

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
  const joinSession = async (sessionId: string, clientName: string, passphrase: string): Promise<any> => {
    return new Promise(async (resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      try {
        // Create passphrase fingerprint
        const fingerprint = await generateFingerprint(passphrase);

        // Join session
        socket.emit('join', { sessionId, clientName, fingerprint }, (response: any) => {
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
  const sendContent = (sessionId: string, content: any, data?: string) => {
    if (socket) {
      console.log('[Socket] Sending content to session:', sessionId, 'Content ID:', content.contentId);
      
      if (!socket.connected) {
        console.warn('[Socket] Socket is not connected! Attempting to send content anyway.');
      }
      
      socket.emit('content', { sessionId, content, data });
      console.log('[Socket] Content emit called for:', content.contentId);
    } else {
      console.error('[Socket] Cannot send content: Socket is null');
    }
  };

  /**
   * Send a chunk to a session
   * @param sessionId Session ID
   * @param chunk Chunk to send
   */
  const sendChunk = (sessionId: string, chunk: any) => {
    if (socket) {
      console.log(`[Socket] Sending chunk ${chunk.chunkIndex}/${chunk.totalChunks} for content ${chunk.contentId}`);
      
      if (!socket.connected) {
        console.warn('[Socket] Socket is not connected! Attempting to send chunk anyway.');
      }
      
      socket.emit('chunk', { sessionId, chunk });
      console.log(`[Socket] Chunk emit called for chunk ${chunk.chunkIndex}`);
    } else {
      console.error('[Socket] Cannot send chunk: Socket is null');
    }
  };

  // Context value
  const value: SocketContextType = {
    socket,
    isConnected,
    connect,
    disconnect,
    joinSession,
    leaveSession,
    sendContent,
    sendChunk
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