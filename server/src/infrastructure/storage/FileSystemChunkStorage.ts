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
  isPinned?: number;
  isLargeFile?: number;
}

export interface FileSystemChunkStorageOptions {
  storagePath?: string;
}

export class FileSystemChunkStorage implements IChunkStorage {
  private storagePath: string;
  private db: Database | null = null;
  private isInitialized = false;
  private sharedDb?: Database; // For sharing database instances in tests

  constructor(options: FileSystemChunkStorageOptions = {}, sharedDb?: Database) {
    this.storagePath = options.storagePath || './data/sessions';
    this.sharedDb = sharedDb;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure storage directory exists
    await fs.mkdir(this.storagePath, { recursive: true });

    // Use shared database if provided (for tests), otherwise create new one
    if (this.sharedDb) {
      this.db = this.sharedDb;
      console.log('[DEBUG] Using shared database instance');
    } else {
      // Initialize simple SQLite database
      // Use in-memory database for tests to avoid file system conflicts
      const isTest = process.env.NODE_ENV === 'test';
      const dbPath = isTest ? ':memory:' : path.join(this.storagePath, 'metadata.db');
      
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });
      console.log(`[DEBUG] Created new database instance at: ${isTest ? ':memory:' : dbPath}`);
    }

    // Always ensure schema is created, even for shared databases
    console.log('[DEBUG] Ensuring database schema is created');

    // Configure database for immediate commits
    await this.db.exec('PRAGMA journal_mode = WAL');
    await this.db.exec('PRAGMA synchronous = NORMAL');
    await this.db.exec('PRAGMA cache_size = 1000');
    await this.db.exec('PRAGMA temp_store = memory');

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
    } catch (error: unknown) {
      // Column already exists or other error - this is expected for new databases
    }

    // Add migration for is_pinned column if it doesn't exist
    try {
      await this.db.run('ALTER TABLE content ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0');
      
      // Add index for pinned content queries
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_content_pinned ON content(is_pinned, created_at)');
      
      // Add is_large_file column
      await this.db.run('ALTER TABLE content ADD COLUMN is_large_file BOOLEAN NOT NULL DEFAULT 0');
      
      // Add index for large file queries
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_content_large_file ON content(is_large_file)');
    } catch (error: unknown) {
      // Column already exists or other error - this is expected for new databases
    }

    this.isInitialized = true;
  }

  async saveChunk(chunk: Uint8Array, metadata: Omit<ChunkMetadata, 'timestamp'>): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const { contentId, sessionId, chunkIndex, iv } = metadata;
    console.log(`[DEBUG] saveChunk called for contentId: ${contentId}, sessionId: ${sessionId}, chunkIndex: ${chunkIndex}`);

    // Create content directory: ./data/sessions/{sessionId}/{contentId}/
    const contentDir = path.join(this.storagePath, sessionId, contentId);
    console.log(`[DEBUG] Creating content directory: ${contentDir}`);
    await fs.mkdir(contentDir, { recursive: true });

    // Write chunk directly to disk: {chunkIndex}.bin
    const chunkPath = path.join(contentDir, `${chunkIndex}.bin`);
    console.log(`[DEBUG] Writing chunk to: ${chunkPath}`);
    await fs.writeFile(chunkPath, chunk);

    // Store chunk IV for retrieval
    console.log(`[DEBUG] About to insert chunk metadata. Database initialized: ${this.isInitialized}, DB exists: ${!!this.db}`);
    
    // First, let's check if the chunks table exists and its schema
    try {
      const tableInfo = await this.db.all("PRAGMA table_info(chunks)");
      console.log(`[DEBUG] Chunks table schema:`, tableInfo);
      
      // If table doesn't exist, create it
      if (tableInfo.length === 0) {
        console.log(`[DEBUG] Chunks table doesn't exist, creating it...`);
        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS chunks (
            content_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            encryption_iv BLOB NOT NULL,
            PRIMARY KEY (content_id, chunk_index)
          );
        `);
        console.log(`[DEBUG] Chunks table created successfully`);
      }
    } catch (error) {
      console.log(`[DEBUG] Error checking/creating chunks table:`, error);
    }
    
    const insertResult = await this.db.run(
      `INSERT OR REPLACE INTO chunks (content_id, chunk_index, encryption_iv) VALUES (?, ?, ?)`,
      contentId,
      chunkIndex,
      Buffer.from(iv)
    );
    console.log(`[DEBUG] Stored chunk metadata in database for ${contentId}, chunk ${chunkIndex}. Insert result:`, insertResult);
    
    // Verify the insert worked by immediately querying
    const verifyResult = await this.db.get(
      'SELECT COUNT(*) as count FROM chunks WHERE content_id = ?',
      contentId
    );
    console.log(`[DEBUG] Immediate verification query for ${contentId}:`, verifyResult);

  }

  async saveContent(metadata: ContentMetadata): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    console.log(`[DEBUG] saveContent called for contentId: ${metadata.contentId}, sessionId: ${metadata.sessionId}`);
    
    // First, let's check if the content table exists and its schema
    try {
      const tableInfo = await this.db.all("PRAGMA table_info(content)");
      console.log(`[DEBUG] Content table schema:`, tableInfo);
      
      // If table doesn't exist, create it
      if (tableInfo.length === 0) {
        console.log(`[DEBUG] Content table doesn't exist, creating it...`);
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
            additional_metadata TEXT,
            is_pinned BOOLEAN NOT NULL DEFAULT 0,
            is_large_file BOOLEAN NOT NULL DEFAULT 0
          );
          
          CREATE INDEX IF NOT EXISTS idx_content_session ON content(session_id);
          CREATE INDEX IF NOT EXISTS idx_content_created ON content(created_at);
          CREATE INDEX IF NOT EXISTS idx_content_pinned ON content(is_pinned, created_at);
          CREATE INDEX IF NOT EXISTS idx_content_large_file ON content(is_large_file);
        `);
        console.log(`[DEBUG] Content table created successfully`);
      }
    } catch (error) {
      console.log(`[DEBUG] Error checking/creating content table:`, error);
    }
    
    // Insert content metadata into database
    const result = await this.db.run(
      `INSERT OR REPLACE INTO content
       (id, session_id, content_type, mime_type, total_chunks, total_size, created_at, encryption_iv, additional_metadata, is_large_file, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      metadata.contentId,
      metadata.sessionId,
      metadata.contentType,
      null, // mimeType - will be extracted from additionalMetadata if needed
      metadata.totalChunks,
      metadata.totalSize,
      metadata.createdAt,
      Buffer.from(metadata.encryptionIv),
      metadata.additionalMetadata,
      metadata.isLargeFile ? 1 : 0,
      metadata.isPinned ? 1 : 0 // Include is_pinned field
    );
    
    console.log(`[DEBUG] saveContent result for ${metadata.contentId}:`, result);
    
    // Verify the insert worked by immediately querying
    const verifyResult = await this.db.get(
      'SELECT COUNT(*) as count FROM content WHERE id = ?',
      metadata.contentId
    );
    console.log(`[DEBUG] Immediate verification query for content ${metadata.contentId}:`, verifyResult);
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

    console.log('[FileSystemChunkStorage] listContent called for sessionId:', sessionId);

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
         additional_metadata,
         is_pinned as isPinned,
         is_large_file as isLargeFile
       FROM content
       WHERE session_id = ?
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT ?`,
      sessionId,
      limit
    );

    console.log('[FileSystemChunkStorage] Raw database rows:', JSON.stringify(rows, null, 2));

    const mappedResults = rows.map(row => {
      console.log('[FileSystemChunkStorage] Processing row:', {
        contentId: row.contentId,
        contentType: row.contentType,
        rawRow: row
      });
      
      const mapped = {
        contentId: row.contentId,
        sessionId: row.sessionId,
        contentType: row.contentType,
        totalChunks: row.totalChunks,
        totalSize: row.totalSize || 0,
        createdAt: row.createdAt,
        isComplete: true,
        encryptionIv: row.encryptionIv ? new Uint8Array(row.encryptionIv) : new Uint8Array(12),
        additionalMetadata: row.additional_metadata || (row.mime_type ? JSON.stringify({ mimeType: row.mime_type }) : null),
        isPinned: Boolean(row.isPinned),
        isLargeFile: Boolean(row.isLargeFile || false)
      };
      
      console.log('[FileSystemChunkStorage] Mapped result:', mapped);
      return mapped;
    });

    console.log('[FileSystemChunkStorage] Final mapped results:', mappedResults);
    return mappedResults;
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

  async renameContent(contentId: string, newName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    try {
      // Get current metadata
      const currentRow = await this.db.get<{ additional_metadata: string | null }>(
        'SELECT additional_metadata FROM content WHERE id = ?',
        contentId
      );

      if (!currentRow) {
        return { success: false, error: 'Content not found' };
      }

      // Parse current metadata or create new one
      let metadata: Record<string, unknown> = {};
      if (currentRow.additional_metadata) {
        try {
          metadata = JSON.parse(currentRow.additional_metadata);
        } catch {
          // If JSON parsing fails, start with empty metadata
          metadata = {};
        }
      }

      // Update filename in metadata
      metadata.fileName = newName;

      // Save updated metadata
      await this.db.run(
        'UPDATE content SET additional_metadata = ? WHERE id = ?',
        JSON.stringify(metadata),
        contentId
      );

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during rename' 
      };
    }
  }

  async fixLargeFileMetadata(): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }


    // Find all large files with null additional_metadata
    const largeFiles = await this.db.all<Array<{
      id: string;
      content_type: string;
      total_size: number;
      mime_type: string | null;
      additional_metadata: string | null;
    }>>(
      `SELECT id, content_type, total_size, mime_type, additional_metadata
       FROM content
       WHERE is_large_file = 1 AND additional_metadata IS NULL`
    );


    for (const file of largeFiles) {
      // Create basic metadata for large files
      const basicMetadata = {
        size: file.total_size,
        mimeType: file.mime_type || 'application/octet-stream',
        // For existing files, we can't recover the original filename
        // but we can provide a reasonable default
        fileName: `LargeFile-${file.id.substring(0, 8)}.bin`
      };

      await this.db.run(
        'UPDATE content SET additional_metadata = ? WHERE id = ?',
        JSON.stringify(basicMetadata),
        file.id
      );

    }

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

    console.log(`[DEBUG] getReceivedChunkCount called for contentId: ${contentId}`);

    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM chunks WHERE content_id = ?',
      contentId
    );

    console.log(`[DEBUG] Chunk count query result for ${contentId}:`, result);
    const count = result?.count || 0;
    console.log(`[DEBUG] Final chunk count for ${contentId}: ${count}`);

    return count;
  }

  async markContentComplete(contentId: string, contentType?: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    console.log(`[DEBUG] markContentComplete called for contentId: ${contentId}, contentType: ${contentType}`);
    
    // Check if database record already exists
    const existingRecord = await this.db.get<{ id: string }>(
      'SELECT id FROM content WHERE id = ?',
      contentId
    );
    
    console.log(`[DEBUG] Existing record check for ${contentId}:`, existingRecord);
    
    if (existingRecord && existingRecord.id) {
      console.log(`[DEBUG] Content ${contentId} already exists in database, skipping`);
      return;
    }
    
    console.log(`[DEBUG] No existing record found, proceeding to create content record for ${contentId}`);
    
    // Get chunk information to reconstruct metadata
    const chunkCount = await this.getReceivedChunkCount(contentId);
    console.log(`[DEBUG] Chunk count for ${contentId}: ${chunkCount}`);
    
    if (chunkCount === 0) {
      console.log(`[DEBUG] No chunks found for ${contentId}, skipping`);
      return;
    }
    
    // Calculate total size from actual chunks
    const actualSize = await this.calculateActualContentSize(contentId);
    console.log(`[DEBUG] Calculated size for ${contentId}: ${actualSize}`);
    
    // Get first chunk to extract encryption IV
    const firstChunkMetadata = await this.getChunkMetadata(contentId, 0);
    const encryptionIv = firstChunkMetadata?.iv || new Uint8Array(12);
    console.log(`[DEBUG] Encryption IV for ${contentId}:`, encryptionIv);
    
    // Determine session ID from file path
    let sessionId = 'unknown';
    console.log(`[DEBUG] Starting sessionId detection for ${contentId}, storagePath: ${this.storagePath}`);
    
    // Search for the content directory to find session ID
    // The structure is: {storagePath}/{sessionId}/{contentId}/
    try {
      const sessionDirs = await fs.readdir(this.storagePath, { withFileTypes: true });
      console.log(`[DEBUG] Found directories in storage:`, sessionDirs.map(d => d.name));
      
      for (const sessionDir of sessionDirs) {
        if (!sessionDir.isDirectory() || sessionDir.name === 'metadata.db' || sessionDir.name === 'chunks') {
          console.log(`[DEBUG] Skipping non-session directory: ${sessionDir.name}`);
          continue;
        }
        
        const contentPath = path.join(this.storagePath, sessionDir.name, contentId);
        console.log(`[DEBUG] Checking content path: ${contentPath}`);
        
        try {
          await fs.access(contentPath);
          sessionId = sessionDir.name;
          console.log(`[DEBUG] Found content in session: ${sessionId}`);
          break;
        } catch {
          console.log(`[DEBUG] Content not found in session: ${sessionDir.name}`);
          // Content not in this session, continue
        }
      }
    } catch (error) {
      console.log(`[DEBUG] Error during sessionId detection:`, error);
      // Could not determine session ID, use 'unknown'
    }
    
    console.log(`[DEBUG] Final detected sessionId for ${contentId}: ${sessionId}`);
    
    // Create basic metadata for orphaned content
    const basicMetadata = {
      fileName: 'File', // Default filename since we can't determine original
      mimeType: 'application/octet-stream',
      size: actualSize
    };
    
    // Create database record with reconstructed metadata
    await this.db.run(
      `INSERT INTO content
       (id, session_id, content_type, mime_type, total_chunks, total_size, created_at, encryption_iv, additional_metadata, is_large_file, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      contentId,
      sessionId,
      contentType || 'file',
      null,
      chunkCount,
      actualSize,
      Date.now(),
      Buffer.from(encryptionIv),
      JSON.stringify(basicMetadata),
      actualSize > 50 * 1024 * 1024 ? 1 : 0, // Mark as large file if > 50MB
      0 // Not pinned
    );
    
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
         mime_type,
         is_pinned as isPinned,
         is_large_file as isLargeFile
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
      additionalMetadata: row.mime_type ? JSON.stringify({ mimeType: row.mime_type }) : null,
      isPinned: Boolean(row.isPinned),
      isLargeFile: Boolean(row.isLargeFile || false)
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
       WHERE session_id = ? AND is_pinned = 0
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

  async pinContent(contentId: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    await this.db.run(
      'UPDATE content SET is_pinned = 1 WHERE id = ?',
      contentId
    );
  }

  async unpinContent(contentId: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    await this.db.run(
      'UPDATE content SET is_pinned = 0 WHERE id = ?',
      contentId
    );
  }

  async getPinnedContentCount(sessionId: string): Promise<number> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM content WHERE session_id = ? AND is_pinned = 1',
      sessionId
    );

    return result?.count || 0;
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

  async streamContentForDownload(
    contentId: string,
    onChunk: (chunk: Uint8Array, metadata: ChunkMetadata) => Promise<void>
  ): Promise<void> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    // Get content metadata first
    const contentMeta = await this.getContentMetadata(contentId);
    if (!contentMeta) {
      throw new Error('Content not found');
    }


    // Check file integrity before streaming
    let missingChunks = 0;
    for (let i = 0; i < contentMeta.totalChunks; i++) {
      const chunk = await this.getChunk(contentId, i);
      const chunkMeta = await this.getChunkMetadata(contentId, i);
      
      if (!chunk || !chunkMeta) {
        missingChunks++;
      }
    }
    
    if (missingChunks > 0) {
      throw new Error(`File is corrupted: ${missingChunks} of ${contentMeta.totalChunks} chunks are missing. Please re-upload the file.`);
    }

    // Stream complete file
    for (let i = 0; i < contentMeta.totalChunks; i++) {
      const chunk = await this.getChunk(contentId, i);
      const chunkMeta = await this.getChunkMetadata(contentId, i);
      
      // These should exist since we validated above, but add safety checks
      if (!chunk || !chunkMeta) {
        throw new Error(`Chunk ${i} unexpectedly missing during streaming`);
      }
      
      const metadata: ChunkMetadata = {
        contentId,
        sessionId: contentMeta.sessionId,
        chunkIndex: i,
        totalChunks: contentMeta.totalChunks,
        size: chunk.length,
        iv: chunkMeta.iv,
        contentType: contentMeta.contentType,
        timestamp: contentMeta.createdAt
      };
      
      await onChunk(chunk, metadata);
    }
    
  }

  async calculateActualContentSize(contentId: string): Promise<number> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    // First try to get metadata from database if it exists
    const contentMeta = await this.getContentMetadata(contentId);
    if (contentMeta) {
      let totalSize = 0;
      for (let i = 0; i < contentMeta.totalChunks; i++) {
        const chunk = await this.getChunk(contentId, i);
        if (chunk) {
          totalSize += chunk.length;
        }
      }
      return totalSize;
    }

    // If no database record exists yet, calculate from available chunks
    // This is needed during markContentComplete() when creating the initial record
    const chunkCount = await this.getReceivedChunkCount(contentId);
    let totalSize = 0;
    
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await this.getChunk(contentId, i);
      if (chunk) {
        totalSize += chunk.length;
      }
    }

    return totalSize;
  }

  async isLargeFile(contentId: string): Promise<boolean> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Storage not initialized');
    }

    const metadata = await this.getContentMetadata(contentId);
    return metadata ? metadata.isLargeFile : false;
  }

  async close(): Promise<void> {
    if (this.db && !this.sharedDb) {
      // Only close the database if it's not a shared instance
      await this.db.close();
      this.db = null;
    } else if (this.sharedDb) {
      // For shared databases, just clear the reference
      this.db = null;
    }
    this.isInitialized = false;
  }
}
