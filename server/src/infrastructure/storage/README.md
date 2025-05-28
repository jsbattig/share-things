# FileSystemChunkStorage

A persistent chunk storage implementation that stores chunks on the filesystem and metadata in SQLite.

## Features

- Stores chunk data on disk for efficient memory usage
- Maintains metadata in SQLite for fast lookups
- Supports concurrent access with proper locking
- Automatic cleanup of old content
- Configurable storage limits
- Transactional operations for data consistency

## Configuration

Configure the storage using environment variables or by passing options to the constructor:

```typescript
const storage = new FileSystemChunkStorage({
  storagePath: './data/sessions',  // Base directory for storage
  maxItemsPerSession: 20,          // Maximum items to keep per session
  cleanupIntervalMs: 3600000        // Cleanup interval in milliseconds
});
```

### Environment Variables

- `CHUNK_STORAGE_PATH`: Base path for storing chunks (default: `./data/sessions`)
- `MAX_ITEMS_PER_SESSION`: Maximum number of items to keep per session (default: `20`)
- `MAX_ITEMS_TO_SEND`: Maximum number of items to send to newly connected clients (default: `5`)
- `CLEANUP_INTERVAL`: Cleanup interval in milliseconds (default: `3600000` - 1 hour)

## Usage

```typescript
import { FileSystemChunkStorage } from './infrastructure/storage';

// Initialize storage
const storage = new FileSystemChunkStorage();
await storage.initialize();

try {
  // Save a chunk
  await storage.saveChunk(chunkData, {
    contentId: 'unique-content-id',
    sessionId: 'user-session-id',
    chunkIndex: 0,
    totalChunks: 1,
    size: chunkData.length,
    iv: encryptionIv
  });
  
  // Mark content as complete
  await storage.markContentComplete('unique-content-id');
  
  // Retrieve a chunk
  const data = await storage.getChunk('unique-content-id', 0);
  
  // List content for a session
  const contentList = await storage.listContent('user-session-id');
  
  // Get content metadata
  const metadata = await storage.getContentMetadata('unique-content-id');
  
} finally {
  // Clean up
  await storage.close();
}
```

## Database Schema

The storage uses SQLite with the following schema:

### content_metadata

- `content_id` TEXT PRIMARY KEY
- `session_id` TEXT NOT NULL
- `content_type` TEXT NOT NULL
- `total_chunks` INTEGER NOT NULL
- `total_size` INTEGER NOT NULL
- `created_at` INTEGER NOT NULL
- `encryption_iv` BLOB NOT NULL
- `additional_metadata` TEXT
- `is_complete` BOOLEAN NOT NULL DEFAULT 0
- `last_accessed` INTEGER NOT NULL

### chunk_metadata

- `content_id` TEXT NOT NULL
- `chunk_index` INTEGER NOT NULL
- `size` INTEGER NOT NULL
- `created_at` INTEGER NOT NULL
- PRIMARY KEY (`content_id`, `chunk_index`)
- FOREIGN KEY (`content_id`) REFERENCES `content_metadata`(`content_id`) ON DELETE CASCADE

### sessions

- `session_id` TEXT PRIMARY KEY
- `created_at` INTEGER NOT NULL
- `last_active` INTEGER NOT NULL
- `metadata` TEXT

## File Structure

Chunks are stored in the following directory structure:

```
<storagePath>/
  metadata.db         # SQLite database
  chunks/
    <contentId>/      # Hex-encoded content ID
      0.bin          # Chunk 0
      1.bin          # Chunk 1
      ...
```

## Error Handling

All methods throw errors if the storage is not initialized or if an error occurs during the operation. The error messages are descriptive and include the underlying error when available.

## Testing

Run the tests with:

```bash
npm test
```

## License

MIT
