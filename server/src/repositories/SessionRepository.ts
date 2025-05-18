import { PassphraseFingerprint } from '../services/SessionManager';

/**
 * Session authentication information stored in the repository
 */
export interface SessionAuthRecord {
  /**
   * Session identifier
   */
  sessionId: string;
  
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
 * Repository interface for session persistence
 */
export interface SessionRepository {
  /**
   * Initializes the repository
   */
  initialize(): Promise<void>;
  
  /**
   * Finds a session by ID
   * @param sessionId Session ID
   * @returns Session auth record or null if not found
   */
  findById(sessionId: string): Promise<SessionAuthRecord | null>;
  
  /**
   * Saves a new session
   * @param session Session auth record
   */
  save(session: SessionAuthRecord): Promise<void>;
  
  /**
   * Updates an existing session
   * @param session Session auth record
   */
  update(session: SessionAuthRecord): Promise<void>;
  
  /**
   * Deletes a session
   * @param sessionId Session ID
   */
  delete(sessionId: string): Promise<void>;
  
  /**
   * Finds all sessions
   * @returns Array of session auth records
   */
  findAll(): Promise<SessionAuthRecord[]>;
  
  /**
   * Finds expired sessions
   * @param expiryTime Expiry time in milliseconds
   * @returns Array of expired session IDs
   */
  findExpired(expiryTime: number): Promise<string[]>;
  
  /**
   * Closes the repository
   */
  close(): Promise<void>;
}