# FileSystemChunkStorage Implementation

## Overview
`FileSystemChunkStorage` is a robust storage solution designed to handle binary data chunks with associated metadata. It combines **hierarchical filesystem storage** for chunk data with a **SQLite database** for metadata management, ensuring efficient storage, retrieval, and cleanup operations. The implementation provides **persistent storage for encrypted content chunks** while maintaining **session-based organization** and **automatic cleanup capabilities**.

## Key Features

- **Hybrid Storage Architecture**: SQLite metadata + filesystem binary storage
- **Session-Based Organization**: Content organized by session and content ID
- **Automatic Cleanup**: Configurable retention policies with database-driven cleanup
- **Content Integrity**: Hash-based verification and content-addressable storage
- **Atomic Operations**: Database transactions ensure data consistency
- **Schema Migrations**: Versioned database schema with automatic upgrades

## Architecture

### Components

1. **Chunk Storage**
   - Stores binary chunk data in the file system
   - Uses a content-addressable storage pattern
   - Implements a two-level directory structure for better performance

2. **Metadata Management**
   - SQLite database for fast metadata lookups
   - Tracks chunk references, sizes, and access patterns
   - Supports efficient querying and cleanup operations

3. **Session Management**
   - Groups related chunks by session
   - Enables session-based cleanup and expiration
   - Tracks last access time for LRU-based eviction

### Data Flow

```
+----------------+     +------------------+     +----------------+
|  Save Chunk    | --> |  Store in FS    | --> | Update DB     |
|  (API Call)    |     |  (Content Hash) |     |  Metadata     |
+----------------+     +------------------+     +----------------+
        ^                                                |
        |                                                v
        |                                       +------------------+
        +---------------------------------------|  Return Result  |
                                                +------------------+
```

## Implementation Details

### File System Storage

#### Directory Structure
```
data/
├── sessions.db                    # Session authentication database (separate)
└── sessions/                      # Chunk storage root
    └── {sessionId}/               # Session-specific directory
        └── {contentId}/           # Content-specific directory
            ├── 0.bin              # Chunk 0 binary data
            ├── 1.bin              # Chunk 1 binary data
            ├── 2.bin              # Chunk 2 binary data
            └── metadata.db        # Content metadata database
```

#### Storage Organization
- **Session-based partitioning**: Each session gets its own directory
- **Content-based grouping**: All chunks for a content item stored together
- **Simple chunk naming**: Sequential numbering (0.bin, 1.bin, etc.)
- **Metadata co-location**: SQLite database alongside chunk files
- **Hierarchical cleanup**: Session deletion removes all associated content

#### Chunk Naming
- Format: `{chunkIndex}.bin`
- Simple sequential numbering starting from 0
- Binary file extension for clarity
- No content ID in filename (directory provides context)

### Database Schema

#### Tables

1. **content** (Content Metadata)
   ```sql
   CREATE TABLE content (
     id TEXT PRIMARY KEY,                    -- Content ID
     session_id TEXT NOT NULL,              -- Session identifier
     content_type TEXT NOT NULL,            -- MIME/content type
     mime_type TEXT,                        -- Specific MIME type
     total_chunks INTEGER NOT NULL,         -- Total number of chunks
     total_size INTEGER,                    -- Total content size in bytes
     created_at INTEGER NOT NULL,           -- Creation timestamp
     encryption_iv BLOB                     -- Encryption initialization vector
   );
   ```

2. **chunks** (Chunk Metadata)
   ```sql
   CREATE TABLE chunks (
     content_id TEXT NOT NULL,              -- Reference to content
     chunk_index INTEGER NOT NULL,          -- Chunk sequence number
     encryption_iv BLOB NOT NULL,           -- Per-chunk encryption IV
     PRIMARY KEY (content_id, chunk_index)  -- Composite primary key
   );
   ```

#### Indexes
```sql
CREATE INDEX idx_content_session ON content(session_id);
CREATE INDEX idx_content_created ON content(created_at);
```

#### Key Features
- **Simplified Schema**: Focus on essential metadata only
- **Encryption Support**: IV storage for encrypted chunks
- **Session Organization**: Easy querying by session
- **Composite Keys**: Efficient chunk lookups
- **No File Paths**: Filesystem location derived from IDs

### Key Methods

#### `saveChunk(chunk: Uint8Array, metadata: ChunkMetadata): Promise<void>`
1. Generates content hash
2. Stores chunk in file system
3. Updates database with metadata
4. Handles transactions for data consistency

#### `getChunk(contentId: string, index: number): Promise<Uint8Array | null>`
1. Looks up chunk metadata in database
2. Validates chunk existence
3. Reads chunk data from file system
4. Updates last accessed timestamp

#### `cleanupOldContent(sessionId: string, maxItems: number): Promise<string[]>`
1. Identifies least recently used content
2. Removes chunks exceeding maxItems limit
3. Cleans up orphaned files
4. Returns list of removed content IDs

### Error Handling
- File system operations are wrapped in try-catch blocks
- Database operations use transactions for atomicity
- Failed operations trigger cleanup of partial data
- Detailed error messages for debugging

## Testing Strategy

### Unit Tests
- Mocked file system and database
- Tests for individual methods
- Error condition testing
- Boundary condition testing

### Integration Tests
- Real file system operations
- Database interactions
- End-to-end chunk lifecycle

### Performance Testing
- Large file handling
- Concurrent access
- Cleanup operations

## Configuration

### Environment Variables
- `STORAGE_PATH`: Base directory for chunk storage
- `MAX_ITEMS_PER_SESSION`: Maximum chunks per session
- `CLEANUP_INTERVAL_MS`: Cleanup job frequency

### Dependencies
- Node.js v16+
- SQLite3
- TypeScript
- Jest (testing)

## Performance Considerations

### Optimizations
- Two-level directory structure for files
- Batch database operations
- Lazy loading of chunk data
- Efficient cleanup queries

### Monitoring
- File system usage
- Database performance
- Memory usage
- Cleanup job metrics

## Security Considerations

### Data Protection
- Content-addressable storage for deduplication
- Hash verification for data integrity
- Secure file permissions

### Access Control
- Session-based access
- Input validation
- Path traversal prevention

## Future Enhancements

### Planned Features
- Compression of chunk data
- Encryption at rest
- Distributed storage backend
- Replication for high availability

### Scalability
- Sharding by content ID
- Read replicas for metadata
- Distributed file storage

## Maintenance

### Backup Strategy
- Regular database backups
- File system snapshots
- Point-in-time recovery

### Monitoring
- Disk space alerts
- Performance metrics
- Error rate tracking
