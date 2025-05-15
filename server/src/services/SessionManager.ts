import { Session } from '../domain/Session';
import { Client } from '../domain/Client';
import { Socket } from 'socket.io';
import crypto from 'crypto';

/**
 * Session authentication information
 */
/**
 * Passphrase fingerprint structure
 */
export interface PassphraseFingerprint {
  iv: number[];
  data: number[];
}

interface SessionAuth {
  /**
   * Passphrase fingerprint (self-encrypted passphrase)
   */
  fingerprint: PassphraseFingerprint;
  
  /**
   * Session creation timestamp
   */
  createdAt: Date;
  
  /**
   * Last activity timestamp
   */
  lastActivity: Date;
}

/**
 * Session manager configuration
 */
interface SessionManagerConfig {
  /**
   * Session timeout in milliseconds
   * Default: 10 minutes
   */
  sessionTimeout?: number;
}

/**
 * Session join result
 */
interface SessionJoinResult {
  /**
   * Whether the join was successful
   */
  success: boolean;
  
  /**
   * Session token (if successful)
   */
  token?: string;
  
  /**
   * Error message (if unsuccessful)
   */
  error?: string;
}

/**
 * Manages sessions and authentication
 */
export class SessionManager {
  /**
   * Map of session ID to Session
   */
  private sessions: Map<string, Session> = new Map();
  
  /**
   * Map of session ID to SessionAuth
   */
  private sessionAuth: Map<string, SessionAuth> = new Map();
  
  /**
   * Map of client ID to session token
   */
  private sessionTokens: Map<string, string> = new Map();
  
  /**
   * Session timeout in milliseconds
   */
  private sessionTimeout: number;
  
  /**
   * Cleanup interval ID
   */
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  /**
   * Creates a new session manager
   * @param config Session manager configuration
   */
  constructor(config: SessionManagerConfig = {}) {
    this.sessionTimeout = config.sessionTimeout || 10 * 60 * 1000; // Default 10 minutes
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000); // Check every minute
  }
  
  /**
   * Stops the session manager
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Joins a session
   * @param sessionId Session ID
   * @param fingerprint Passphrase fingerprint
   * @param clientId Client ID
   * @param clientName Client name
   * @param socket Client socket
   * @returns Session join result
   */
  async joinSession(
    sessionId: string,
    fingerprint: PassphraseFingerprint,
    clientId: string,
    clientName: string,
    socket: Socket
  ): Promise<SessionJoinResult> {
   console.log(`Attempting to join session: ${sessionId}`);
   console.log(`Fingerprint: ${JSON.stringify(fingerprint)}`);

    // Check if session exists
    if (this.sessionAuth.has(sessionId)) {
      // Verify fingerprint
      const storedAuth = this.sessionAuth.get(sessionId);
      if (!storedAuth) {
        return { success: false, error: 'Session not found' };
      }
      const fingerprintsMatch = this.compareFingerprints(fingerprint, storedAuth.fingerprint);
      console.log(`Fingerprints match: ${fingerprintsMatch}`);
      if (!fingerprintsMatch) {
        return { success: false, error: 'Invalid passphrase' };
      }
    } else {
      // Create new session auth
      this.sessionAuth.set(sessionId, {
        fingerprint,
        createdAt: new Date(),
        lastActivity: new Date()
      });
    }
    
    // Update last activity
    const auth = this.sessionAuth.get(sessionId);
    if (!auth) {
      return { success: false, error: 'Session not found' };
    }
    auth.lastActivity = new Date();
    
    // Generate session token
    const token = this.generateSessionToken();
    this.sessionTokens.set(clientId, token);
    
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new Session(sessionId);
      this.sessions.set(sessionId, session);
    }
    
    // Check if client already exists in session
    const existingClient = session.clients.get(clientId);
    if (existingClient) {
      console.log(`Client ${clientId} (${clientName}) already exists in session ${sessionId}`);
      console.log(`Existing clients in session: ${Array.from(session.clients.keys()).join(', ')}`);
      
      // Update the existing client instead of adding a new one
      session.removeClient(clientId);
      console.log(`Removed existing client ${clientId} from session ${sessionId}`);
    }
    
    // Add client to session
    const client = new Client(clientId, clientName, socket);
    session.addClient(client);
    console.log(`Added client ${clientId} (${clientName}) to session ${sessionId}`);
    console.log(`Updated clients in session: ${Array.from(session.clients.keys()).join(', ')}`);
    
    return { success: true, token };
  }
  
  /**
   * Validates a session token
   * @param clientId Client ID
   * @param token Session token
   * @returns Whether the token is valid
   */
  validateSessionToken(clientId: string, token: string): boolean {
    return this.sessionTokens.get(clientId) === token;
  }
  
  /**
   * Gets a session
   * @param sessionId Session ID
   * @returns Session or undefined if not found
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Removes a client from a session
   * @param sessionId Session ID
   * @param clientId Client ID
   * @returns Whether the client was removed
   */
  removeClientFromSession(sessionId: string, clientId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    // Remove client from session
    session.removeClient(clientId);
    
    // Remove session token
    this.sessionTokens.delete(clientId);
    
    // Update last activity
    const auth = this.sessionAuth.get(sessionId);
    if (auth) {
      auth.lastActivity = new Date();
    }
    
    // If session is empty, remove it
    if (session.clients.size === 0) {
      this.sessions.delete(sessionId);
    }
    
    return true;
  }
  
  /**
   * Compares two fingerprints
   * @param a First fingerprint
   * @param b Second fingerprint
   * @returns Whether the fingerprints match
   */
  private compareFingerprints(a: PassphraseFingerprint, b: PassphraseFingerprint): boolean {
    // Compare IVs
    if (a.iv.length !== b.iv.length) return false;
    for (let i = 0; i < a.iv.length; i++) {
      if (a.iv[i] !== b.iv[i]) return false;
    }
    
    // Compare data
    if (a.data.length !== b.data.length) return false;
    for (let i = 0; i < a.data.length; i++) {
      if (a.data[i] !== b.data[i]) return false;
    }
    
    return true;
  }
  
  /**
   * Generates a session token
   * @returns Session token
   */
  private generateSessionToken(): string {
    // Generate a random token
    const array = Buffer.alloc(32);
    crypto.randomFillSync(array);
    return array.toString('hex');
  }
  
  /**
   * Cleans up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    console.log(`[SessionManager] Running cleanup check at ${now.toISOString()}`);
    
    for (const [sessionId, auth] of this.sessionAuth.entries()) {
      const elapsed = now.getTime() - auth.lastActivity.getTime();
      const elapsedSeconds = Math.floor(elapsed / 1000);
      
      // Log sessions that are getting close to timeout
      if (elapsed > (this.sessionTimeout * 0.8) && elapsed <= this.sessionTimeout) {
        console.log(`[SessionManager] Session ${sessionId} approaching timeout (inactive for ${elapsedSeconds}s, timeout at ${this.sessionTimeout / 1000}s)`);
      }
      
      if (elapsed > this.sessionTimeout) {
        // Get session
        const session = this.sessions.get(sessionId);
        
        console.log(`[SessionManager] Session ${sessionId} expired (inactive for ${elapsedSeconds}s)`);
        
        // If session exists, disconnect all clients
        if (session) {
          const clientCount = session.clients.size;
          console.log(`[SessionManager] Disconnecting ${clientCount} clients from expired session ${sessionId}`);
          
          // Disconnect all clients
          for (const [clientId, client] of session.clients.entries()) {
            console.log(`[SessionManager] Disconnecting client ${clientId} from expired session ${sessionId}`);
            client.sendNotification('session-expired', {
              sessionId,
              message: 'Session expired due to inactivity'
            });
            
            // Remove client token
            this.sessionTokens.delete(clientId);
          }
        }
        
        // Remove session
        this.sessions.delete(sessionId);
        this.sessionAuth.delete(sessionId);
        
        // Log successful cleanup
        console.log(`[SessionManager] Successfully removed expired session ${sessionId}`);
      }
    }
  }
}