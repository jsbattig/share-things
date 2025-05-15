import { Session } from '../domain/Session';
import { Socket } from 'socket.io';
import { SessionManager, PassphraseFingerprint, SessionJoinResult } from './SessionManager';
import { Pool } from 'pg';

/**
 * PostgreSQL configuration
 */
export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/**
 * PostgreSQL session manager configuration
 */
export interface PostgreSQLSessionManagerConfig {
  sessionTimeout?: number;
  postgresConfig: PostgreSQLConfig;
}

/**
 * Session manager that uses PostgreSQL for persistence
 */
export class PostgreSQLSessionManager extends SessionManager {
  private pool: Pool;
  private initialized = false;
  
  /**
   * Creates a new PostgreSQL session manager
   * @param config PostgreSQL session manager configuration
   */
  constructor(config: PostgreSQLSessionManagerConfig) {
    super({ sessionTimeout: config.sessionTimeout });
    
    // Initialize PostgreSQL connection pool
    this.pool = new Pool(config.postgresConfig);
    
    // Initialize database schema
    this.initialize().catch((err: Error) => {
      console.error('[PostgreSQL] Failed to initialize PostgreSQL session storage:', err);
    });
  }
  
  /**
   * Stops the session manager
   */
  public override stop(): void {
    super.stop();
    
    // Close PostgreSQL connection pool
    this.pool.end().catch((err: Error) => {
      console.error('[PostgreSQL] Error closing connection pool:', err);
    });
  }
  
  /**
   * Initializes the database schema and handles migrations
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const client = await this.pool.connect();
    try {
      console.log('[PostgreSQL] Initializing database schema...');
      
      // Check if schema_version table exists
      const schemaVersionExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'schema_version'
        )
      `);
      
      let currentVersion = 0;
      
      if (!schemaVersionExists.rows[0].exists) {
        // Create schema_version table
        await client.query(`
          CREATE TABLE schema_version (
            id SERIAL PRIMARY KEY,
            version INTEGER NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        
        // Insert initial version
        await client.query(`
          INSERT INTO schema_version (version) VALUES (0)
        `);
      } else {
        // Get current schema version
        const versionResult = await client.query(`
          SELECT version FROM schema_version ORDER BY id DESC LIMIT 1
        `);
        
        if (versionResult.rows.length > 0) {
          currentVersion = versionResult.rows[0].version;
        }
      }
      
      console.log(`[PostgreSQL] Current schema version: ${currentVersion}`);
      
      // Begin transaction for migrations
      await client.query('BEGIN');
      
      try {
        // Apply migrations based on current version
        if (currentVersion < 1) {
          console.log('[PostgreSQL] Applying migration to version 1: Creating initial tables');
          
          // Create initial tables
          await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
              session_id VARCHAR(255) PRIMARY KEY,
              created_at TIMESTAMP NOT NULL,
              last_activity TIMESTAMP NOT NULL,
              fingerprint_iv BYTEA NOT NULL,
              fingerprint_data BYTEA NOT NULL
            )
          `);
          
          await client.query(`
            CREATE TABLE IF NOT EXISTS clients (
              client_id VARCHAR(255) PRIMARY KEY,
              session_id VARCHAR(255) NOT NULL,
              client_name VARCHAR(255) NOT NULL,
              created_at TIMESTAMP NOT NULL,
              last_activity TIMESTAMP NOT NULL,
              CONSTRAINT fk_session FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            )
          `);
          
          await client.query(`
            CREATE TABLE IF NOT EXISTS session_tokens (
              client_id VARCHAR(255) PRIMARY KEY,
              token VARCHAR(255) NOT NULL,
              created_at TIMESTAMP NOT NULL,
              CONSTRAINT fk_client FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE CASCADE
            )
          `);
          
          // Update schema version
          await client.query(`
            INSERT INTO schema_version (version) VALUES (1)
          `);
          
          currentVersion = 1;
        }
        
        // Future migrations can be added here
        // if (currentVersion < 2) { ... }
        
        await client.query('COMMIT');
        console.log('[PostgreSQL] Schema initialization complete');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('[PostgreSQL] Error during schema migration:', error);
        throw error;
      }
      
      this.initialized = true;
      
      // Load existing sessions from database
      await this.loadAllSessionsFromDatabase();
    } finally {
      client.release();
    }
  }
  
  /**
   * Loads all sessions from the database into memory
   */
  private async loadAllSessionsFromDatabase(): Promise<void> {
    try {
      console.log('[PostgreSQL] Loading existing sessions from database...');
      
      const client = await this.pool.connect();
      try {
        // Get all sessions
        const sessionsResult = await client.query(`
          SELECT session_id, created_at, last_activity, fingerprint_iv, fingerprint_data
          FROM sessions
        `);
        
        // Load each session
        for (const row of sessionsResult.rows) {
          const sessionId = row.session_id;
          
          // Create session auth
          this.sessionAuth.set(sessionId, {
            fingerprint: {
              iv: Array.from(row.fingerprint_iv),
              data: Array.from(row.fingerprint_data)
            },
            createdAt: row.created_at,
            lastActivity: row.last_activity
          });
          
          // Create session
          const session = new Session(sessionId);
          this.sessions.set(sessionId, session);
          
          // Get clients for this session
          const clientsResult = await client.query(`
            SELECT c.client_id, c.client_name, c.created_at, c.last_activity, st.token
            FROM clients c
            LEFT JOIN session_tokens st ON c.client_id = st.client_id
            WHERE c.session_id = $1
          `, [sessionId]);
          
          // Add clients to session
          for (const clientRow of clientsResult.rows) {
            // Store token
            if (clientRow.token) {
              this.sessionTokens.set(clientRow.client_id, clientRow.token);
            }
          }
        }
        
        console.log(`[PostgreSQL] Loaded ${sessionsResult.rows.length} sessions from database`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[PostgreSQL] Error loading sessions from database:', error);
    }
  }
  
  /**
   * Loads a session from the database
   * @param sessionId Session ID
   */
  private async loadSessionFromDatabase(sessionId: string): Promise<boolean> {
    try {
      console.log(`[PostgreSQL] Loading session ${sessionId} from database...`);
      
      const client = await this.pool.connect();
      try {
        // Get session
        const sessionResult = await client.query(`
          SELECT created_at, last_activity, fingerprint_iv, fingerprint_data
          FROM sessions
          WHERE session_id = $1
        `, [sessionId]);
        
        if (sessionResult.rows.length === 0) {
          console.log(`[PostgreSQL] Session ${sessionId} not found in database`);
          return false;
        }
        
        const row = sessionResult.rows[0];
        
        // Create session auth
        this.sessionAuth.set(sessionId, {
          fingerprint: {
            iv: Array.from(row.fingerprint_iv),
            data: Array.from(row.fingerprint_data)
          },
          createdAt: row.created_at,
          lastActivity: row.last_activity
        });
        
        // Create session
        const session = new Session(sessionId);
        this.sessions.set(sessionId, session);
        
        // Get clients for this session
        const clientsResult = await client.query(`
          SELECT c.client_id, c.client_name, c.created_at, c.last_activity, st.token
          FROM clients c
          LEFT JOIN session_tokens st ON c.client_id = st.client_id
          WHERE c.session_id = $1
        `, [sessionId]);
        
        // Add clients to session
        for (const clientRow of clientsResult.rows) {
          // Store token
          if (clientRow.token) {
            this.sessionTokens.set(clientRow.client_id, clientRow.token);
          }
        }
        
        console.log(`[PostgreSQL] Successfully loaded session ${sessionId} from database`);
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[PostgreSQL] Error loading session ${sessionId} from database:`, error);
      return false;
    }
  }
  
  /**
   * Saves a session to the database
   * @param sessionId Session ID
   * @param fingerprint Passphrase fingerprint
   * @param clientId Client ID
   * @param clientName Client name
   * @param token Session token
   */
  private async saveSessionToDatabase(
    sessionId: string,
    fingerprint: PassphraseFingerprint,
    clientId: string,
    clientName: string,
    token: string
  ): Promise<void> {
    try {
      console.log(`[PostgreSQL] Saving session ${sessionId} to database...`);
      
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        
        try {
          // Get session auth
          const auth = this.sessionAuth.get(sessionId);
          if (!auth) {
            throw new Error(`Session ${sessionId} not found in memory`);
          }
          
          // Convert fingerprint to Buffer for PostgreSQL
          const fingerprintIv = Buffer.from(fingerprint.iv);
          const fingerprintData = Buffer.from(fingerprint.data);
          
          // Upsert session
          await client.query(`
            INSERT INTO sessions (session_id, created_at, last_activity, fingerprint_iv, fingerprint_data)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id) DO UPDATE SET
              last_activity = $3,
              fingerprint_iv = $4,
              fingerprint_data = $5
          `, [
            sessionId,
            auth.createdAt,
            auth.lastActivity,
            fingerprintIv,
            fingerprintData
          ]);
          
          // Upsert client
          await client.query(`
            INSERT INTO clients (client_id, session_id, client_name, created_at, last_activity)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (client_id) DO UPDATE SET
              session_id = $2,
              client_name = $3,
              last_activity = $5
          `, [
            clientId,
            sessionId,
            clientName,
            new Date(),
            new Date()
          ]);
          
          // Upsert token
          await client.query(`
            INSERT INTO session_tokens (client_id, token, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (client_id) DO UPDATE SET
              token = $2,
              created_at = $3
          `, [
            clientId,
            token,
            new Date()
          ]);
          
          await client.query('COMMIT');
          console.log(`[PostgreSQL] Successfully saved session ${sessionId} to database`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[PostgreSQL] Error saving session ${sessionId} to database:`, error);
    }
  }
  
  /**
   * Removes a session from the database
   * @param sessionId Session ID
   */
  private async removeSessionFromDatabase(sessionId: string): Promise<void> {
    try {
      console.log(`[PostgreSQL] Removing session ${sessionId} from database...`);
      
      const client = await this.pool.connect();
      try {
        // Delete session (will cascade to clients and tokens)
        await client.query(`
          DELETE FROM sessions
          WHERE session_id = $1
        `, [sessionId]);
        
        console.log(`[PostgreSQL] Successfully removed session ${sessionId} from database`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[PostgreSQL] Error removing session ${sessionId} from database:`, error);
    }
  }
  
  /**
   * Removes a client from the database
   * @param clientId Client ID
   */
  private async removeClientFromDatabase(clientId: string): Promise<void> {
    try {
      console.log(`[PostgreSQL] Removing client ${clientId} from database...`);
      
      const client = await this.pool.connect();
      try {
        // Delete client (will cascade to tokens)
        await client.query(`
          DELETE FROM clients
          WHERE client_id = $1
        `, [clientId]);
        
        console.log(`[PostgreSQL] Successfully removed client ${clientId} from database`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[PostgreSQL] Error removing client ${clientId} from database:`, error);
    }
  }
  
  /**
   * Updates a session's last activity timestamp in the database
   * @param sessionId Session ID
   * @param lastActivity Last activity timestamp
   */
  private async updateSessionLastActivityInDatabase(sessionId: string, lastActivity: Date): Promise<void> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          UPDATE sessions
          SET last_activity = $2
          WHERE session_id = $1
        `, [sessionId, lastActivity]);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[PostgreSQL] Error updating session ${sessionId} last activity in database:`, error);
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
  override async joinSession(
    sessionId: string,
    fingerprint: PassphraseFingerprint,
    clientId: string,
    clientName: string,
    socket: Socket
  ): Promise<SessionJoinResult> {
    console.log(`[PostgreSQL] Attempting to join session: ${sessionId}`);
    
    // First check if session exists in memory
    if (this.sessionAuth.has(sessionId)) {
      // Session exists in memory, use parent implementation
      const result = await super.joinSession(sessionId, fingerprint, clientId, clientName, socket);
      
      // If successful, save to database
      if (result.success && result.token) {
        await this.saveSessionToDatabase(sessionId, fingerprint, clientId, clientName, result.token);
      }
      
      return result;
    }
    
    // Session doesn't exist in memory, check database
    const sessionExists = await this.loadSessionFromDatabase(sessionId);
    
    if (sessionExists) {
      // Session loaded from database, now it's in memory
      // Use parent implementation
      const result = await super.joinSession(sessionId, fingerprint, clientId, clientName, socket);
      
      // If successful, update database
      if (result.success && result.token) {
        await this.saveSessionToDatabase(sessionId, fingerprint, clientId, clientName, result.token);
      }
      
      return result;
    }
    
    // Session doesn't exist anywhere, create it using parent implementation
    const result = await super.joinSession(sessionId, fingerprint, clientId, clientName, socket);
    
    // If successful, save to database
    if (result.success && result.token) {
      await this.saveSessionToDatabase(sessionId, fingerprint, clientId, clientName, result.token);
    }
    
    return result;
  }
  
  /**
   * Removes a client from a session
   * @param sessionId Session ID
   * @param clientId Client ID
   * @returns Whether the client was removed
   */
  override removeClientFromSession(sessionId: string, clientId: string): boolean {
    // Use parent implementation
    const result = super.removeClientFromSession(sessionId, clientId);
    
    // If successful, remove from database
    if (result) {
      this.removeClientFromDatabase(clientId).catch((err: Error) => {
        console.error(`[PostgreSQL] Error removing client ${clientId} from database:`, err);
      });
      
      // If session still exists, update last activity
      const auth = this.sessionAuth.get(sessionId);
      if (auth) {
        this.updateSessionLastActivityInDatabase(sessionId, auth.lastActivity).catch((err: Error) => {
          console.error(`[PostgreSQL] Error updating session ${sessionId} last activity in database:`, err);
        });
      } else {
        // Session was removed, remove from database
        this.removeSessionFromDatabase(sessionId).catch((err: Error) => {
          console.error(`[PostgreSQL] Error removing session ${sessionId} from database:`, err);
        });
      }
    }
    
    return result;
  }
  
  /**
   * Cleans up expired sessions
   */
  protected override cleanupExpiredSessions(): void {
    // Get expired session IDs before cleanup
    const now = new Date();
    const expiredSessionIds: string[] = [];
    
    for (const [sessionId, auth] of this.sessionAuth.entries()) {
      const elapsed = now.getTime() - auth.lastActivity.getTime();
      if (elapsed > this.sessionTimeout) {
        expiredSessionIds.push(sessionId);
      }
    }
    
    // Use parent implementation for in-memory cleanup
    super.cleanupExpiredSessions();
    
    // Remove expired sessions from database
    for (const sessionId of expiredSessionIds) {
      this.removeSessionFromDatabase(sessionId).catch((err: Error) => {
        console.error(`[PostgreSQL] Error removing expired session ${sessionId} from database:`, err);
      });
    }
  }
}