#!/bin/bash
#
# setup-test-install.sh - Minimal test script for setup.sh
#
# This script tests the basic functionality of setup.sh by:
# 1. Checking if podman is installed
# 2. Running setup.sh with minimal options
# 3. Verifying that containers are created
#

set -e  # Exit immediately if a command exits with a non-zero status

# ===== CONFIGURATION =====

# Determine if we're running in CI
if [ "$CI" = "true" ]; then
  echo "Running in CI environment"
  # In CI, use the current directory
  REPO_ROOT=$(pwd)
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

# Function to clean up any existing containers
cleanup_containers() {
  log_info "Cleaning up any existing containers..."
  
  # Stop and remove any existing share-things containers
  if podman ps -a | grep -q "share-things"; then
    log_info "Found existing share-things containers. Removing them..."
    podman stop $(podman ps -a -q --filter name=share-things) 2>/dev/null || true
    podman rm -f $(podman ps -a -q --filter name=share-things) 2>/dev/null || true
  else
    log_info "No existing share-things containers found."
  fi
  
  # Prune networks to clean up
  podman network prune -f || true
  
  log_success "Cleanup completed."
}

# ===== MAIN TEST SEQUENCE =====

log_info "Starting minimal setup.sh test"
log_info "=============================="

# Check if Podman is running
if ! check_podman; then
  log_error "Podman check failed. Exiting."
  exit 1
fi

# Clean up any existing containers
cleanup_containers

# Make setup.sh executable
if [ -f "$REPO_ROOT/setup.sh" ]; then
  chmod +x "$REPO_ROOT/setup.sh"
  log_info "Made setup.sh executable"
else
  log_error "setup.sh not found at $REPO_ROOT/setup.sh"
  exit 1
fi

# Run setup.sh with minimal options
log_info "Running setup.sh with minimal options..."
cd "$REPO_ROOT"

# Use a timeout to prevent hanging
if [ "$CI" = "true" ]; then
  log_info "Running with timeout in CI environment"
  timeout 120 ./setup.sh --non-interactive --force-install --hostname=localhost --debug || {
    log_error "setup.sh failed or timed out"
    exit 1
  }
else
  ./setup.sh --non-interactive --force-install --hostname=localhost --debug || {
    log_error "setup.sh failed"
    exit 1
  }
fi

# Check if containers were created
log_info "Checking if containers were created..."
if podman ps -a | grep -q "share-things"; then
  log_success "Containers were created successfully."
else
  log_error "No share-things containers were found."
  exit 1
fi

log_success "Test passed! setup.sh created containers successfully."
exit 0