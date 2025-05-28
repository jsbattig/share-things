import { Database, open } from 'sqlite';

import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

// Use path.resolve() since we're not using ES modules
import path from 'path';

type QueryParams = (string | number | Uint8Array | null)[];

export class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    // Create directory if it doesn't exist
    await mkdir(dirname(this.dbPath), { recursive: true });

    this.db = await open({
      filename: this.dbPath,
      driver: (await import('sqlite3')).Database
    });

    // Enable foreign key constraints
    await this.db.exec('PRAGMA foreign_keys = ON');

    // Load and execute schema
    try {
      const schemaPath = path.resolve(__dirname, 'schema.sql');
      console.log(`[DEBUG] Loading schema from: ${schemaPath}`);
      const schema = await readFile(schemaPath, 'utf-8');
      
      // Execute the schema as a single statement
      await this.db.exec(schema);
      console.log(`[DEBUG] Schema executed successfully`);
    } catch (error) {
      console.error(`Error executing schema: ${error}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  async get<T = unknown>(query: string, params: QueryParams = []): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.get<T>(query, ...params);
  }

  async all<T = unknown>(query: string, params: QueryParams = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.all<T[]>(query, ...params);
  }

  async run(query: string, params: QueryParams = []): Promise<{ lastID?: number; changes: number }> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.run(query, ...params);
    return {
      lastID: result.lastID,
      changes: result.changes || 0
    };
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.exec('BEGIN TRANSACTION');
    try {
      const result = await callback();
      await this.db.exec('COMMIT');
      return result;
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getDatabase(): Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  async vacuum(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.exec('VACUUM');
  }
}

// Singleton instance
let dbManager: DatabaseManager | null = null;

export function getDatabaseManager(dbPath: string): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager(dbPath);
  }
  return dbManager;
}

export async function closeDatabase(): Promise<void> {
  if (dbManager) {
    await dbManager.close();
    dbManager = null;
  }
}
