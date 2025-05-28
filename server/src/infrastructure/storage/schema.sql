-- SQLite schema for chunk storage

-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Content metadata table
CREATE TABLE IF NOT EXISTS content_metadata (
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

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_content_session ON content_metadata(session_id);
CREATE INDEX IF NOT EXISTS idx_content_created ON content_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_content_last_accessed ON content_metadata(last_accessed);

-- Chunk metadata table
CREATE TABLE IF NOT EXISTS chunk_metadata (
  content_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (content_id, chunk_index),
  FOREIGN KEY (content_id) REFERENCES content_metadata(content_id) ON DELETE CASCADE
);

-- Session tracking
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  metadata TEXT
);

-- Create triggers for last_accessed updates
CREATE TRIGGER IF NOT EXISTS update_content_last_accessed
AFTER INSERT ON chunk_metadata
BEGIN
  UPDATE content_metadata 
  SET last_accessed = (strftime('%s', 'now') * 1000)
  WHERE content_id = NEW.content_id;
END;

-- Create trigger to update session last_active
CREATE TRIGGER IF NOT EXISTS update_session_last_active
AFTER INSERT ON chunk_metadata
BEGIN
  UPDATE sessions 
  SET last_active = (strftime('%s', 'now') * 1000)
  WHERE session_id = (
    SELECT session_id 
    FROM content_metadata 
    WHERE content_id = NEW.content_id
  );
END;
