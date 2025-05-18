import { Session } from '../domain/Session';
import { Client } from '../domain/Client';
import { Socket } from 'socket.io';
import crypto from 'crypto';
import { SessionRepository, SessionAuthRecord } from '../repositories/SessionRepository';
import { SQLiteSessionRepository } from '../repositories/SQLiteSessionRepository';

/**
 * Passphrase fingerprint structure
 */
export interface PassphraseFingerprint {
  iv: number[];
  data: number[];
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

  /**
   * Path to SQLite database file
   * Default: ./data/sessions.db
   */
  dbPath?: string;
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
   * Session repository for persistence
   */
  private sessionRepository: SessionRepository;
  
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
    
    // Initialize repository
    const dbPath = config.dbPath || process.env.SQLITE_DB_PATH || './data/sessions.db';
    this.sessionRepository = new SQLiteSessionRepository(dbPath);
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000); // Check every minute
  }
  
  /**
   * Initializes the session manager
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize repository
      await this.sessionRepository.initialize();
      
      // Load existing sessions from repository
      await this.loadSessionsFromRepository();
      
      console.log('Session manager initialized successfully');
    } catch (error: any) {
      console.error('Failed to initialize session manager:', error);
      throw new Error(`Session manager initialization failed: ${error.message || String(error)}`);
    }
  }
  
  /**
   * Loads sessions from repository
   */
  private async loadSessionsFromRepository(): Promise<void> {
    try {
      const sessionRecords = await this.sessionRepository.findAll();
      console.log(`Loaded ${sessionRecords.length} sessions from repository`);
      
      // We don't need to create Session objects here since they'll be created when clients join
    } catch (error: any) {
      console.error('Error loading sessions from repository:', error);
      throw new Error(`Error loading sessions from repository: ${error.message || String(error)}`);
    }
  }
  
  /**
   * Stops the session manager
   */
  public async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Close repository
    await this.sessionRepository.close();
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
    
    try {
      // Check if session exists in repository
      const sessionRecord = await this.sessionRepository.findById(sessionId);
      
      if (sessionRecord) {
        // Verify fingerprint
        const fingerprintsMatch = this.compareFingerprints(fingerprint, sessionRecord.fingerprint);
        console.log(`Fingerprints match: ${fingerprintsMatch}`);
        
        if (!fingerprintsMatch) {
          return { success: false, error: 'Invalid passphrase' };
        }
        
        // Update last activity
        sessionRecord.lastActivity = new Date();
        await this.sessionRepository.update(sessionRecord);
      } else {
        // Create new session record
        const newSessionRecord: SessionAuthRecord = {
          sessionId,
          fingerprint,
          createdAt: new Date(),
          lastActivity: new Date()
        };
        
        // Save to repository
        await this.sessionRepository.save(newSessionRecord);
      }
      
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
    } catch (error: any) {
      console.error(`Error joining session ${sessionId}:`, error);
      return { success: false, error: 'Internal server error' };
    }
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
  async removeClientFromSession(sessionId: string, clientId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    // Remove client from session
    session.removeClient(clientId);
    
    // Remove session token
    this.sessionTokens.delete(clientId);
    
    try {
      // Update last activity in repository
      const sessionRecord = await this.sessionRepository.findById(sessionId);
      if (sessionRecord) {
        sessionRecord.lastActivity = new Date();
        await this.sessionRepository.update(sessionRecord);
      }
      
      // If session is empty, remove it from memory (but keep in repository)
      if (session.clients.size === 0) {
        this.sessions.delete(sessionId);
      }
      
      return true;
    } catch (error: any) {
      console.error(`Error removing client ${clientId} from session ${sessionId}:`, error);
      return false;
    }
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
  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    console.log(`[SessionManager] Running cleanup check at ${now.toISOString()}`);
    
    try {
      // Find expired sessions in repository
      const expiredSessionIds = await this.sessionRepository.findExpired(this.sessionTimeout);
      
      for (const sessionId of expiredSessionIds) {
        console.log(`[SessionManager] Session ${sessionId} expired`);
        
        // Get session from memory
        const session = this.sessions.get(sessionId);
        
        // If session exists in memory, disconnect all clients
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
          
          // Remove session from memory
          this.sessions.delete(sessionId);
        }
        
        // Remove session from repository
        await this.sessionRepository.delete(sessionId);
        
        console.log(`[SessionManager] Successfully removed expired session ${sessionId}`);
      }
    } catch (error: any) {
      console.error('[SessionManager] Error cleaning up expired sessions:', error);
    }
  }
}