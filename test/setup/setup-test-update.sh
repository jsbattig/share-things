#!/bin/bash
#
# setup-test-update.sh - Test script for setup.sh update mode
#
# This script tests the update functionality of setup.sh by:
# 1. Making a small modification to an endpoint
# 2. Running setup.sh in update mode
# 3. Verifying the modification is present after update
# 4. Cleaning up (restoring original files and stopping containers)
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

# Function to modify the health endpoint
modify_health_endpoint() {
  log_info "Modifying health endpoint for update test..."
  
  # Path to the routes file
  ROUTES_FILE="$REPO_ROOT/server/src/routes/index.ts"
  
  # Check if the file exists
  if [ ! -f "$ROUTES_FILE" ]; then
    log_error "Routes file not found at $ROUTES_FILE"
    exit 1
  fi
  
  # Create a backup of the original file
  cp "$ROUTES_FILE" "$ROUTES_FILE.original"
  log_info "Created backup of original routes file at $ROUTES_FILE.original"
  
  # Modify the health endpoint to return a different response
  sed -i 's/res.status(200).send('\''OK'\'');/res.status(200).json({ status: '\''OK'\'', updated: true });/' "$ROUTES_FILE"
  
  log_success "Modified health endpoint to return JSON with 'updated: true'"
}

# Function to restore the original health endpoint
restore_health_endpoint() {
  log_info "Restoring original health endpoint..."
  
  # Path to the routes file
  ROUTES_FILE="$REPO_ROOT/server/src/routes/index.ts"
  ORIGINAL_FILE="$ROUTES_FILE.original"
  
  # Use git to restore the file to its original state
  cd "$REPO_ROOT"
  
  # Check if the file is tracked by git
  if git ls-files --error-unmatch server/src/routes/index.ts &>/dev/null; then
    log_info "Using git to restore the original file..."
    git checkout -- server/src/routes/index.ts
    
    # Verify the restoration was successful
    if grep -q "json({ status: 'OK', updated: true })" "$ROUTES_FILE"; then
      log_error "Failed to restore original health endpoint - modified version still present"
      return 1
    elif grep -q "send('OK')" "$ROUTES_FILE"; then
      log_success "Verified original health endpoint was properly restored"
    else
      log_warning "Could not verify health endpoint restoration - unexpected content"
    fi
    
    # Remove the backup file to clean up
    if [ -f "$ORIGINAL_FILE" ]; then
      rm -f "$ORIGINAL_FILE"
      log_info "Removed backup file"
    fi
    
    log_success "Restored original health endpoint using git"
  else
    log_warning "File is not tracked by git, falling back to file copy method"
    
    # Check if the original file exists
    if [ ! -f "$ORIGINAL_FILE" ]; then
      log_error "Original file not found at $ORIGINAL_FILE"
      return 1
    fi
    
    # Restore the original file by copying it back
    cp "$ORIGINAL_FILE" "$ROUTES_FILE"
    
    # Verify the restoration was successful
    if grep -q "json({ status: 'OK', updated: true })" "$ROUTES_FILE"; then
      log_error "Failed to restore original health endpoint - modified version still present"
      return 1
    elif grep -q "send('OK')" "$ROUTES_FILE"; then
      log_success "Verified original health endpoint was properly restored"
    else
      log_warning "Could not verify health endpoint restoration - unexpected content"
    fi
    
    # Remove the backup file to clean up
    rm -f "$ORIGINAL_FILE"
    
    log_success "Restored original health endpoint and removed backup file"
  fi
}

# Function to verify the health endpoint was updated
verify_health_endpoint() {
  log_info "Verifying health endpoint was updated..."
  
  # Check if containers are running
  if ! podman ps | grep -q "share-things"; then
    log_warning "No containers are running. Attempting to start them manually..."
    
    # Try to start the containers manually
    log_info "Starting containers manually..."
    
    # First, check if we have the update compose file
    if [ -f "build/config/podman-compose.update.yml.bak" ]; then
      log_info "Found backup compose file, restoring it..."
      cp "build/config/podman-compose.update.yml.bak" "build/config/podman-compose.update.yml"
      log_info "Verified restored file exists: $(ls -la build/config/podman-compose.update.yml || echo 'File not found after restore')"
    fi
    
    # If we still don't have a compose file, use the default one
    if [ ! -f "build/config/podman-compose.update.yml" ]; then
      log_info "No update compose file found, using default compose file..."
      if [ -f "build/config/podman-compose.yml" ]; then
        COMPOSE_FILE="build/config/podman-compose.yml"
      else
        log_error "No compose file found. Cannot start containers."
        return 1
      fi
    else
      COMPOSE_FILE="build/config/podman-compose.update.yml"
    fi
    
    # Start the containers
    log_info "Starting containers with compose file: $COMPOSE_FILE"
    podman-compose -f "$COMPOSE_FILE" up -d || {
      log_error "Failed to start containers with podman-compose"
      log_info "Trying to build and start containers directly..."
      
      # Try to build and start containers directly
      cd "$REPO_ROOT"
      
      # Build backend
      log_info "Building backend container..."
      podman build -t localhost/share-things-backend:latest ./server
      
      # Build frontend
      log_info "Building frontend container..."
      podman build -t localhost/share-things-frontend:latest ./client
      
      # Start backend
      log_info "Starting backend container..."
      podman run -d --name share-things-backend -p 15001:15001 -e PORT=15001 -e LISTEN_PORT=15001 localhost/share-things-backend:latest
      
      # Start frontend
      log_info "Starting frontend container..."
      podman run -d --name share-things-frontend -p 15000:15000 localhost/share-things-frontend:latest
      
      # Wait for containers to start
      log_info "Waiting for containers to start (15 seconds)..."
      sleep 15
      
      # Check container status
      log_info "Checking container status..."
      podman ps -a
      
      # Capture logs for debugging
      log_info "Capturing container logs for debugging..."
      
      # Create logs directory if it doesn't exist
      mkdir -p logs/container-logs
      
      # Capture backend logs
      log_info "Backend container logs:"
      podman logs share-things-backend > logs/container-logs/backend-update.log 2>&1 || echo "Could not save backend logs"
      cat logs/container-logs/backend-update.log || echo "No backend logs available"
      
      # Capture frontend logs
      log_info "Frontend container logs:"
      podman logs share-things-frontend > logs/container-logs/frontend-update.log 2>&1 || echo "Could not save frontend logs"
      cat logs/container-logs/frontend-update.log || echo "No frontend logs available"
    }
  fi
  
  # Wait for the server to be fully up
  log_info "Waiting for server to be fully up (15 seconds)..."
  sleep 15
  
  # Check if containers are running now
  if ! podman ps | grep -q "share-things"; then
    log_error "Failed to start containers. Cannot verify health endpoint."
    return 1
  fi
  
  # Check the health endpoint
  log_info "Checking health endpoint at http://localhost:15001/health"
  HEALTH_RESPONSE=$(curl -s http://localhost:15001/health)
  
  # Check if the response contains "updated": true
  if echo "$HEALTH_RESPONSE" | grep -q "updated"; then
    log_success "Health endpoint was successfully updated: $HEALTH_RESPONSE"
    return 0
  else
    log_error "Health endpoint was not updated as expected. Response: $HEALTH_RESPONSE"
    log_info "Raw response: $HEALTH_RESPONSE"
    return 1
  fi
}

# Function to clean up container resources
cleanup() {
  log_info "Cleaning up container resources..."
  
  # Run uninstall
  log_info "Running uninstall..."
  cd "$REPO_ROOT"
  ./setup.sh --uninstall --non-interactive
  
  # Verify that all containers have been properly stopped and removed
  if podman ps -a | grep -q "share-things"; then
    log_error "Cleanup failed: containers still exist after uninstall"
    log_error "Please check the following containers:"
    podman ps -a | grep "share-things"
    return 1
  else
    log_success "Cleanup successful - all containers properly removed"
    return 0
  fi
}

# ===== MAIN TEST SEQUENCE =====

log_info "Starting setup.sh update verification"
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

# Save current directory
CURRENT_DIR=$(pwd)

# Change to repository root directory
cd "$REPO_ROOT"
log_info "Changed to repository root directory: $(pwd)"

# Verify containers are running from previous test
# Perform pre-operation Podman check
podman_pre_operation_check

log_info "Verifying containers are running from previous test..."
if podman ps | grep -q "share-things"; then
  log_success "Containers are running from previous test"
  podman ps | grep "share-things"
else
  log_error "No containers running from previous test"
  log_error "Please run setup-test-install.sh with --skip-cleanup first"
  exit 1
fi

# Modify the health endpoint
modify_health_endpoint

# Run setup.sh in update mode
log_info "Running setup.sh in update mode..."
log_info "Command: ./setup.sh --update --non-interactive"

# Add additional debugging
log_info "Environment Details:"
log_info "Podman version: $(podman --version)"
log_info "Podman Compose version: $(podman-compose --version)"
log_info "Available memory: $(free -m)"
log_info "Available disk space: $(df -h)"
log_info "User/Group info: $(id)"

# Check if build/config directory exists and has the right permissions
if [ ! -d "build/config" ]; then
  log_info "Creating build/config directory..."
  mkdir -p "build/config"
fi

# Ensure the directory has the right permissions
log_info "Setting permissions on build/config directory..."
chmod -R 755 "build/config"

# Add additional environment variables
export PODMAN_TIMEOUT=300
export PODMAN_ROOTLESS_ADJUST=1
log_info "Set additional environment variables"

# Run with an extended timeout to accommodate slower builds
log_info "Using extended timeout (1200s/20min)"
timeout 1200 ./setup.sh --update --non-interactive
UPDATE_EXIT_CODE=$?

# Check the exit code
if [ $UPDATE_EXIT_CODE -eq 0 ]; then
  log_success "Update executed successfully"
elif [ $UPDATE_EXIT_CODE -eq 124 ]; then
  log_warning "Update timed out"
  log_error "Update timed out and failed with exit code $UPDATE_EXIT_CODE"
  exit 1
else
  log_error "Update failed with exit code $UPDATE_EXIT_CODE"
  exit 1
fi

# Verify the health endpoint was updated
verify_health_endpoint
VERIFY_EXIT_CODE=$?

if [ $VERIFY_EXIT_CODE -eq 0 ]; then
  log_success "Update verification successful"
else
  log_error "Update verification failed"
  # Don't exit here, continue with cleanup
fi

# Always restore the original health endpoint regardless of skip-cleanup flag
log_info "Restoring original health endpoint..."
restore_health_endpoint

# Clean up containers if not skipped
if [ "$SKIP_CLEANUP" = "false" ]; then
  log_info "Performing cleanup of containers..."
  
  # Run uninstall
  log_info "Running uninstall..."
  cd "$REPO_ROOT"
  ./setup.sh --uninstall --non-interactive
  CLEANUP_EXIT_CODE=$?
  
  if [ $CLEANUP_EXIT_CODE -eq 0 ]; then
    # Verify that all containers have been properly stopped and removed
    if podman ps -a | grep -q "share-things"; then
      log_error "Cleanup failed: containers still exist after uninstall"
      log_error "Please check the following containers:"
      podman ps -a | grep "share-things"
      exit 1
    else
      log_success "Cleanup successful - all containers properly removed"
    fi
  else
    log_error "Cleanup failed with exit code $CLEANUP_EXIT_CODE"
    exit 1
  fi
else
  log_info "Skipping container cleanup as requested with --skip-cleanup"
  log_warning "Containers are still running and will need to be cleaned up manually"
fi

# Change back to original directory
cd "$CURRENT_DIR"
log_info "Changed back to original directory: $(pwd)"

if [ $VERIFY_EXIT_CODE -eq 0 ]; then
  log_success "Test passed! setup.sh update functionality works correctly."
  exit 0
else
  log_error "Test failed! setup.sh update functionality did not work as expected."
  exit 1
fi