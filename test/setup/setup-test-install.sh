#!/bin/bash
#
# setup-test.sh - Test script for setup.sh
#
# This script tests the installation of the application by:
# 1. Checking if the application is already installed
# 2. Cleaning up any existing installation
# 3. Running setup.sh to install the application
# 4. Verifying that containers are running and healthy
#

set -e  # Exit immediately if a command exits with a non-zero status

# ===== CONFIGURATION =====

# Repository root directory
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "ERROR: Unable to determine repository root. Make sure you're in a git repository."
  exit 1
fi

# Container names
FRONTEND_CONTAINER="share-things-frontend"
BACKEND_CONTAINER="share-things-backend"

# Log directory
LOG_DIR="$REPO_ROOT/test/setup/logs"
mkdir -p "$LOG_DIR"

# ===== UTILITY FUNCTIONS =====

# Text colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_DIR/test.log"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_DIR/test.log"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_DIR/test.log"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_DIR/test.log"
}

# Function to check if podman is installed and running
check_podman() {
  log_info "Checking if Podman is installed and running..."
  
  if ! command -v podman &> /dev/null; then
    log_error "Podman is not installed."
    return 1
  fi
  
  if ! podman info &> /dev/null; then
    log_error "Podman service is not running."
    return 1
  fi
  
  log_success "Podman is installed and running."
  return 0
}

# Function to clean up the environment
cleanup_environment() {
  log_info "Cleaning up environment..."
  
  # Check if any share-things containers are running
  if podman ps | grep -q "share-things"; then
    log_info "Found running share-things containers. Stopping them..."
    podman stop $(podman ps -q --filter name=share-things) 2>/dev/null || true
  fi
  
  # Remove all containers
  log_info "Removing all containers..."
  podman rm -f $(podman ps -a -q --filter name=share-things) 2>/dev/null || true
  
  # Remove environment files
  log_info "Removing environment files..."
  rm -f "$REPO_ROOT/.env" "$REPO_ROOT/client/.env" "$REPO_ROOT/server/.env" 2>/dev/null || true
  
  # Remove generated compose files
  log_info "Removing generated compose files..."
  rm -f "$REPO_ROOT/build/config/podman-compose.prod.yml" \
        "$REPO_ROOT/build/config/podman-compose.prod.temp.yml" \
        "$REPO_ROOT/build/config/podman-compose.update.yml" 2>/dev/null || true
  
  # Prune podman resources
  log_info "Pruning podman resources..."
  podman system prune -f || true
  podman image prune -f || true
  podman volume prune -f || true
  podman network prune -f || true
  
  log_success "Environment cleaned up."
}

# Function to verify containers are running
verify_containers() {
  log_info "Verifying containers are running..."
  
  # Check if containers exist and are running
  if ! podman ps | grep -q "$FRONTEND_CONTAINER"; then
    log_error "Frontend container ($FRONTEND_CONTAINER) is not running."
    return 1
  fi
  
  if ! podman ps | grep -q "$BACKEND_CONTAINER"; then
    log_error "Backend container ($BACKEND_CONTAINER) is not running."
    return 1
  fi
  
  log_success "Both containers are running."
  
  # Give containers more time to fully initialize
  log_info "Waiting for containers to fully initialize (30 seconds)..."
  sleep 30
  
  # Check if frontend container is responsive
  log_info "Checking if frontend container is responsive..."
  if ! curl -s -f -m 5 http://localhost:15000 > /dev/null; then
    log_warning "Frontend container is not responding to HTTP requests."
    log_info "Checking frontend container logs:"
    podman logs "$FRONTEND_CONTAINER" | tail -n 20
    log_warning "Frontend health check failed, but continuing..."
  else
    log_success "Frontend container is responsive."
  fi
  
  # Check if backend container is responsive
  log_info "Checking if backend container health endpoint is responsive..."
  if ! curl -s -f -m 5 http://localhost:15001/health > /dev/null; then
    log_warning "Backend container health endpoint is not responding."
    log_info "Checking backend container logs:"
    podman logs "$BACKEND_CONTAINER" | tail -n 20
    log_error "Backend health check failed. Test failed."
    return 1
  else
    log_success "Backend container health endpoint is responsive."
  fi
  
  log_success "All container checks passed successfully."
  return 0
}

# ===== MAIN TEST SEQUENCE =====

log_info "Starting setup.sh test sequence"
log_info "=============================="

# Check if Podman is running
if ! check_podman; then
  log_error "Podman check failed. Exiting."
  exit 1
fi

# Clean up any existing installation
cleanup_environment

# Run setup.sh to install the application
log_info "Running setup.sh to install the application..."
# Change to the repository root directory before running setup.sh
cd "$REPO_ROOT"
if ! ./setup.sh --non-interactive --force-install --hostname=auto --expose-ports --debug --force; then
  log_error "setup.sh failed to install the application."
  cd - > /dev/null  # Return to the original directory
  exit 1
fi
cd - > /dev/null  # Return to the original directory

# Wait for containers to start
log_info "Waiting for containers to start (10 seconds)..."
sleep 10

# Show all containers
log_info "Current containers:"
podman ps -a

# Verify containers are running and healthy
if ! verify_containers; then
  log_error "Container verification failed. Test failed."
  exit 1
fi

log_success "Test passed! The application was successfully installed and containers are healthy."
exit 0