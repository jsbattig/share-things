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

# Export REPO_ROOT so it's available to all scripts
export REPO_ROOT

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

# We'll check for containers after the uninstall step

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

# Set environment variables for CI if needed
if [ "$CI" = "true" ]; then
  # Set environment variables for CI
  export PODMAN_USERNS=keep-id
  log_info "Set PODMAN_USERNS=keep-id for CI environment"
  
  # Create necessary directories with proper permissions
  log_info "Creating necessary directories if they don't exist"
  mkdir -p build/config
  mkdir -p data
  mkdir -p client/dist
  mkdir -p server/dist
  
  # Create health check endpoint for frontend
  log_info "Creating health check endpoint for frontend"
  mkdir -p client/dist/health
  echo '{"status":"ok"}' > client/dist/health/index.json
  
  # Set appropriate permissions
  log_info "Setting appropriate permissions"
  chmod -R 755 build
  chmod -R 777 data 2>/dev/null || true
  chmod -R 777 client/dist 2>/dev/null || true
  chmod -R 777 server/dist 2>/dev/null || true
  
  # Copy the CI-specific podman-compose file if it exists
  if [ -f "$REPO_ROOT/build/config/podman-compose.test.ci.yml" ]; then
    log_info "Using CI-specific podman-compose configuration"
    cp "$REPO_ROOT/build/config/podman-compose.test.ci.yml" "$REPO_ROOT/build/config/podman-compose.yml"
    # Make sure the file is copied successfully
    if [ -f "$REPO_ROOT/build/config/podman-compose.yml" ]; then
      log_info "CI-specific podman-compose configuration copied successfully"
      log_info "Contents of podman-compose.yml:"
      cat "$REPO_ROOT/build/config/podman-compose.yml"
    else
      log_error "Failed to copy CI-specific podman-compose configuration"
      exit 1
    fi
  fi
fi

# Do a full installation test
log_info "Step 2: Testing full installation with setup.sh"

# First, make sure any existing installation is removed
log_info "Step 2.1: Cleaning up any existing installation"
log_info "Command: ./setup.sh --uninstall --non-interactive"

# Run uninstall and show full output
./setup.sh --uninstall --non-interactive
UNINSTALL_EXIT_CODE=$?

if [ $UNINSTALL_EXIT_CODE -eq 0 ]; then
  # Verify that all containers have been properly stopped and removed
  if podman ps -a | grep -q "share-things"; then
    log_error "Uninstall failed: containers still exist after uninstall"
    log_error "Please check the following containers:"
    podman ps -a | grep "share-things"
    exit 1
  else
    log_success "Cleanup successful - all containers properly removed"
  fi
else
  log_error "Uninstall failed with exit code $UNINSTALL_EXIT_CODE"
  exit 1
fi

# Now run the actual installation
log_info "Step 2.2: Running full installation"
log_info "Command: ./setup.sh --non-interactive --force-install"

# Run with a standard timeout
timeout 300 ./setup.sh --non-interactive --force-install
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

# Check for share-things containers
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
    FRONTEND_HEALTHY=true
  else
    # Try again with a longer timeout
    log_warning "Frontend container not responding on first attempt, trying again with longer timeout..."
    if curl -s --connect-timeout 10 -o /dev/null -w "%{http_code}" http://localhost:15000/ | grep -q "200"; then
      log_success "Frontend container is responsive on second attempt"
      FRONTEND_HEALTHY=true
    else
      log_error "Frontend container is not responding properly"
      curl -v http://localhost:15000/
      # Check if the container is running
      log_info "Checking container status:"
      podman ps -a | grep share-things-frontend
      # Check container logs
      log_info "Container logs:"
      podman logs share-things-frontend
      FRONTEND_HEALTHY=false
    fi
  fi
  
  # Check backend health
  log_info "Checking if backend container health endpoint is responsive..."
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:15001/health | grep -q "200"; then
    log_success "Backend container health endpoint is responsive"
    BACKEND_HEALTHY=true
  else
    log_error "Backend container health endpoint is not responding properly"
    curl -v http://localhost:15001/health
    BACKEND_HEALTHY=false
  fi
  
  # Overall health check result
  if [ "$FRONTEND_HEALTHY" = "true" ] && [ "$BACKEND_HEALTHY" = "true" ]; then
    log_success "All container health checks passed successfully"
  else
    log_error "Some container health checks failed"
    exit 1
  fi
else
  log_error "No containers found running after installation"
  log_info "Checking for stopped containers:"
  podman ps -a | grep "share-things" || echo "No containers found"
  log_error "Installation failed: containers are not running"
  exit 1
fi

# Clean up after the test
log_info "Step 2.5: Cleaning up after test"
log_info "Command: ./setup.sh --uninstall --non-interactive"

# Create a temporary log file for cleanup output
TEMP_LOG_FILE="setup-cleanup-output.log"
./setup.sh --uninstall --non-interactive > "$TEMP_LOG_FILE" 2>&1
CLEANUP_EXIT_CODE=$?

if [ $CLEANUP_EXIT_CODE -eq 0 ]; then
  # Verify that all containers have been properly stopped and removed
  if podman ps -a | grep -q "share-things"; then
    log_error "Final cleanup failed: containers still exist after cleanup"
    log_error "Please check the following containers:"
    podman ps -a | grep "share-things"
    exit 1
  else
    log_success "Final cleanup successful - all containers properly removed"
  fi
else
  log_error "Final cleanup failed with exit code $CLEANUP_EXIT_CODE"
  exit 1
fi

# Clean up the log file
rm -f "$TEMP_LOG_FILE"

# Change back to original directory
cd "$CURRENT_DIR"
log_info "Changed back to original directory: $(pwd)"

log_success "Test passed! setup.sh exists, is executable, and containers are running and healthy."
exit 0