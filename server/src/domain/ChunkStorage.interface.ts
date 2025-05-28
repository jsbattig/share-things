/**
 * Represents metadata for a single chunk of content
 */
export interface ChunkMetadata {
  /**
   * Unique identifier for the content this chunk belongs to
   */
  contentId: string;

  /**
   * Session identifier this chunk belongs to
   */
  sessionId: string;

  /**
   * Zero-based index of this chunk
   */
  chunkIndex: number;

  /**
   * Total number of chunks for this content
   */
  totalChunks: number;

  /**
   * Size of this chunk in bytes
   */
  size: number;

  /**
   * Initialization vector used for encryption
   */
  iv: Uint8Array;

  /**
   * Content type/MIME type of the content
   */
  contentType?: string;

  /**
   * MIME type of the content
   */
  mimeType?: string;

  /**
   * Timestamp when this chunk was created
   */
  timestamp: number;
}

/**
 * Represents metadata for a complete piece of content
 */
export interface ContentMetadata {
  /**
   * Unique identifier for this content
   */
  contentId: string;

  /**
   * Session identifier this content belongs to
   */
  sessionId: string;

  /**
   * MIME type of the content
   */
  contentType: string;

  /**
   * Total number of chunks for this content
   */
  totalChunks: number;

  /**
   * Total size of the content in bytes
   */
  totalSize: number;

  /**
   * Timestamp when this content was created
   */
  createdAt: number;

  /**
   * Initialization vector used for encryption
   */
  encryptionIv: Uint8Array;

  /**
   * Additional metadata in JSON format
   */
  additionalMetadata: string | null;

  /**
   * Whether all chunks for this content have been received
   */
  isComplete: boolean;
}

/**
 * Interface for storing and retrieving chunks of content
 */
export interface IChunkStorage {
  /**
   * Initialize the storage
   */
  initialize(): Promise<void>;

  /**
   * Save a chunk of content
   * @param chunk The chunk data to save
   * @param metadata Metadata about the chunk
   */
  saveChunk(chunk: Uint8Array, metadata: Omit<ChunkMetadata, 'timestamp'>): Promise<void>;

  /**
   * Retrieve a chunk of content
   * @param contentId ID of the content
   * @param chunkIndex Index of the chunk to retrieve
   * @returns The chunk data or null if not found
   */
  getChunk(contentId: string, chunkIndex: number): Promise<Uint8Array | null>;

  /**
   * List all content for a session
   * @param sessionId ID of the session
   * @param limit Maximum number of items to return
   * @returns Array of content metadata
   */
  listContent(sessionId: string, limit?: number): Promise<ContentMetadata[]>;

  /**
   * Mark content as complete
   * @param contentId ID of the content
   */
  markContentComplete(contentId: string): Promise<void>;

  /**
   * Get metadata for a specific content
   * @param contentId ID of the content
   * @returns Content metadata or null if not found
   */
  getContentMetadata(contentId: string): Promise<ContentMetadata | null>;

  /**
   * Get metadata for a specific chunk
   * @param contentId ID of the content
   * @param chunkIndex Index of the chunk
   * @returns Chunk metadata or null if not found
   */
  getChunkMetadata(contentId: string, chunkIndex: number): Promise<{ iv: Uint8Array } | null>;

  /**
   * Clean up old content to maintain storage limits
   * @param sessionId ID of the session
   * @param maxItems Maximum number of items to keep
   * @returns List of removed content IDs
   */
  cleanupOldContent(sessionId: string, maxItems: number): Promise<{ removed: string[] }>;

  /**
   * Clean up all content for a session
   * @param sessionId ID of the session
   * @returns List of removed content IDs
   */
  cleanupAllSessionContent(sessionId: string): Promise<{ removed: string[] }>;

  /**
   * Remove a specific content item
   * @param contentId ID of the content to remove
   * @returns Success status and details
   */
  removeContent(contentId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Close the storage and release resources
   */
  close(): Promise<void>;
}
