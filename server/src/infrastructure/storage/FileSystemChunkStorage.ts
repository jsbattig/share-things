import { promises as fs } from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

import { IChunkStorage, ChunkMetadata, ContentMetadata } from '../../domain/ChunkStorage.interface';

interface ContentRow {
  contentId: string;
  sessionId: string;
  contentType: string;
  totalChunks: number;
  totalSize: number;
  createdAt: number;
  encryptionIv: Buffer;
  mime_type: string | null;
  additional_metadata?: string | null;
  additionalMetadata?: string | null;
  isComplete?: number;
}

export interface FileSystemChunkStorageOptions {
  storagePath?: string;
}

export class FileSystemChunkStorage implements IChunkStorage {
  private storagePath: string;
  private db: Database | null = null;
  private isInitialized = false;

  constructor(options: FileSystemChunkStorageOptions = {}) {
    this.storagePath = options.storagePath || './data/sessions';
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure storage directory exists
    await fs.mkdir(this.storagePath, { recursive: true });

    // Initialize simple SQLite database
    const dbPath = path.join(this.storagePath, 'metadata.db');
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Create simple content metadata table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        mime_type TEXT,
        total_chunks INTEGER NOT NULL,
        total_size INTEGER,
        created_at INTEGER NOT NULL,
        encryption_iv BLOB,
        additional_metadata TEXT
      );
      
      CREATE TABLE IF NOT EXISTS chunks (
        content_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        encryption_iv BLOB NOT NULL,
        PRIMARY KEY (content_id, chunk_index)
      );
      
      CREATE INDEX IF NOT EXISTS idx_content_session ON content(session_id);
      CREATE INDEX IF NOT EXISTS idx_content_created ON content(created_at);
    `);

    // Add migration for additional_metadata column if it doesn't exist
    try {
      await this.db.run('ALTER TABLE content ADD COLUMN additional_metadata TEXT');
      console.log('[DEBUG] Added additional_metadata column to content table');
    } catch (error: unknown) {
      // Column already exists or other error - this is expected for new databases
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('duplicate column name')) {
        console.log('[DEBUG] additional_metadata column already exists or other migration issue:', errorMessage);
      }
    }

    this.isInitialized = true;
  }

  async saveChunk(chunk: Uint8Array, metadata: Omit<ChunkMetadata, 'timestamp'>): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const { contentId, sessionId, chunkIndex, totalChunks, contentType, mimeType, size, iv } = metadata;

    // Create content directory: ./data/sessions/{sessionId}/{contentId}/
    const contentDir = path.join(this.storagePath, sessionId, contentId);
    await fs.mkdir(contentDir, { recursive: true });

    // Write chunk directly to disk: {chunkIndex}.bin
    const chunkPath = path.join(contentDir, `${chunkIndex}.bin`);
    await fs.writeFile(chunkPath, chunk);

    // Store chunk IV for retrieval
    await this.db.run(
      `INSERT OR REPLACE INTO chunks (content_id, chunk_index, encryption_iv) VALUES (?, ?, ?)`,
      contentId,
      chunkIndex,
      Buffer.from(iv)
    );

    // Store content metadata when all chunks are received
    if (chunkIndex === totalChunks - 1) {
      await this.db.run(
        `INSERT OR REPLACE INTO content
         (id, session_id, content_type, mime_type, total_chunks, total_size, created_at, encryption_iv, additional_metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        contentId,
        sessionId,
        contentType || 'unknown',
        mimeType,
        totalChunks,
        size,
        Date.now(),
        Buffer.from(iv),
        null // Will be updated when we have the full metadata
      );
    }
  }

  async getChunk(contentId: string, chunkIndex: number): Promise<Uint8Array | null> {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    // First try the old WindSurge format for backward compatibility
    const oldChunkPath = path.join(this.storagePath, 'chunks', contentId, `${chunkIndex}.bin`);
    try {
      const data = await fs.readFile(oldChunkPath);
      return data;
    } catch (error) {
      // Old format not found, try new format
    }

    // Find content directory by scanning sessions (new format)
    const sessionDirs = await fs.readdir(this.storagePath, { withFileTypes: true });
    
    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory() || sessionDir.name === 'metadata.db' || sessionDir.name === 'chunks') continue;
      
      const contentPath = path.join(this.storagePath, sessionDir.name, contentId);
      const chunkPath = path.join(contentPath, `${chunkIndex}.bin`);
      
      try {
        const data = await fs.readFile(chunkPath);
        return data;
      } catch (error) {
        // Continue searching in other sessions
        continue;
      }
    }

    return null;
  }

  async listContent(sessionId: string, limit = 50): Promise<ContentMetadata[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const rows = await this.db.all<ContentRow[]>(
      `SELECT
         id as contentId,
         session_id as sessionId,
         content_type as contentType,
         total_chunks as totalChunks,
         total_size as totalSize,
         created_at as createdAt,
         encryption_iv as encryptionIv,
         mime_type,
         additional_metadata
       FROM content
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      sessionId,
      limit
    );

    return rows.map(row => ({
      contentId: row.contentId,
      sessionId: row.sessionId,
      contentType: row.contentType,
      totalChunks: row.totalChunks,
      totalSize: row.totalSize || 0,
      createdAt: row.createdAt,
      isComplete: true,
      encryptionIv: row.encryptionIv ? new Uint8Array(row.encryptionIv) : new Uint8Array(12),
      additionalMetadata: row.additional_metadata || (row.mime_type ? JSON.stringify({ mimeType: row.mime_type }) : null)
    }));
  }

  async updateContentMetadata(contentId: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    await this.db.run(
      'UPDATE content SET additional_metadata = ? WHERE id = ?',
      JSON.stringify(metadata),
      contentId
    );
  }

  async deleteContent(contentId: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    // Remove from database
    await this.db.run('DELETE FROM content WHERE id = ?', contentId);

    // Remove files from disk
    const sessionDirs = await fs.readdir(this.storagePath, { withFileTypes: true });
    
    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory() || sessionDir.name === 'metadata.db') continue;
      
      const contentPath = path.join(this.storagePath, sessionDir.name, contentId);
      
      try {
        await fs.rm(contentPath, { recursive: true, force: true });
      } catch (error) {
        // Content might not exist in this session, continue
      }
    }
  }

  async getReceivedChunkCount(contentId: string): Promise<number> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM chunks WHERE content_id = ?',
      contentId
    );

    return result?.count || 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async markContentComplete(_contentId: string): Promise<void> {
    // Content is automatically marked complete when last chunk is saved
    // This method exists for interface compatibility
  }

  async getContentMetadata(contentId: string): Promise<ContentMetadata | null> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const row = await this.db.get<ContentRow>(
      `SELECT
         id as contentId,
         session_id as sessionId,
         content_type as contentType,
         total_chunks as totalChunks,
         total_size as totalSize,
         created_at as createdAt,
         encryption_iv as encryptionIv,
         mime_type
       FROM content
       WHERE id = ?`,
      contentId
    );

    if (!row) return null;

    return {
      contentId: row.contentId,
      sessionId: row.sessionId,
      contentType: row.contentType,
      totalChunks: row.totalChunks,
      totalSize: row.totalSize || 0,
      createdAt: row.createdAt,
      isComplete: true,
      encryptionIv: row.encryptionIv ? new Uint8Array(row.encryptionIv) : new Uint8Array(12),
      additionalMetadata: row.mime_type ? JSON.stringify({ mimeType: row.mime_type }) : null
    };
  }

  async getChunkMetadata(contentId: string, chunkIndex: number): Promise<{ iv: Uint8Array } | null> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const row = await this.db.get<{ encryption_iv: Buffer }>(
      'SELECT encryption_iv FROM chunks WHERE content_id = ? AND chunk_index = ?',
      contentId,
      chunkIndex
    );

    if (!row) return null;

    return {
      iv: new Uint8Array(row.encryption_iv)
    };
  }

  async cleanupOldContent(sessionId: string, maxItems: number): Promise<{ removed: string[] }> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const oldContent = await this.db.all<{ id: string }[]>(
      `SELECT id FROM content
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT -1 OFFSET ?`,
      sessionId,
      maxItems
    );

    const removed: string[] = [];
    for (const content of oldContent) {
      await this.deleteContent(content.id);
      removed.push(content.id);
    }

    return { removed };
  }

  async cleanupAllSessionContent(sessionId: string): Promise<{ removed: string[] }> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const allContent = await this.db.all<{ id: string }[]>(
      'SELECT id FROM content WHERE session_id = ?',
      sessionId
    );

    const removed: string[] = [];
    for (const content of allContent) {
      await this.deleteContent(content.id);
      removed.push(content.id);
    }

    return { removed };
  }

  async removeContent(contentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.deleteContent(contentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async cleanup(): Promise<void> {
    // Simple cleanup - remove old content (older than 7 days)
    if (!this.isInitialized || !this.db) return;

    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const oldContent = await this.db.all<{ id: string, session_id: string }[]>(
      'SELECT id, session_id FROM content WHERE created_at < ?',
      sevenDaysAgo
    );

    for (const content of oldContent) {
      await this.deleteContent(content.id);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }
}
