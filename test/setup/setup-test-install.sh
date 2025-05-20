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
  # Store the health check response in a variable
  FRONTEND_RESPONSE=$(timeout 5 curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:15000/ 2>&1)
  FRONTEND_HTTP_CODE=$(echo "$FRONTEND_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
  
  log_info "Frontend health check response code: $FRONTEND_HTTP_CODE"
  log_info "Frontend health check response content:"
  echo "$FRONTEND_RESPONSE" | grep -v "HTTP_CODE:"
  
  if [ "$FRONTEND_HTTP_CODE" = "200" ]; then
    log_success "Frontend container is responsive"
    FRONTEND_HEALTHY=true
  else
    # Try again with a longer timeout but still limited
    log_warning "Frontend container not responding on first attempt, trying again with longer timeout..."
    FRONTEND_RESPONSE_RETRY=$(timeout 10 curl -s -w "\nHTTP_CODE:%{http_code}" --connect-timeout 5 http://localhost:15000/ 2>&1)
    FRONTEND_HTTP_CODE_RETRY=$(echo "$FRONTEND_RESPONSE_RETRY" | grep "HTTP_CODE:" | cut -d':' -f2)
    
    log_info "Frontend health check retry response code: $FRONTEND_HTTP_CODE_RETRY"
    log_info "Frontend health check retry response content:"
    echo "$FRONTEND_RESPONSE_RETRY" | grep -v "HTTP_CODE:"
    
    if [ "$FRONTEND_HTTP_CODE_RETRY" = "200" ]; then
      log_success "Frontend container is responsive on second attempt"
      FRONTEND_HEALTHY=true
    else
      log_error "Frontend container is not responding properly"
      # Use timeout for verbose curl as well
      log_info "Detailed curl output:"
      timeout 5 curl -v http://localhost:15000/ || echo "curl timed out"
      # Check if the container is running
      log_info "Checking container status:"
      podman ps -a | grep share-things-frontend
      # Check container logs
      log_info "Container logs:"
      podman logs share-things-frontend
      # Check for network issues
      log_info "Checking network connectivity:"
      netstat -tulpn | grep 15000 || echo "No process listening on port 15000"
      FRONTEND_HEALTHY=false
      # Store the failure reason
      FRONTEND_FAILURE_REASON="Frontend container health check failed with HTTP code: $FRONTEND_HTTP_CODE_RETRY"
    fi
  fi
  
  # Check backend health
  log_info "Checking if backend container health endpoint is responsive..."
  # Store the health check response in a variable
  BACKEND_RESPONSE=$(timeout 5 curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:15001/health 2>&1)
  BACKEND_HTTP_CODE=$(echo "$BACKEND_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
  
  log_info "Backend health check response code: $BACKEND_HTTP_CODE"
  log_info "Backend health check response content:"
  echo "$BACKEND_RESPONSE" | grep -v "HTTP_CODE:"
  
  if [ "$BACKEND_HTTP_CODE" = "200" ]; then
    log_success "Backend container health endpoint is responsive"
    BACKEND_HEALTHY=true
  else
    log_error "Backend container health endpoint is not responding properly"
    log_info "Detailed curl output:"
    timeout 5 curl -v http://localhost:15001/health || echo "curl timed out"
    # Check container logs
    log_info "Backend container logs:"
    podman logs share-things-backend
    # Check for network issues
    log_info "Checking network connectivity:"
    netstat -tulpn | grep 15001 || echo "No process listening on port 15001"
    BACKEND_HEALTHY=false
    # Store the failure reason
    BACKEND_FAILURE_REASON="Backend container health check failed with HTTP code: $BACKEND_HTTP_CODE"
  fi
  
  # Overall health check result
  if [ "$FRONTEND_HEALTHY" = "true" ] && [ "$BACKEND_HEALTHY" = "true" ]; then
    log_success "All container health checks passed successfully"
  else
    log_error "Some container health checks failed"
    # Create a detailed failure summary
    echo "=============================================="
    echo "TEST FAILURE SUMMARY"
    echo "=============================================="
    if [ "$FRONTEND_HEALTHY" != "true" ]; then
      echo "FRONTEND FAILURE: ${FRONTEND_FAILURE_REASON:-Unknown reason}"
    fi
    if [ "$BACKEND_HEALTHY" != "true" ]; then
      echo "BACKEND FAILURE: ${BACKEND_FAILURE_REASON:-Unknown reason}"
    fi
    echo "=============================================="
    exit 1
  fi
else
  log_error "No containers found running after installation"
  log_info "Checking for stopped containers:"
  STOPPED_CONTAINERS=$(podman ps -a | grep "share-things" || echo "No containers found")
  echo "$STOPPED_CONTAINERS"
  
  # Check for container creation errors
  log_info "Checking for container creation errors:"
  FRONTEND_LOGS=$(podman logs share-things-frontend 2>&1 || echo "No frontend container logs available")
  BACKEND_LOGS=$(podman logs share-things-backend 2>&1 || echo "No backend container logs available")
  
  # Create a detailed failure summary
  echo "=============================================="
  echo "TEST FAILURE SUMMARY"
  echo "=============================================="
  echo "CONTAINER FAILURE: No containers found running after installation"
  echo "Stopped containers: $(echo "$STOPPED_CONTAINERS" | wc -l) found"
  echo "Last 10 lines of frontend logs:"
  echo "$FRONTEND_LOGS" | tail -n 10
  echo "Last 10 lines of backend logs:"
  echo "$BACKEND_LOGS" | tail -n 10
  echo "=============================================="
  
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
    REMAINING_CONTAINERS=$(podman ps -a | grep "share-things")
    log_error "Final cleanup failed: containers still exist after cleanup"
    log_error "Please check the following containers:"
    echo "$REMAINING_CONTAINERS"
    
    # Create a detailed failure summary
    echo "=============================================="
    echo "TEST FAILURE SUMMARY"
    echo "=============================================="
    echo "CLEANUP FAILURE: Containers still exist after cleanup"
    echo "Remaining containers:"
    echo "$REMAINING_CONTAINERS"
    echo "Cleanup log:"
    cat "$TEMP_LOG_FILE" | tail -n 20
    echo "=============================================="
    
    exit 1
  else
    log_success "Final cleanup successful - all containers properly removed"
  fi
else
  log_error "Final cleanup failed with exit code $CLEANUP_EXIT_CODE"
  
  # Create a detailed failure summary
  echo "=============================================="
  echo "TEST FAILURE SUMMARY"
  echo "=============================================="
  echo "CLEANUP FAILURE: Cleanup script exited with code $CLEANUP_EXIT_CODE"
  echo "Last 20 lines of cleanup log:"
  cat "$TEMP_LOG_FILE" | tail -n 20
  echo "=============================================="
  
  exit 1
fi

# Clean up the log file
rm -f "$TEMP_LOG_FILE"

# Change back to original directory
cd "$CURRENT_DIR"
log_info "Changed back to original directory: $(pwd)"

log_success "Test passed! setup.sh exists, is executable, and containers are running and healthy."
exit 0