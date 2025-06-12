#!/bin/bash
#
# setup-test-install.sh - Test script for setup.sh
#

# Source Podman cleanup functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../setup/podman-cleanup.sh"
# IMPORTANT TESTING GUIDELINES:
# 1. Tests MUST use the full setup.sh process without shortcuts or simplifications
# 2. DO NOT attempt to use any CI flags to minimize setup, remove steps, or simplify configuration
# 3. The test MUST always use setup.sh as-is to completely build and test the process
# 4. ALWAYS use bridge networking instead of host networking
# 5. DO NOT create "minimal" or "simplified" test environments - tests should verify the real thing
# 6. Tests should verify that containers are properly built, started, and accessible
# 7. If a test times out, it should fail - DO NOT try to implement fallback mechanisms
# 8. The goal is to test the actual setup process as a user would experience it
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
  
  # Set appropriate permissions
  log_info "Setting appropriate permissions"
  chmod -R 755 build
  chmod -R 777 data 2>/dev/null || true
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

# Add additional debugging for CI environment
if [ "$CI" = "true" ]; then
  log_info "CI Environment Details:"
  log_info "Podman version: $(podman --version)"
  log_info "Podman Compose version: $(podman-compose --version)"
  log_info "Available memory: $(free -m)"
  log_info "Available disk space: $(df -h)"
  log_info "User/Group info: $(id)"
  
  # Set additional environment variables for CI
  export PODMAN_TIMEOUT=300
  export PODMAN_ROOTLESS_ADJUST=1
  log_info "Set additional environment variables for CI"
  
  # Run with a much longer timeout for CI environments due to slow npm installs
  log_info "Using extended timeout (1800s/30min) for CI environment due to slow network"
  timeout 1800 ./setup.sh --non-interactive --force-install
else
  # Run with a standard timeout for local environments
  log_info "Using standard timeout (600s) for local environment"
  timeout 600 ./setup.sh --non-interactive --force-install
fi
SETUP_EXIT_CODE=$?

# Check the exit code
if [ $SETUP_EXIT_CODE -eq 0 ]; then
  log_success "Full installation executed successfully"
elif [ $SETUP_EXIT_CODE -eq 124 ]; then
  log_warning "Installation timed out"
  
  # Don't attempt to use the CI flag to minimize setup, remove steps, simplify configuration.
  # The test must always use the setup.sh, as-is, to completely build and test the process.
  # Also, use bridge networking instead of host networking.
  
  log_error "Installation timed out and failed with exit code $SETUP_EXIT_CODE"
  exit 1
  
  # Check if containers are running after the simplified setup
  CONTAINER_COUNT=$(podman ps | grep -c "share-things" || echo "0")
  if [ "$CONTAINER_COUNT" -gt 0 ]; then
    log_success "Containers are running after simplified setup"
  else
    log_error "No containers running after simplified setup"
    # Continue anyway to see if we can get more diagnostic information
  fi
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
      # Add more detailed debugging
      log_info "Detailed container inspection:"
      podman inspect share-things-frontend
      log_info "Network information:"
      podman network inspect podman
      log_info "Port information:"
      podman port share-things-frontend
      log_info "Process information inside container:"
      podman exec share-things-frontend ps aux || echo "Could not execute ps in container"
      log_info "Testing network connectivity inside container:"
      podman exec share-things-frontend wget -q -O - http://localhost:15000/health || echo "Health check failed inside container"
      
      # Capture detailed logs for frontend container
      log_info "Capturing detailed logs for frontend container:"
      podman logs share-things-frontend || echo "Could not get frontend logs"
      
      # Inspect frontend container
      log_info "Inspecting frontend container:"
      podman inspect share-things-frontend || echo "Could not inspect frontend container"
      
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
    
    # Capture detailed logs for backend container
    log_info "Capturing detailed logs for backend container:"
    podman logs share-things-backend || echo "Could not get backend logs"
    
    # Inspect backend container
    log_info "Inspecting backend container:"
    podman inspect share-things-backend || echo "Could not inspect backend container"
    
    BACKEND_HEALTHY=false
  fi
  
  # Overall health check result
  if [ "$FRONTEND_HEALTHY" = "true" ] && [ "$BACKEND_HEALTHY" = "true" ]; then
    log_success "All container health checks passed successfully"
  else
    log_error "Some container health checks failed"
    
    # Check if logs directory exists, create if not
    mkdir -p logs/container-logs
    
    # Save container logs to files for later analysis
    log_info "Saving container logs to logs/container-logs directory"
    podman logs share-things-frontend > logs/container-logs/frontend-failed.log 2>&1 || echo "Could not save frontend logs"
    podman logs share-things-backend > logs/container-logs/backend-failed.log 2>&1 || echo "Could not save backend logs"
    
    exit 1
  fi
else
  log_error "No containers found running after installation"
  log_info "Checking for stopped containers:"
  podman ps -a | grep "share-things" || echo "No containers found"
  log_error "Installation failed: containers are not running"
  exit 1
fi

# Clean up after the test if not skipped
if [ "$SKIP_CLEANUP" = "false" ]; then
  log_info "Step 2.5: Cleaning up after test"
  log_info "Command: ./setup.sh --uninstall --non-interactive"

  # Create a temporary log file for cleanup output
  # Create logs directory if it doesn't exist
  mkdir -p "logs/test"
  TEMP_LOG_FILE="logs/test/setup-cleanup-output.log"
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
else
  log_info "Skipping cleanup as requested with --skip-cleanup"
  log_warning "Containers are still running and will need to be cleaned up manually or by another script"
fi

# Change back to original directory
cd "$CURRENT_DIR"
log_info "Changed back to original directory: $(pwd)"

log_success "Test passed! setup.sh exists, is executable, and containers are running and healthy."
exit 0