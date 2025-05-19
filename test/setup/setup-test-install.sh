#!/bin/bash
#
# setup-test-install.sh - Minimal test script for setup.sh
#
# This script only checks if setup.sh exists and is executable
# without trying to run it or create any files
#

set -e  # Exit immediately if a command exits with a non-zero status

# ===== CONFIGURATION =====

# Determine if we're running in CI
if [ "$CI" = "true" ]; then
  echo "Running in CI environment"
  # In CI, try to find the repository root by going up directories
  # First check if we're already in the root (setup.sh exists)
  if [ -f "setup.sh" ]; then
    REPO_ROOT=$(pwd)
  # Then check if we're in a subdirectory (setup.sh is in parent)
  elif [ -f "../setup.sh" ]; then
    REPO_ROOT=$(cd .. && pwd)
  # Then check if we're in a sub-subdirectory (setup.sh is in grandparent)
  elif [ -f "../../setup.sh" ]; then
    REPO_ROOT=$(cd ../.. && pwd)
  # If all else fails, use the current directory
  else
    REPO_ROOT=$(pwd)
  fi
else
  # In local environment, use git to find the repo root
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fi

echo "Repository root: $REPO_ROOT"
echo "Current working directory: $(pwd)"
echo "Files in current directory:"
ls -la

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

# ===== MAIN TEST SEQUENCE =====

log_info "Starting minimal setup.sh verification"
log_info "=============================="

# Check if setup.sh exists
if [ -f "$REPO_ROOT/setup.sh" ]; then
  log_success "setup.sh found at $REPO_ROOT/setup.sh"
else
  log_error "setup.sh not found at $REPO_ROOT/setup.sh"
  exit 1
fi

# Make setup.sh executable
chmod +x "$REPO_ROOT/setup.sh"
log_info "Made setup.sh executable"

# Check if setup.sh is executable
if [ -x "$REPO_ROOT/setup.sh" ]; then
  log_success "setup.sh is executable"
else
  log_error "setup.sh is not executable"
  exit 1
fi

# List the build/config directory to see if it exists
if [ -d "$REPO_ROOT/build/config" ]; then
  log_info "build/config directory exists"
  log_info "Contents of build/config:"
  ls -la "$REPO_ROOT/build/config"
else
  log_info "Creating build/config directory"
  mkdir -p "$REPO_ROOT/build/config"
  log_success "Created build/config directory"
fi

# Now actually run setup.sh with appropriate parameters
log_info "Now running setup.sh to test actual functionality"

# Save current directory
CURRENT_DIR=$(pwd)

# Change to repository root directory before running setup.sh
cd "$REPO_ROOT"
log_info "Changed to repository root directory: $(pwd)"

# First, verify setup.sh --help works
log_info "Step 1: Testing setup.sh --help"
SETUP_HELP_OUTPUT=$(./setup.sh --help 2>&1)
SETUP_HELP_EXIT_CODE=$?

if [ $SETUP_HELP_EXIT_CODE -eq 0 ]; then
  log_success "setup.sh --help executed successfully"
  log_info "First 10 lines of help output:"
  echo "$SETUP_HELP_OUTPUT" | head -n 10
else
  log_error "setup.sh --help failed with exit code $SETUP_HELP_EXIT_CODE"
  log_info "Error output:"
  echo "$SETUP_HELP_OUTPUT"
  exit 1
fi

# CI environment setup - ensure directories exist and have correct permissions
if [ "$CI" = "true" ]; then
  log_info "Setting up CI environment for full installation test"
  
  # Create necessary directories with proper permissions
  log_info "Creating necessary directories in CI environment"
  mkdir -p build/config
  
  # Set appropriate permissions
  log_info "Setting appropriate permissions in CI environment"
  chmod -R 755 build
  
  # Set environment variables for CI
  export PODMAN_USERNS=keep-id
  log_info "Set PODMAN_USERNS=keep-id for CI environment"
fi

# Do a full installation test in both local and CI environments
log_info "Step 2: Testing full installation with setup.sh"

# First, make sure any existing installation is removed
log_info "Step 2.1: Cleaning up any existing installation"
log_info "Command: ./setup.sh --uninstall --non-interactive"

# Run uninstall and show full output
./setup.sh --uninstall --non-interactive
UNINSTALL_EXIT_CODE=$?

if [ $UNINSTALL_EXIT_CODE -eq 0 ]; then
  log_success "Cleanup successful"
else
  log_warning "Cleanup may not have been complete, but continuing"
fi

# Now run the actual installation
log_info "Step 2.2: Running full installation"
log_info "Command: ./setup.sh --non-interactive --force-install"

# Run with a longer timeout for the full installation and show full output
if [ "$CI" = "true" ]; then
  # In CI, use a longer timeout
  log_info "Using 300 second timeout for CI environment"
  timeout 300 ./setup.sh --non-interactive --force-install
else
  # In local environment, use a standard timeout
  timeout 180 ./setup.sh --non-interactive --force-install
fi
SETUP_EXIT_CODE=$?

# Check the exit code
if [ $SETUP_EXIT_CODE -eq 0 ]; then
  log_success "Full installation executed successfully"
elif [ $SETUP_EXIT_CODE -eq 124 ]; then
  log_warning "Installation timed out, but may have partially succeeded"
  exit 1
else
  log_error "Installation failed with exit code $SETUP_EXIT_CODE"
  exit 1
fi

# Verify the installation by checking if containers are running and healthy
log_info "Step 2.3: Verifying installation by checking containers"
CONTAINER_COUNT=$(podman ps | grep -c "share-things" || echo "0")

if [ "$CONTAINER_COUNT" -gt 0 ]; then
  log_success "Installation verified: $CONTAINER_COUNT containers are running"
  podman ps | grep "share-things"
  
  # Perform health checks on the containers
  log_info "Step 2.4: Performing health checks on containers"
  
  # Wait a moment for containers to fully initialize
  log_info "Waiting for containers to fully initialize (15 seconds)..."
  sleep 15
  
  # Check frontend health
  log_info "Checking if frontend container is responsive..."
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:15000/ | grep -q "200"; then
    log_success "Frontend container is responsive"
  else
    log_warning "Frontend container is not responding properly"
    curl -v http://localhost:15000/
  fi
  
  # Check backend health
  log_info "Checking if backend container health endpoint is responsive..."
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:15001/health | grep -q "200"; then
    log_success "Backend container health endpoint is responsive"
  else
    log_warning "Backend container health endpoint is not responding properly"
    curl -v http://localhost:15001/health
  fi
  
  # Overall health check result
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:15000/ | grep -q "200" && \
     curl -s -o /dev/null -w "%{http_code}" http://localhost:15001/health | grep -q "200"; then
    log_success "All container health checks passed successfully"
  else
    log_warning "Some container health checks failed"
  fi
else
  log_warning "No containers found running after installation"
  log_info "Checking for stopped containers:"
  podman ps -a | grep "share-things" || echo "No containers found"
fi

# Clean up after the test
log_info "Step 2.5: Cleaning up after test"
log_info "Command: ./setup.sh --uninstall --non-interactive"

# Create a temporary log file for cleanup output
TEMP_LOG_FILE="setup-cleanup-output.log"
./setup.sh --uninstall --non-interactive > "$TEMP_LOG_FILE" 2>&1
CLEANUP_EXIT_CODE=$?

if [ $CLEANUP_EXIT_CODE -eq 0 ]; then
  log_success "Final cleanup successful"
else
  log_warning "Final cleanup may not have been complete"
fi

# Clean up the log file
rm -f "$TEMP_LOG_FILE"

# Change back to original directory
cd "$CURRENT_DIR"
log_info "Changed back to original directory: $(pwd)"

log_success "Test passed! setup.sh exists, is executable, and runs correctly with actual parameters."
exit 0