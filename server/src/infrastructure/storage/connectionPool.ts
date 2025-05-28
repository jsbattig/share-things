import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * A simple connection pool for SQLite databases
 */
export class ConnectionPool {
  private connections: Database[] = [];
  private inUse: Set<Database> = new Set();
  private dbPath: string;
  private maxConnections: number;
  private initialized = false;

  constructor(dbPath: string, maxConnections = 10) {
    this.dbPath = dbPath;
    this.maxConnections = maxConnections;
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directory if it doesn't exist
    await mkdir(dirname(this.dbPath), { recursive: true });

    // Create initial connections
    for (let i = 0; i < Math.min(5, this.maxConnections); i++) {
      const db = await this.createConnection();
      this.connections.push(db);
    }

    this.initialized = true;
    console.log(`[ConnectionPool] Initialized with ${this.connections.length} connections`);
  }

  /**
   * Create a new database connection
   */
  private async createConnection(): Promise<Database> {
    const db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    // Enable foreign key constraints
    await db.exec('PRAGMA foreign_keys = ON');
    
    // Set journal mode to WAL for better concurrency
    await db.exec('PRAGMA journal_mode = WAL');
    
    // Set busy timeout to avoid SQLITE_BUSY errors
    await db.exec('PRAGMA busy_timeout = 5000');

    return db;
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<Database> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Find an available connection
    for (const connection of this.connections) {
      if (!this.inUse.has(connection)) {
        this.inUse.add(connection);
        return connection;
      }
    }

    // If no connections are available and we haven't reached the max, create a new one
    if (this.connections.length < this.maxConnections) {
      const newConnection = await this.createConnection();
      this.connections.push(newConnection);
      this.inUse.add(newConnection);
      console.log(`[ConnectionPool] Created new connection (total: ${this.connections.length})`);
      return newConnection;
    }

    // If we've reached the max, wait for a connection to become available
    console.log(`[ConnectionPool] Waiting for an available connection...`);
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const connection of this.connections) {
          if (!this.inUse.has(connection)) {
            clearInterval(checkInterval);
            this.inUse.add(connection);
            resolve(connection);
            return;
          }
        }
      }, 100);
    });
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(connection: Database): void {
    this.inUse.delete(connection);
  }

  /**
   * Execute a function with a connection and automatically release it
   */
  async withConnection<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    try {
      return await callback(connection);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a function within a transaction and automatically release the connection
   */
  async withTransaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    return this.withConnection(async (db) => {
      await db.exec('BEGIN TRANSACTION');
      try {
        const result = await callback(db);
        await db.exec('COMMIT');
        return result;
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    for (const connection of this.connections) {
      await connection.close();
    }
    this.connections = [];
    this.inUse.clear();
    this.initialized = false;
    console.log(`[ConnectionPool] All connections closed`);
  }
}

// Singleton instance
let connectionPool: ConnectionPool | null = null;

/**
 * Get the connection pool instance
 */
export function getConnectionPool(dbPath: string, maxConnections = 10): ConnectionPool {
  if (!connectionPool) {
    connectionPool = new ConnectionPool(dbPath, maxConnections);
  }
  return connectionPool;
}

/**
 * Close the connection pool
 */
export async function closeConnectionPool(): Promise<void> {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
  }
}