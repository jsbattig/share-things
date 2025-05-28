# ShareThings System Architecture (Updated)

## Overview

ShareThings is a real-time content sharing application with end-to-end encryption and persistent server-side storage. The system consists of:

1. React frontend with Chakra UI
2. Express backend with Socket.IO
3. HAProxy for SSL termination
4. **SQLite databases for persistent storage**
5. **Filesystem-based chunk storage**

The application allows multiple clients to connect to the same session and share content among each other. All content is encrypted client-side before transmission, ensuring the server never has access to unencrypted data. **The server now provides persistent storage for encrypted chunks and session state, enabling session recovery and content persistence across server restarts.**

## Architecture Diagram

```mermaid
graph TD
    subgraph "Client A"
        A1[React UI] --> A2[Socket.IO Client]
        A1 --> A3[Web Crypto API]
        A1 --> A4[Web Workers]
        A3 <--> A4
        A4 --> A2
    end
    
    subgraph "Client B"
        B1[React UI] --> B2[Socket.IO Client]
        B1 --> B3[Web Crypto API]
        B1 --> B4[Web Workers]
        B3 <--> B4
        B4 --> B2
    end
    
    subgraph "Server Infrastructure"
        subgraph "HAProxy"
            H1[SSL Termination]
            H2[WebSocket Proxy]
        end
        
        subgraph "Application Server"
            S1[Express] --> S2[Socket.IO Server]
            S2 --> S3[Session Manager]
            S3 --> S4[Message Router]
            S3 --> S5[SQLite Session Repository]
            S4 --> S6[FileSystem Chunk Storage]
        end
        
        subgraph "Persistent Storage Layer"
            DB1[(Sessions SQLite DB)]
            DB2[(Chunks Metadata SQLite DB)]
            FS[Filesystem Chunk Storage<br/>./data/sessions/{sessionId}/{contentId}/]
        end
    end
    
    Client1[Client Browser] <--> |HTTPS/WSS| H1
    Client2[Client Browser] <--> |HTTPS/WSS| H1
    H2 <--> |HTTP/WS| S1
    S5 <--> DB1
    S6 <--> DB2
    S6 <--> FS
```

## Key Components

### Frontend Components

1. **Session Management**
   - Session creation and joining
   - Client identification
   - Passphrase handling and fingerprinting
   - Token-based authentication

2. **Content Handling**
   - Unified content model for text, images, and files
   - Content type detection and metadata extraction
   - Content visualization based on type

3. **Encryption/Decryption**
   - Web Crypto API for encryption operations
   - Web Workers for non-blocking processing
   - Passphrase-based key derivation

4. **Real-time Communication**
   - Socket.IO client for WebSocket communication
   - Reconnection handling
   - Event-based messaging

### Backend Components

1. **Session Management**
   - Session creation and tracking with persistent storage
   - Client registration and identification
   - Passphrase fingerprint verification and storage
   - Token-based authentication
   - Session expiration and cleanup with database persistence
   - **SQLite-based session repository for state persistence**

2. **Persistent Storage Infrastructure**
   - **DatabaseManager**: SQLite connection management and schema migrations
   - **SQLiteSessionRepository**: Persistent session state and authentication data
   - **FileSystemChunkStorage**: Hybrid storage combining SQLite metadata with filesystem binary storage
   - **Storage Configuration**: Environment-based configuration for database paths and storage locations

3. **Content Storage and Retrieval**
   - **Chunk Storage Interface**: Standardized API for content storage operations
   - **Content Metadata Management**: SQLite-based tracking of content lifecycle
   - **Filesystem Organization**: Hierarchical storage structure for binary chunk data
   - **Cleanup and Retention**: Database-driven cleanup with configurable retention policies

4. **Message Routing**
   - Content and chunk forwarding with storage integration
   - Broadcast to session participants
   - Message sequencing and persistence
   - **Content synchronization for session recovery**

5. **WebSocket Handling**
   - Socket.IO server for WebSocket communication
   - Connection management with session persistence
   - Proxy-aware configuration
   - **Automatic session recovery and content synchronization**

## Enhanced Session Management with Persistent Storage

ShareThings implements a secure session management system with persistent SQLite storage:

1. **Passphrase Fingerprinting with Persistent Storage**
   - Client creates a fingerprint from the passphrase using self-encryption
   - Fingerprint allows verification without exposing the passphrase
   - **Server stores fingerprints persistently in SQLite database**
   - **Session authentication data survives server restarts**

2. **Token-based Authentication**
   - Server issues session tokens after successful authentication
   - Tokens are required for content-related operations
   - Middleware validates tokens for each request
   - **Session tokens are managed in-memory for performance**

3. **Persistent Session State**
   - **SQLiteSessionRepository manages session persistence**
   - **Database schema includes session metadata, creation time, and last activity**
   - **Automatic database migrations for schema updates**
   - **Session recovery capability after server restarts**

4. **Session Expiration and Cleanup**
   - Sessions expire after a period of inactivity (default: 10 minutes)
   - **Database-driven expiration queries for efficient cleanup**
   - **Cascading cleanup of related content when sessions expire**
   - Configurable timeout via environment variables
   - **Persistent tracking of last activity timestamps**

## Data Flow with Persistent Storage

1. **Session Establishment with Persistence**
   - Client creates or joins a session with a name, client name, and passphrase
   - Client creates a passphrase fingerprint using self-encryption
   - **Server checks SQLite database for existing session**
   - **If session exists, verifies fingerprint against stored data**
   - **If new session, creates database record with fingerprint**
   - Server issues a session token (stored in-memory)
   - Client stores the token for future requests
   - **Session state persists across server restarts**

2. **Content Sharing with Storage**
   - Client captures content (clipboard, file, etc.)
   - Content is analyzed and metadata extracted
   - Content is chunked if necessary
   - Each chunk is encrypted with a key derived from the passphrase
   - Encrypted chunks are sent to the server with the session token
   - **Server validates token and stores chunks using FileSystemChunkStorage**
   - **Chunk metadata stored in SQLite database**
   - **Binary chunk data stored in filesystem hierarchy**
   - **Server forwards chunks to other clients AND persists for future retrieval**
   - Receiving clients decrypt and reassemble content
   - Content is displayed based on its type
   - **Content remains available for session recovery**

3. **Session Recovery and Content Synchronization**
   - **When clients rejoin existing sessions, server can provide stored content**
   - **Database queries retrieve content metadata for session**
   - **Filesystem provides binary chunk data for reconstruction**
   - **Automatic cleanup of old content based on retention policies**

4. **Session Termination with Cleanup**
   - Client disconnects from session
   - Server removes client from room
   - Server notifies other clients of departure
   - **Updates last activity timestamp in database**
   - If no clients remain, session remains in database for potential recovery
   - **Expired sessions are cleaned up via database queries**
   - **Cascading cleanup removes associated content and chunks**

## Storage Architecture

### Database Schema Design

**Sessions Database (`sessions.db`)**
```sql
-- Session authentication and state
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  fingerprint_iv BLOB NOT NULL,
  fingerprint_data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  last_activity TEXT NOT NULL
);
```

**Chunks Metadata Database (`metadata.db`)**
```sql
-- Content metadata tracking
CREATE TABLE content_metadata (
  content_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  total_chunks INTEGER NOT NULL,
  total_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  encryption_iv BLOB NOT NULL,
  additional_metadata TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT 0,
  last_accessed INTEGER NOT NULL
);

-- Individual chunk metadata
CREATE TABLE chunk_metadata (
  content_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (content_id, chunk_index),
  FOREIGN KEY (content_id) REFERENCES content_metadata(content_id) ON DELETE CASCADE
);
```

### Filesystem Organization

```
data/
├── sessions.db                    # Session authentication database
└── sessions/                      # Chunk storage root
    └── {sessionId}/               # Session-specific directory
        └── {contentId}/           # Content-specific directory
            ├── 0.bin              # Chunk 0 binary data
            ├── 1.bin              # Chunk 1 binary data
            └── metadata.db        # Content metadata database
```

### Storage Features

- **Hybrid Storage**: SQLite for metadata + filesystem for binary data
- **Content-Addressable**: Efficient deduplication and integrity verification
- **Hierarchical Organization**: Session and content-based directory structure
- **Atomic Operations**: Database transactions ensure consistency
- **Automatic Cleanup**: Configurable retention policies with cascading deletes
- **Schema Migrations**: Versioned database schema with automatic upgrades
## Security Architecture

- **End-to-end Encryption**: All content is encrypted client-side before transmission
- **Client-side Passphrase**: The encryption passphrase never leaves the client
- **Passphrase Fingerprinting**: Allows verification without exposing the passphrase using self-encryption
- **Token-based Authentication**: Secure session tokens for request authorization
- **No Server Access**: The server cannot decrypt any content, even when stored persistently
- **Secure Key Derivation**: PBKDF2 is used to derive keys from passphrases
- **Unique IVs**: Each encrypted message uses a unique initialization vector
- **Session Expiration**: Inactive sessions are automatically expired with database cleanup
- **Encrypted Storage**: Server stores only encrypted chunks and cannot access plaintext content
- **Database Security**: Session fingerprints use self-encryption for secure verification
- **Secure File Permissions**: Filesystem storage uses appropriate access controls
- **Data Integrity**: Content-addressable storage ensures chunk integrity verification

## Deployment Architecture

- **HAProxy**: Handles SSL termination and WebSocket proxying
- **Node.js Application Server**: Runs the Express and Socket.IO server with persistent storage
- **SQLite Databases**: Session authentication and chunk metadata storage
- **Filesystem Storage**: Hierarchical binary chunk storage with configurable paths
- **Static File Serving**: Serves the React frontend
- **WebSocket Configuration**: Properly configured for long-lived connections with session recovery
- **Storage Configuration**: Environment-based database and storage path configuration
- **Database Migrations**: Automatic schema upgrades on server startup

## Scalability Considerations

- **Sticky Sessions**: Ensure clients maintain connection to the same server for in-memory token management
- **Memory Management**: Efficient handling of large content transfers with persistent storage offloading
- **Worker Processes**: Multiple Node.js processes for handling load with shared database access
- **Load Balancing**: HAProxy can distribute load across multiple application servers
- **Database Scaling**: SQLite provides good performance for moderate loads; can migrate to PostgreSQL for high-scale deployments
- **Storage Partitioning**: Filesystem storage can be partitioned by session or date for better performance
- **Cleanup Optimization**: Background cleanup processes prevent storage bloat
- **Connection Pooling**: Database connection pooling for efficient resource utilization
- **Content Deduplication**: Content-addressable storage reduces storage requirements