import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  senderId: string;
  senderName: string;
  contentType: string;
  timestamp: number;
  metadata: {
    fileName: string;
    mimeType: string;
    size: number;
    fileInfo?: {
      extension: string;
    };
    imageInfo?: {
      width: number;
      height: number;
      format: string;
    };
  };
  isChunked: boolean;
  totalChunks: number;
  totalSize: number;
  isPinned: boolean;
  encryptionMetadata?: {
    iv: number[];
  };
}

export interface ChunkData {
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
  ensureConnected: (sessionId: string) => Promise<boolean>;
  removeContent: (sessionId: string, contentId: string) => Promise<{ success: boolean; error?: string }>;
  isJoining: boolean;
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
  
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const [pingInterval, setPingInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Reference to track reconnection attempts
  const reconnectAttempts = useRef<number>(0);
  
  // Reference to prevent multiple simultaneous rejoin attempts
  const isRejoining = useRef<boolean>(false);
  
  // Global join state management to prevent duplicate requests and Promise conflicts
  const joinState = useRef<{
    isJoining: boolean;
    currentJoinPromise: Promise<JoinResponse> | null;
    sessionId: string | null;
  }>({
    isJoining: false,
    currentJoinPromise: null,
    sessionId: null
  });
  
  // Function to clear content when connection is lost
  

  // Initialize socket
  useEffect(() => {
    // Create socket instance if it doesn't exist
    if (!socket) {
      // Dynamically determine the backend URL based on the current window location
      const getBackendUrl = () => {
        // If an environment variable is set to a specific value (not 'auto'), use it
        if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL !== 'auto') {
          return import.meta.env.VITE_SOCKET_URL;
        }
        
        // Otherwise, derive from the current URL
        const currentUrl = new URL(window.location.href);
        
        // Determine the appropriate port based on environment variables or fallback to default
        // Use the VITE_API_PORT environment variable with a default value of '3001'
        const port = import.meta.env.VITE_API_PORT || '3001';
        // IMPORTANT: Do NOT use the current URL's port as a fallback
        // The frontend and backend are on different ports (15000 vs 15001)
        
        // Construct the backend URL
        const backendUrl = `${currentUrl.protocol}//${currentUrl.hostname}${port ? ':' + port : ''}`;
        return backendUrl;
      };

      
      socket = socketIOClient(getBackendUrl(), {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5, // Reduced from 10 to 5 attempts for faster feedback
        reconnectionDelay: 500, // Reduced from 1000 to 500ms for faster reconnection
        reconnectionDelayMax: 1500, // Reduced from 3000 to 1500ms
        timeout: 10000, // Reduced from 20000 to 10000 (10 seconds) for faster timeout detection
        forceNew: true, // Force a new connection to avoid stale connections
        upgrade: true, // Allow transport upgrades
        rememberUpgrade: true, // Remember the transport upgrade
        extraHeaders: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
    }

    // Set up event listeners
    const onConnect = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
    };

    const onDisconnect = () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };

    const onConnectError = (error: Error) => {
      console.error('[Socket] Connection error:', error);
      setConnectionStatus('disconnected');
      
      // Reset connection if we've had too many attempts
      if (reconnectAttempts.current > 5) {
        if (socket) {
          socket.disconnect();
          socket.connect(); // Force a fresh connection
        }
        reconnectAttempts.current = 0;
        return;
      }
      
      // Attempt to reconnect after a short delay with exponential backoff
      const backoffDelay = Math.min(5000, 1000 * Math.pow(1.5, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      
      setTimeout(() => {
        if (socket && !socket.connected) {
          socket.connect();
        }
      }, backoffDelay);
    };

    const onReconnect = () => {
      setConnectionStatus('connected');
      
      // Reset reconnect attempts counter
      reconnectAttempts.current = 0;
      
      // Auto-rejoin session if we have the credentials
      const sessionId = localStorage.getItem('sessionId');
      const clientName = localStorage.getItem('clientName');
      const passphrase = localStorage.getItem('passphrase');
      
      if (sessionId && clientName && passphrase && !isRejoining.current) {
        // Add a small delay before rejoining to ensure the connection is stable
        setTimeout(() => {
          rejoinSession(sessionId, clientName, passphrase);
        }, 500);
      }
    };
    
    const onReconnectAttempt = (attemptNumber: number) => {
      setConnectionStatus('reconnecting');
      
      // If we're having trouble reconnecting, try to force a new connection
      if (attemptNumber > 5 && attemptNumber % 3 === 0) {
        if (socket) {
          // Disconnect and reconnect with a clean slate
          socket.disconnect();
          setTimeout(() => {
            if (socket) {
              socket.connect();
            }
          }, 1000);
        }
      }
    };
    
    const onReconnectError = (error: Error) => {
      console.error('[Socket] Reconnection error:', error);
      // If we've reached the maximum number of reconnection attempts, reset the counter
      // and try a complete reconnection
      if (reconnectAttempts.current >= 10) {
        reconnectAttempts.current = 0;
        
        // Force a complete reconnection
        if (socket) {
          socket.disconnect();
          
          // Wait a bit longer before reconnecting
          setTimeout(() => {
            if (socket) {
              socket.connect();
            }
          }, 3000); // Increased delay to 3 seconds
        }
      }
    };

    const onReconnecting = () => {
      setConnectionStatus('reconnecting');
    };

    // Add event listeners
    if (socket) {
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connect_error', onConnectError);
      socket.on('reconnect', onReconnect);
      socket.on('reconnect_attempt', onReconnectAttempt);
      socket.on('reconnect_error', onReconnectError);
      socket.on('reconnecting', onReconnecting);
      socket.on('reconnect_error', (error: Error) => console.error('[Socket] Reconnection error:', error));
      socket.on('reconnect_failed', () => {
        console.error('[Socket] Failed to reconnect after all attempts');
        setConnectionStatus('disconnected');
      });
    }

    // Connect socket
    if (socket && !socket.connected) {
      socket.connect();
    }
    
    // Setup periodic health check
    if (!pingInterval) {
      const interval = setInterval(() => {
        if (socket && socket.connected) {
          const sessionId = localStorage.getItem('sessionId');
          if (sessionId) {
            socket.emit('ping', { sessionId }, (response: { valid: boolean, error?: string }) => {
              if (response && !response.valid) {
                console.warn('[Socket] Session invalid during health check:', response.error);
                
                // Try to rejoin if possible
                const clientName = localStorage.getItem('clientName');
                const passphrase = localStorage.getItem('passphrase');
                if (clientName && passphrase && !isRejoining.current) {
                  // Auto-rejoin disabled
                }
              }
            });
          }
        }
      }, 30000); // Check every 30 seconds
      
      setPingInterval(interval);
    }

    // Handle visibility change events with improved resilience
    const handleVisibilityChange = () => {
      
      if (document.visibilityState === 'visible') {
        // When app becomes visible again, check connection and rejoin if needed
        if (socket && !socket.connected) {
          
          // Add a small delay before reconnecting to allow browser to stabilize
          setTimeout(() => {
            if (socket && !socket.connected) {
              socket.connect();
              
              // After connecting, check if we need to rejoin the session
              setTimeout(() => {
                const sessionId = localStorage.getItem('sessionId');
                const clientName = localStorage.getItem('clientName');
                const passphrase = localStorage.getItem('passphrase');
                
                if (socket && socket.connected && sessionId && clientName && passphrase) {
                  // rejoinSession(sessionId, clientName, passphrase);
                }
              }, 1000);
            }
          }, 500);
        } else if (socket && socket.connected) {
          // Even if socket is connected, verify session is still valid
          const sessionId = localStorage.getItem('sessionId');
          const clientName = localStorage.getItem('clientName');
          const passphrase = localStorage.getItem('passphrase');
          
          if (sessionId && clientName && passphrase) {
            // We'll ping the server to verify our session is still valid
            socket.emit('ping', { sessionId }, (response: { valid: boolean }) => {
              if (!response || !response.valid) {
                // Add a small delay before rejoining to ensure stability
                if (!isRejoining.current) {
                  setTimeout(() => {
                    rejoinSession(sessionId, clientName, passphrase);
                  }, 500);
                }
              } else {
                // Session is valid, no action needed
              }
            });
          }
        }
      }
    };
    
    // Also handle window focus events for better cross-browser compatibility
    const handleFocus = () => {
      if (socket && !socket.connected) {
        socket.connect();
        
        // Check if we need to rejoin after connection
        setTimeout(() => {
          const sessionId = localStorage.getItem('sessionId');
          const clientName = localStorage.getItem('clientName');
          const passphrase = localStorage.getItem('passphrase');
          
          if (socket && socket.connected && sessionId && clientName && passphrase && !isRejoining.current) {
            // Auto-rejoin disabled
          }
        }, 1500);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Clean up on unmount
    return () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      socket?.off('connect_error', onConnectError);
      socket?.off('reconnect', onReconnect);
      socket?.off('reconnect_attempt', onReconnectAttempt);
      socket?.off('reconnect_error', onReconnectError);
      socket?.off('reconnecting', onReconnecting);
      socket?.off('reconnect_failed');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      
      // Clear ping interval
      if (pingInterval) {
        clearInterval(pingInterval);
        setPingInterval(null);
      }
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
    if (!socket || !socket.connected) return;
    
    // Prevent rejoin if main join is in progress
    if (joinState.current.isJoining) {
      return;
    }
    
    // Prevent multiple simultaneous rejoin attempts
    if (isRejoining.current) {
      return;
    }
    
    try {
      isRejoining.current = true;
      
      // Use the main joinSession function to ensure consistency
      await joinSession(sessionId, clientName, passphrase);
      
      // Notify application that we've rejoined
      if (socket) {
        socket.emit('client-rejoined', { sessionId, clientName });
      }
    } catch (error) {
      console.error('[Socket] Error rejoining session:', error);
    } finally {
      isRejoining.current = false;
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
   * Performs the actual join session operation (internal helper)
   */
  const performJoinSession = async (sessionId: string, clientName: string, passphrase: string): Promise<JoinResponse> => {
    if (!socket) {
      throw new Error('Socket not initialized');
    }

    try {
      // Create passphrase fingerprint
      const fingerprint = await generateFingerprint(passphrase);

      // Join session
      const socketInstance = socket;
      return new Promise<JoinResponse>((resolve, reject) => {
        // Get cached content IDs from sessionStorage directly
        let cachedContentIds: string[] = [];
        try {
          const savedState = sessionStorage.getItem('contentStoreState');
          if (savedState) {
            const parsedState = JSON.parse(savedState);
            const parsedContents = parsedState.contents || [];
            cachedContentIds = parsedContents.map(([contentId]: [string, unknown]) => contentId);
          }
        } catch (error) {
          console.error('[SocketContext] Error reading cached content IDs:', error);
          cachedContentIds = [];
        }
        
        // Add timeout to prevent infinite waiting
        const timeoutId = setTimeout(() => {
          console.error('[SocketContext] Join session timeout - no response from server');
          reject(new Error('Join session timeout - server did not respond'));
        }, 15000); // 15 second timeout
        
        socketInstance.emit('join', {
          sessionId,
          clientName,
          fingerprint,
          cachedContentIds
        }, (response: JoinResponse) => {
          clearTimeout(timeoutId);
          
          if (response.success && response.token) {
            localStorage.setItem('sessionToken', response.token);
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to join session'));
          }
        });
      });
    } catch (error) {
      console.error('Error creating passphrase fingerprint:', error);
      throw new Error('Failed to create passphrase fingerprint');
    }
  };

  /**
   * Join a session with Promise deduplication to prevent duplicate requests
   * @param sessionId Session ID
   * @param clientName Client name
   * @param passphrase Session passphrase
   * @returns Promise that resolves with session data
   */
  const joinSession = async (sessionId: string, clientName: string, passphrase: string): Promise<JoinResponse> => {
    // If already joining the same session, return existing Promise
    if (joinState.current.isJoining && joinState.current.sessionId === sessionId) {
      if (joinState.current.currentJoinPromise) {
        return joinState.current.currentJoinPromise;
      }
    }

    // If joining a different session, wait for current to complete
    if (joinState.current.isJoining && joinState.current.sessionId !== sessionId) {
      try {
        await joinState.current.currentJoinPromise;
      } catch (error) {
        // Ignore errors from previous join, continue with new one
      }
    }

    // Set join state
    joinState.current.isJoining = true;
    joinState.current.sessionId = sessionId;

    // Create the actual join Promise
    const joinPromise = performJoinSession(sessionId, clientName, passphrase);
    joinState.current.currentJoinPromise = joinPromise;

    try {
      const result = await joinPromise;
      return result;
    } catch (error) {
      console.error('[SocketContext] Join failed:', error);
      throw error;
    } finally {
      // Reset join state
      joinState.current.isJoining = false;
      joinState.current.currentJoinPromise = null;
      joinState.current.sessionId = null;
    }
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
      if (!socket.connected) {
        // Attempt to reconnect
        socket.connect();
        return false;
      }
      
      // First verify session is still valid
      socket.emit('ping', { sessionId }, (pingResponse: { valid: boolean, error?: string }) => {
        if (!pingResponse || !pingResponse.valid) {
          
          // Try to rejoin if possible
          const clientName = localStorage.getItem('clientName');
          const passphrase = localStorage.getItem('passphrase');
          if (clientName && passphrase) {
            rejoinSession(sessionId, clientName, passphrase)
              .then(() => {
                // Try sending content again after rejoining
                sendContent(sessionId, content, data);
              })
              .catch(err => {
                console.error('[Socket] Failed to rejoin session:', err);
              });
          }
          return;
        }
        
        // Session is valid, proceed with sending content
        if (socket) {
          
          // Set a timeout to detect if callback is never called
          const timeoutId = setTimeout(() => {
            console.error('Content emit callback timeout');
          }, 10000); // 10 second timeout
          
          socket.emit('content', { sessionId, content, data }, (response: ContentResponse) => {
          clearTimeout(timeoutId); // Clear timeout since callback was received
          if (response && !response.success) {
            console.error('[Socket] Failed to send content:', response.error);
            
            // If token is invalid, try to rejoin the session
            if (response.error === 'Invalid session' || response.error === 'Invalid token' || response.error === 'Session not found') {
              const clientName = localStorage.getItem('clientName');
              const passphrase = localStorage.getItem('passphrase');
              
              if (clientName && passphrase) {
                rejoinSession(sessionId, clientName, passphrase);
              }
            }
          }
          });
        }
      });
    } else {
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
      if (!socket.connected) {
        // Attempt to reconnect
        socket.connect();
        return false;
      }
      
      // First verify session is still valid
      socket.emit('ping', { sessionId }, (pingResponse: { valid: boolean, error?: string }) => {
        if (!pingResponse || !pingResponse.valid) {
          
          // Try to rejoin if possible
          const clientName = localStorage.getItem('clientName');
          const passphrase = localStorage.getItem('passphrase');
          if (clientName && passphrase) {
            rejoinSession(sessionId, clientName, passphrase)
              .then(() => {
                // Try sending chunk again after rejoining
                sendChunk(sessionId, chunk);
              })
              .catch(err => {
                console.error('[Socket] Failed to rejoin session:', err);
              });
          }
          return;
        }
        
        // Session is valid, proceed with sending chunk
        if (socket) {
          socket.emit('chunk', { sessionId, chunk }, (response: ContentResponse) => {
          if (response && !response.success) {
            console.error('[Socket] Failed to send chunk:', response.error);
            
            // If token is invalid, try to rejoin the session
            if (response.error === 'Invalid session' || response.error === 'Invalid token' || response.error === 'Session not found') {
              const clientName = localStorage.getItem('clientName');
              const passphrase = localStorage.getItem('passphrase');
              
              if (clientName && passphrase) {
                rejoinSession(sessionId, clientName, passphrase);
              }
            }
          }
          });
        }
      });
    } else {
      return false;
    }
    return true;
  };

  /**
   * Ensures the socket is connected and session is valid
   * @param sessionId Session ID
   * @returns Promise that resolves to true if connected and session is valid
   */
  const ensureConnected = async (sessionId: string): Promise<boolean> => {
    if (!socket) {
      connect();
      return false;
    }

    if (!socket.connected) {
      socket.connect();
      return false;
    }

    // Verify session is valid
    return new Promise<boolean>((resolve) => {
      if (socket) {
        socket.emit('ping', { sessionId }, (response: { valid: boolean }) => {
        if (!response || !response.valid) {
          resolve(false);
        } else {
          resolve(true);
        }
        });
      } else {
        resolve(false);
      }
    });
  };

  /**
   * Remove content from the session
   * @param sessionId Session ID
   * @param contentId Content ID to remove
   * @returns Promise with success status
   */
  const removeContent = (sessionId: string, contentId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (socket && isConnected) {
        socket.emit('remove-content', { sessionId, contentId }, (response: { success: boolean; error?: string }) => {
          if (!response.success) {
            console.error(`Failed to remove content:`, response.error);
          }
          resolve(response);
        });
      } else {
        resolve({ success: false, error: 'Socket not connected' });
      }
    });
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
    rejoinSession,
    ensureConnected,
    removeContent,
    isJoining: joinState.current.isJoining
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