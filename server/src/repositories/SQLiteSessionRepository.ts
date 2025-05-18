import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { SessionRepository, SessionAuthRecord } from './SessionRepository';
import { PassphraseFingerprint } from '../services/SessionManager';
import { promisify } from 'util';

/**
 * SQLite implementation of SessionRepository
 */
export class SQLiteSessionRepository implements SessionRepository {
  private db: sqlite3.Database | null = null;
  private initialized: boolean = false;
  
  /**
   * Creates a new SQLite session repository
   * @param dbPath Path to SQLite database file
   */
  constructor(private dbPath: string) {}
  
  /**
   * Initializes the repository
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Open database connection
      this.db = new sqlite3.Database(this.dbPath);
      
      // Run migrations
      await this.migrateSchema();
      
      this.initialized = true;
      console.log(`SQLite session repository initialized at ${this.dbPath}`);
    } catch (error: any) {
      console.error('Failed to initialize SQLite repository:', error);
      throw new Error(`Database initialization failed: ${error.message || String(error)}`);
    }
  }
  
  /**
   * Migrates the database schema
   */
  private async migrateSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const run = promisify(this.db.run.bind(this.db));
    
    try {
      // Create schema_version table
      await run(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);
      
      // Check current version
      const getCurrentVersion = (): Promise<number> => {
        return new Promise((resolve, reject) => {
          if (!this.db) return reject(new Error('Database not initialized'));
          
          this.db.get('SELECT MAX(version) as version FROM schema_version', (err, row: any) => {
            if (err) return reject(err);
            resolve(row?.version || 0);
          });
        });
      };
      
      const currentVersion = await getCurrentVersion();
      console.log(`Current database schema version: ${currentVersion}`);
      
      // Apply migrations if needed
      if (currentVersion < 1) {
        console.log('Applying migration 1: Initial schema with sessions table');
        
        // Create sessions table
        await run(`
          CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            fingerprint_iv BLOB NOT NULL,
            fingerprint_data BLOB NOT NULL,
            created_at TEXT NOT NULL,
            last_activity TEXT NOT NULL
          )
        `);
        
        // Create index
        await run(`
          CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity)
        `);
        
        // Update schema version
        await run(
          `INSERT INTO schema_version (version, description, applied_at)
           VALUES (1, 'Initial schema with sessions table', '${new Date().toISOString()}')`
        );
        
        console.log('Migration 1 applied successfully');
      } else {
        console.log('Database schema is up to date');
      }
    } catch (error: any) {
      console.error('Error migrating schema:', error);
      throw new Error(`Schema migration failed: ${error.message || String(error)}`);
    }
  }
  
  /**
   * Ensures the repository is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('SQLite repository not initialized');
    }
  }
  
  /**
   * Finds a session by ID
   * @param sessionId Session ID
   * @returns Session auth record or null if not found
   */
  async findById(sessionId: string): Promise<SessionAuthRecord | null> {
    this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      this.db.get(
        'SELECT * FROM sessions WHERE session_id = ?',
        [sessionId],
        (err, row: any) => {
          if (err) {
            console.error(`Error finding session ${sessionId}:`, err);
            return reject(new Error(`Error finding session ${sessionId}: ${err.message}`));
          }
          
          if (!row) return resolve(null);
          
          resolve({
            sessionId: row.session_id,
            fingerprint: {
              iv: Array.from(row.fingerprint_iv) as number[],
              data: Array.from(row.fingerprint_data) as number[]
            },
            createdAt: new Date(row.created_at),
            lastActivity: new Date(row.last_activity)
          });
        }
      );
    });
  }
  
  /**
   * Saves a new session
   * @param session Session auth record
   */
  async save(session: SessionAuthRecord): Promise<void> {
    this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      this.db.run(
        `INSERT INTO sessions
         (session_id, fingerprint_iv, fingerprint_data, created_at, last_activity)
         VALUES (?, ?, ?, ?, ?)`,
        [
          session.sessionId,
          Buffer.from(new Uint8Array(session.fingerprint.iv)),
          Buffer.from(new Uint8Array(session.fingerprint.data)),
          session.createdAt.toISOString(),
          session.lastActivity.toISOString()
        ],
        (err) => {
          if (err) {
            console.error(`Error saving session ${session.sessionId}:`, err);
            return reject(new Error(`Error saving session ${session.sessionId}: ${err.message}`));
          }
          
          resolve();
        }
      );
    });
  }
  
  /**
   * Updates an existing session
   * @param session Session auth record
   */
  async update(session: SessionAuthRecord): Promise<void> {
    this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      this.db.run(
        `UPDATE sessions
         SET fingerprint_iv = ?,
             fingerprint_data = ?,
             last_activity = ?
         WHERE session_id = ?`,
        [
          Buffer.from(new Uint8Array(session.fingerprint.iv)),
          Buffer.from(new Uint8Array(session.fingerprint.data)),
          session.lastActivity.toISOString(),
          session.sessionId
        ],
        (err) => {
          if (err) {
            console.error(`Error updating session ${session.sessionId}:`, err);
            return reject(new Error(`Error updating session ${session.sessionId}: ${err.message}`));
          }
          
          resolve();
        }
      );
    });
  }
  
  /**
   * Deletes a session
   * @param sessionId Session ID
   */
  async delete(sessionId: string): Promise<void> {
    this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      this.db.run(
        'DELETE FROM sessions WHERE session_id = ?',
        [sessionId],
        (err) => {
          if (err) {
            console.error(`Error deleting session ${sessionId}:`, err);
            return reject(new Error(`Error deleting session ${sessionId}: ${err.message}`));
          }
          
          resolve();
        }
      );
    });
  }
  
  /**
   * Finds all sessions
   * @returns Array of session auth records
   */
  async findAll(): Promise<SessionAuthRecord[]> {
    this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      this.db.all(
        'SELECT * FROM sessions',
        (err, rows: any[]) => {
          if (err) {
            console.error('Error finding all sessions:', err);
            return reject(new Error(`Error finding all sessions: ${err.message}`));
          }
          
          const sessions = rows.map(row => ({
            sessionId: row.session_id,
            fingerprint: {
              iv: Array.from(row.fingerprint_iv) as number[],
              data: Array.from(row.fingerprint_data) as number[]
            },
            createdAt: new Date(row.created_at),
            lastActivity: new Date(row.last_activity)
          }));
          
          resolve(sessions);
        }
      );
    });
  }
  
  /**
   * Finds expired sessions
   * @param expiryTime Expiry time in milliseconds
   * @returns Array of expired session IDs
   */
  async findExpired(expiryTime: number): Promise<string[]> {
    this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const cutoffTime = new Date(Date.now() - expiryTime).toISOString();
      
      this.db.all(
        'SELECT session_id FROM sessions WHERE last_activity < ?',
        [cutoffTime],
        (err, rows: any[]) => {
          if (err) {
            console.error('Error finding expired sessions:', err);
            return reject(new Error(`Error finding expired sessions: ${err.message}`));
          }
          
          resolve(rows.map(row => row.session_id));
        }
      );
    });
  }
  
  /**
   * Closes the repository
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
          return reject(new Error(`Error closing database: ${err.message}`));
        }
        
        this.db = null;
        this.initialized = false;
        resolve();
      });
    });
  }
}