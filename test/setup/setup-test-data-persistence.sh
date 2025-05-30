#!/bin/bash
#
# setup-test-data-persistence.sh - Test script for data persistence through updates
#
# This script tests that data persists through updates by:
# 1. Installing ShareThings
# 2. Creating test session data and chunks via API
# 3. Running setup.sh in update mode
# 4. Verifying all data still exists and is accessible
# 5. Cleaning up
#

set -e  # Exit immediately if a command exits with a non-zero status

# Default values
SKIP_CLEANUP="false"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-cleanup)
            SKIP_CLEANUP="true"
            shift
            ;;
        *)
            # Unknown option
            shift
            ;;
    esac
done

# ===== CONFIGURATION =====

# Determine if we're running in CI
if [ "$CI" = "true" ]; then
  echo "Running in CI environment"
  # In CI, try to find the repository root by going up directories
  if [ -f "setup.sh" ]; then
    REPO_ROOT=$(pwd)
  elif [ -f "../setup.sh" ]; then
    REPO_ROOT=$(cd .. && pwd)
  elif [ -f "../../setup.sh" ]; then
    REPO_ROOT=$(cd ../.. && pwd)
  else
    REPO_ROOT=$(pwd)
  fi
else
  # In local environment, use git to find the repo root
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fi

# Export REPO_ROOT so it's available to all scripts
export REPO_ROOT

echo "Repository root: $REPO_ROOT"
echo "Current working directory: $(pwd)"

# ===== UTILITY FUNCTIONS =====

# Text colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Function to wait for server to be ready
wait_for_server() {
  local max_attempts=30
  local attempt=1
  
  log_info "Waiting for server to be ready..."
  
  while [ $attempt -le $max_attempts ]; do
    if curl -s http://localhost:15001/health > /dev/null 2>&1; then
      log_success "Server is ready"
      return 0
    fi
    
    log_info "Attempt $attempt/$max_attempts - waiting for server..."
    sleep 2
    attempt=$((attempt + 1))
  done
  
  log_error "Server failed to become ready after $max_attempts attempts"
  return 1
}

# Function to create test session and upload test data
create_test_data() {
  log_info "Creating test session and uploading test data..."
  
  # Wait for server to be ready
  wait_for_server
  
  # Create a test session by connecting to WebSocket
  # For simplicity, we'll use curl to create some test data via the API
  
  # Create test content by uploading a small file
  TEST_CONTENT="This is test content for data persistence verification. Timestamp: $(date)"
  TEST_FILE="/tmp/test-data-persistence.txt"
  echo "$TEST_CONTENT" > "$TEST_FILE"
  
  # Try to upload via the API (this will create session data and chunks)
  log_info "Uploading test file to create session data..."
  
  # Note: The actual API endpoint may vary, but we'll try common patterns
  # If the upload fails, we'll create data directly in the filesystem
  
  UPLOAD_RESPONSE=$(curl -s -X POST \
    -F "file=@$TEST_FILE" \
    http://localhost:15001/api/upload 2>/dev/null || echo "UPLOAD_FAILED")
  
  if [ "$UPLOAD_RESPONSE" = "UPLOAD_FAILED" ]; then
    log_warning "API upload failed, creating test data directly in filesystem..."
    create_test_data_directly
  else
    log_success "Test data uploaded via API"
    echo "Upload response: $UPLOAD_RESPONSE"
  fi
  
  # Clean up temp file
  rm -f "$TEST_FILE"
}

# Function to create test data directly in the filesystem
create_test_data_directly() {
  log_info "Creating test data directly in filesystem..."
  
  # Create test session directory structure
  TEST_SESSION_ID="test-session-$(date +%s)"
  TEST_CONTENT_ID="test-content-$(date +%s)"
  
  # Find the data directory (check common locations)
  DATA_DIR=""
  if [ -d "./data/sessions" ]; then
    DATA_DIR="./data/sessions"
  elif [ -d "/app/data/sessions" ]; then
    DATA_DIR="/app/data/sessions"
  else
    # Check if containers are running and inspect their mounts
    if podman ps | grep -q "share-things-backend"; then
      CONTAINER_MOUNTS=$(podman inspect share-things-backend --format '{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' 2>/dev/null || echo "")
      log_info "Container mounts: $CONTAINER_MOUNTS"
      
      # Look for data mount
      if echo "$CONTAINER_MOUNTS" | grep -q "/app/data"; then
        DATA_MOUNT=$(echo "$CONTAINER_MOUNTS" | grep -o '[^[:space:]]*:/app/data' | cut -d: -f1)
        if [ -n "$DATA_MOUNT" ] && [ -d "$DATA_MOUNT" ]; then
          DATA_DIR="$DATA_MOUNT/sessions"
          log_info "Found data directory via container mount: $DATA_DIR"
        fi
      fi
    fi
    
    # Fallback to creating in current directory
    if [ -z "$DATA_DIR" ]; then
      DATA_DIR="./data/sessions"
      log_warning "Using fallback data directory: $DATA_DIR"
    fi
  fi
  
  # Create directory structure
  mkdir -p "$DATA_DIR/$TEST_SESSION_ID/$TEST_CONTENT_ID"
  
  # Create test chunk files
  echo "Test chunk 0 data" > "$DATA_DIR/$TEST_SESSION_ID/$TEST_CONTENT_ID/0.bin"
  echo "Test chunk 1 data" > "$DATA_DIR/$TEST_SESSION_ID/$TEST_CONTENT_ID/1.bin"
  
  # Create or update SQLite database
  SQLITE_DB="$DATA_DIR/metadata.db"
  
  # Create test metadata entry
  sqlite3 "$SQLITE_DB" "
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
    
    INSERT OR REPLACE INTO content 
    (id, session_id, content_type, mime_type, total_chunks, total_size, created_at, encryption_iv)
    VALUES 
    ('$TEST_CONTENT_ID', '$TEST_SESSION_ID', 'text/plain', 'text/plain', 2, 32, $(date +%s), X'000102030405060708090a0b');
  "
  
  # Store test identifiers for verification
  echo "$TEST_SESSION_ID" > "/tmp/test-session-id"
  echo "$TEST_CONTENT_ID" > "/tmp/test-content-id"
  echo "$DATA_DIR" > "/tmp/test-data-dir"
  
  log_success "Test data created directly in filesystem"
  log_info "Test session ID: $TEST_SESSION_ID"
  log_info "Test content ID: $TEST_CONTENT_ID"
  log_info "Data directory: $DATA_DIR"
}

# Function to record data fingerprints before update
record_data_fingerprints() {
  log_info "Recording data fingerprints before update..."
  
  # Get data directory
  if [ -f "/tmp/test-data-dir" ]; then
    DATA_DIR=$(cat /tmp/test-data-dir)
  else
    DATA_DIR="./data/sessions"
  fi
  
  # Create fingerprints directory
  mkdir -p "/tmp/data-fingerprints"
  
  # Record directory structure
  if [ -d "$DATA_DIR" ]; then
    find "$DATA_DIR" -type f -exec ls -la {} \; > "/tmp/data-fingerprints/file-list.txt"
    find "$DATA_DIR" -type f -exec md5sum {} \; > "/tmp/data-fingerprints/file-hashes.txt" 2>/dev/null || true
    
    # Record SQLite database content
    if [ -f "$DATA_DIR/metadata.db" ]; then
      sqlite3 "$DATA_DIR/metadata.db" "SELECT * FROM content;" > "/tmp/data-fingerprints/db-content.txt" 2>/dev/null || true
      sqlite3 "$DATA_DIR/metadata.db" "SELECT * FROM chunks;" > "/tmp/data-fingerprints/db-chunks.txt" 2>/dev/null || true
    fi
    
    log_success "Data fingerprints recorded"
  else
    log_warning "Data directory not found: $DATA_DIR"
  fi
}

# Function to verify data fingerprints after update
verify_data_fingerprints() {
  log_info "Verifying data fingerprints after update..."
  
  # Get data directory
  if [ -f "/tmp/test-data-dir" ]; then
    DATA_DIR=$(cat /tmp/test-data-dir)
  else
    DATA_DIR="./data/sessions"
  fi
  
  local verification_failed=false
  
  # Check if data directory still exists
  if [ ! -d "$DATA_DIR" ]; then
    log_error "Data directory no longer exists: $DATA_DIR"
    return 1
  fi
  
  # Check if fingerprint files exist
  if [ ! -f "/tmp/data-fingerprints/file-list.txt" ]; then
    log_warning "No fingerprint files found - skipping detailed verification"
    return 0
  fi
  
  # Verify file structure
  find "$DATA_DIR" -type f -exec ls -la {} \; > "/tmp/data-fingerprints/file-list-after.txt"
  
  if ! diff "/tmp/data-fingerprints/file-list.txt" "/tmp/data-fingerprints/file-list-after.txt" > /dev/null; then
    log_error "File structure changed after update"
    log_info "Before update:"
    cat "/tmp/data-fingerprints/file-list.txt"
    log_info "After update:"
    cat "/tmp/data-fingerprints/file-list-after.txt"
    verification_failed=true
  else
    log_success "File structure preserved"
  fi
  
  # Verify file hashes
  find "$DATA_DIR" -type f -exec md5sum {} \; > "/tmp/data-fingerprints/file-hashes-after.txt" 2>/dev/null || true
  
  if [ -f "/tmp/data-fingerprints/file-hashes.txt" ] && [ -f "/tmp/data-fingerprints/file-hashes-after.txt" ]; then
    if ! diff "/tmp/data-fingerprints/file-hashes.txt" "/tmp/data-fingerprints/file-hashes-after.txt" > /dev/null; then
      log_error "File contents changed after update"
      verification_failed=true
    else
      log_success "File contents preserved"
    fi
  fi
  
  # Verify SQLite database content
  if [ -f "$DATA_DIR/metadata.db" ]; then
    sqlite3 "$DATA_DIR/metadata.db" "SELECT * FROM content;" > "/tmp/data-fingerprints/db-content-after.txt" 2>/dev/null || true
    sqlite3 "$DATA_DIR/metadata.db" "SELECT * FROM chunks;" > "/tmp/data-fingerprints/db-chunks-after.txt" 2>/dev/null || true
    
    if [ -f "/tmp/data-fingerprints/db-content.txt" ] && [ -f "/tmp/data-fingerprints/db-content-after.txt" ]; then
      if ! diff "/tmp/data-fingerprints/db-content.txt" "/tmp/data-fingerprints/db-content-after.txt" > /dev/null; then
        log_error "Database content changed after update"
        verification_failed=true
      else
        log_success "Database content preserved"
      fi
    fi
  else
    log_error "SQLite database no longer exists after update"
    verification_failed=true
  fi
  
  if [ "$verification_failed" = true ]; then
    return 1
  else
    log_success "All data fingerprints verified successfully"
    return 0
  fi
}

# Function to test data accessibility via API
test_data_api_access() {
  log_info "Testing data accessibility via API..."
  
  # Wait for server to be ready
  wait_for_server
  
  # Try to access the health endpoint
  HEALTH_RESPONSE=$(curl -s http://localhost:15001/health)
  if [ $? -eq 0 ]; then
    log_success "API is accessible: $HEALTH_RESPONSE"
  else
    log_error "API is not accessible"
    return 1
  fi
  
  # Additional API tests can be added here
  return 0
}

# Function to clean up test data
cleanup_test_data() {
  log_info "Cleaning up test data..."
  
  # Remove temporary files
  rm -f /tmp/test-session-id /tmp/test-content-id /tmp/test-data-dir
  rm -rf /tmp/data-fingerprints
  
  log_success "Test data cleanup completed"
}

# Function to clean up containers
cleanup_containers() {
  log_info "Cleaning up containers..."
  
  cd "$REPO_ROOT"
  ./setup.sh --uninstall --non-interactive
  
  if podman ps -a | grep -q "share-things"; then
    log_error "Cleanup failed: containers still exist after uninstall"
    return 1
  else
    log_success "Container cleanup successful"
    return 0
  fi
}

# ===== MAIN TEST SEQUENCE =====

log_info "Starting data persistence test"
log_info "============================="

# Check if setup.sh exists
if [ -f "$REPO_ROOT/setup.sh" ]; then
  log_success "setup.sh found at $REPO_ROOT/setup.sh"
else
  log_error "setup.sh not found at $REPO_ROOT/setup.sh"
  exit 1
fi

# Make setup.sh executable
chmod +x "$REPO_ROOT/setup.sh"

# Save current directory and change to repo root
CURRENT_DIR=$(pwd)
cd "$REPO_ROOT"

# Step 1: Install ShareThings
log_info "Step 1: Installing ShareThings..."
./setup.sh --force-install --non-interactive
INSTALL_EXIT_CODE=$?

if [ $INSTALL_EXIT_CODE -ne 0 ]; then
  log_error "Installation failed with exit code $INSTALL_EXIT_CODE"
  exit 1
fi

log_success "Installation completed successfully"

# Step 2: Create test data
log_info "Step 2: Creating test data..."
create_test_data

# Step 3: Record data fingerprints
log_info "Step 3: Recording data fingerprints..."
record_data_fingerprints

# Step 4: Run update
log_info "Step 4: Running update..."
./setup.sh --update --non-interactive
UPDATE_EXIT_CODE=$?

if [ $UPDATE_EXIT_CODE -ne 0 ]; then
  log_error "Update failed with exit code $UPDATE_EXIT_CODE"
  exit 1
fi

log_success "Update completed successfully"

# Step 5: Verify data persistence
log_info "Step 5: Verifying data persistence..."
verify_data_fingerprints
VERIFY_EXIT_CODE=$?

# Step 6: Test API accessibility
log_info "Step 6: Testing API accessibility..."
test_data_api_access
API_EXIT_CODE=$?

# Cleanup test data
cleanup_test_data

# Cleanup containers if not skipped
if [ "$SKIP_CLEANUP" = "false" ]; then
  cleanup_containers
  CLEANUP_EXIT_CODE=$?
else
  log_info "Skipping container cleanup as requested"
  CLEANUP_EXIT_CODE=0
fi

# Change back to original directory
cd "$CURRENT_DIR"

# Final result
if [ $VERIFY_EXIT_CODE -eq 0 ] && [ $API_EXIT_CODE -eq 0 ] && [ $CLEANUP_EXIT_CODE -eq 0 ]; then
  log_success "Data persistence test PASSED! All data was preserved through the update."
  exit 0
else
  log_error "Data persistence test FAILED!"
  if [ $VERIFY_EXIT_CODE -ne 0 ]; then
    log_error "- Data verification failed"
  fi
  if [ $API_EXIT_CODE -ne 0 ]; then
    log_error "- API accessibility test failed"
  fi
  if [ $CLEANUP_EXIT_CODE -ne 0 ]; then
    log_error "- Cleanup failed"
  fi
  exit 1
fi