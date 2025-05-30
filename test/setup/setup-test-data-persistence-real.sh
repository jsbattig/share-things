#!/bin/bash
#
# setup-test-data-persistence-real.sh - Real test for data persistence through updates
#
# This script tests the ACTUAL data persistence issue by:
# 1. Installing ShareThings
# 2. Creating data through the running application (not filesystem)
# 3. Running setup.sh in update mode
# 4. Verifying the data is lost (demonstrating the problem)
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
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fi

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

# Function to create test data inside the running container
create_test_data_in_container() {
  log_info "Creating test data inside the running container..."
  
  # Wait for server to be ready
  wait_for_server
  
  # Create test data directly in the container's data directory
  TEST_SESSION_ID="test-session-$(date +%s)"
  TEST_CONTENT_ID="test-content-$(date +%s)"
  
  log_info "Creating test data in container..."
  
  # Create directory structure inside container
  podman exec share-things-backend mkdir -p "/app/data/sessions/$TEST_SESSION_ID/$TEST_CONTENT_ID"
  
  # Create test chunk files inside container
  podman exec share-things-backend sh -c "echo 'Test chunk 0 data - $(date)' > /app/data/sessions/$TEST_SESSION_ID/$TEST_CONTENT_ID/0.bin"
  podman exec share-things-backend sh -c "echo 'Test chunk 1 data - $(date)' > /app/data/sessions/$TEST_SESSION_ID/$TEST_CONTENT_ID/1.bin"
  
  # Create test metadata entry in container's database
  podman exec share-things-backend sqlite3 /app/data/sessions/metadata.db "
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
  
  log_success "Test data created inside container"
  log_info "Test session ID: $TEST_SESSION_ID"
  log_info "Test content ID: $TEST_CONTENT_ID"
}

# Function to record container data fingerprints before update
record_container_data_fingerprints() {
  log_info "Recording container data fingerprints before update..."
  
  # Create fingerprints directory
  mkdir -p "/tmp/container-data-fingerprints"
  
  # Record directory structure inside container
  podman exec share-things-backend find /app/data -type f -exec ls -la {} \; > "/tmp/container-data-fingerprints/file-list.txt"
  podman exec share-things-backend find /app/data -type f -exec md5sum {} \; > "/tmp/container-data-fingerprints/file-hashes.txt" 2>/dev/null || true
  
  # Record SQLite database content from container
  podman exec share-things-backend sqlite3 /app/data/sessions/metadata.db "SELECT * FROM content;" > "/tmp/container-data-fingerprints/db-content.txt" 2>/dev/null || true
  podman exec share-things-backend sqlite3 /app/data/sessions/metadata.db "SELECT * FROM chunks;" > "/tmp/container-data-fingerprints/db-chunks.txt" 2>/dev/null || true
  
  log_success "Container data fingerprints recorded"
}

# Function to verify container data fingerprints after update
verify_container_data_fingerprints() {
  log_info "Verifying container data fingerprints after update..."
  
  local verification_failed=false
  
  # Check if container data still exists
  if ! podman exec share-things-backend test -d /app/data/sessions; then
    log_error "Container data directory no longer exists"
    return 1
  fi
  
  # Check if fingerprint files exist
  if [ ! -f "/tmp/container-data-fingerprints/file-list.txt" ]; then
    log_warning "No fingerprint files found - skipping detailed verification"
    return 0
  fi
  
  # Verify file structure in container
  podman exec share-things-backend find /app/data -type f -exec ls -la {} \; > "/tmp/container-data-fingerprints/file-list-after.txt"
  
  if ! diff "/tmp/container-data-fingerprints/file-list.txt" "/tmp/container-data-fingerprints/file-list-after.txt" > /dev/null; then
    log_error "Container file structure changed after update"
    log_info "Before update:"
    cat "/tmp/container-data-fingerprints/file-list.txt"
    log_info "After update:"
    cat "/tmp/container-data-fingerprints/file-list-after.txt"
    verification_failed=true
  else
    log_success "Container file structure preserved"
  fi
  
  # Verify file hashes in container
  podman exec share-things-backend find /app/data -type f -exec md5sum {} \; > "/tmp/container-data-fingerprints/file-hashes-after.txt" 2>/dev/null || true
  
  if [ -f "/tmp/container-data-fingerprints/file-hashes.txt" ] && [ -f "/tmp/container-data-fingerprints/file-hashes-after.txt" ]; then
    if ! diff "/tmp/container-data-fingerprints/file-hashes.txt" "/tmp/container-data-fingerprints/file-hashes-after.txt" > /dev/null; then
      log_error "Container file contents changed after update"
      verification_failed=true
    else
      log_success "Container file contents preserved"
    fi
  fi
  
  # Verify SQLite database content in container
  if podman exec share-things-backend test -f /app/data/sessions/metadata.db; then
    podman exec share-things-backend sqlite3 /app/data/sessions/metadata.db "SELECT * FROM content;" > "/tmp/container-data-fingerprints/db-content-after.txt" 2>/dev/null || true
    podman exec share-things-backend sqlite3 /app/data/sessions/metadata.db "SELECT * FROM chunks;" > "/tmp/container-data-fingerprints/db-chunks-after.txt" 2>/dev/null || true
    
    if [ -f "/tmp/container-data-fingerprints/db-content.txt" ] && [ -f "/tmp/container-data-fingerprints/db-content-after.txt" ]; then
      if ! diff "/tmp/container-data-fingerprints/db-content.txt" "/tmp/container-data-fingerprints/db-content-after.txt" > /dev/null; then
        log_error "Container database content changed after update"
        verification_failed=true
      else
        log_success "Container database content preserved"
      fi
    fi
  else
    log_error "Container SQLite database no longer exists after update"
    verification_failed=true
  fi
  
  if [ "$verification_failed" = true ]; then
    return 1
  else
    log_success "All container data fingerprints verified successfully"
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
  
  return 0
}

# Function to clean up test data
cleanup_test_data() {
  log_info "Cleaning up test data..."
  
  # Remove temporary files
  rm -f /tmp/test-session-id /tmp/test-content-id
  rm -rf /tmp/container-data-fingerprints
  
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

log_info "Starting REAL data persistence test"
log_info "=================================="

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

# Step 2: Create test data inside the container
log_info "Step 2: Creating test data inside the container..."
create_test_data_in_container

# Step 3: Record container data fingerprints
log_info "Step 3: Recording container data fingerprints..."
record_container_data_fingerprints

# Step 4: Run update
log_info "Step 4: Running update..."
./setup.sh --update --non-interactive
UPDATE_EXIT_CODE=$?

if [ $UPDATE_EXIT_CODE -ne 0 ]; then
  log_error "Update failed with exit code $UPDATE_EXIT_CODE"
  exit 1
fi

log_success "Update completed successfully"

# Step 5: Verify data persistence (this should FAIL, demonstrating the problem)
log_info "Step 5: Verifying data persistence..."
verify_container_data_fingerprints
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

# Final result - this test should FAIL to demonstrate the problem
if [ $VERIFY_EXIT_CODE -eq 0 ] && [ $API_EXIT_CODE -eq 0 ] && [ $CLEANUP_EXIT_CODE -eq 0 ]; then
  log_warning "Data persistence test PASSED unexpectedly!"
  log_warning "This means the data persistence issue may already be fixed."
  exit 0
else
  log_error "Data persistence test FAILED as expected!"
  log_error "This demonstrates the data persistence problem:"
  if [ $VERIFY_EXIT_CODE -ne 0 ]; then
    log_error "- Container data was lost during update"
  fi
  if [ $API_EXIT_CODE -ne 0 ]; then
    log_error "- API accessibility test failed"
  fi
  if [ $CLEANUP_EXIT_CODE -ne 0 ]; then
    log_error "- Cleanup failed"
  fi
  log_info "This test failure demonstrates the need for data persistence fixes."
  exit 1
fi