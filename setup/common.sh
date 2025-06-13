#!/bin/bash

# Common utilities for ShareThings setup scripts

# Version
VERSION="1.0.0"

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses BSD sed which requires an extension argument for -i
    SED_CMD="sed -i.bak"
else
    # Linux and others use GNU sed
    SED_CMD="sed -i"
fi

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

# Show help message
show_help() {
    echo "ShareThings Setup and Management Script v${VERSION}"
    echo ""
    echo "Usage: $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo "Mode Selection:"
    echo "  --reinstall           Remove and reinstall"
    echo "  --uninstall           Remove the installation"
    echo "  (no flag)             Perform a fresh installation"
    echo ""
    echo "Configuration Parameters:"
    echo "  --hostname=VALUE      Set the hostname (or 'auto' for auto-detection)"
    echo "  --frontend-port=VALUE Set the frontend port"
    echo "  --backend-port=VALUE  Set the backend port"
    echo "  --api-port=VALUE      Set the API port"
    echo "  --https               Use HTTPS instead of HTTP"
    echo "  --expose-ports        Expose container ports to host"
    echo ""
    echo "Other Options:"
    echo "  --non-interactive     Run in non-interactive mode (use defaults or provided values)"
    echo "  --force               Force operation without confirmation"
    echo "  --force-install       Force installation even if already installed (for testing)"
    echo "  --help                Show this help message"
}

# Check if Podman is installed
check_podman() {
    if ! command -v podman &> /dev/null; then
        log_error "Podman is not installed."
        log_info "Please install Podman before running this script."
        exit 1
    fi
    
    if ! command -v podman-compose &> /dev/null; then
        log_error "Podman Compose is not installed."
        log_info "Please install Podman Compose before running this script."
        exit 1
    fi
    
    # Use the centralized Podman check function
    podman_pre_operation_check
    
    log_success "Podman $(podman --version) and Podman Compose are installed."
}

# Check if ShareThings is already installed
check_installation() {
    # Check for running containers
    if podman ps | grep -q "share-things"; then
        return 0  # Installation found with running containers
    fi
    
    # Check for stopped containers
    if podman ps -a | grep -q "share-things"; then
        # There are stopped containers, consider it installed
        return 0
    fi
    
    # Check for configuration files with valid content
    if [ -f .env ] && [ -f client/.env ] && [ -f server/.env ]; then
        # Check if .env has some basic configuration
        if grep -q "API_URL" .env && grep -q "SOCKET_URL" .env; then
            return 0  # Installation found with valid config
        fi
    fi
    
    # For testing purposes, let's force it to return "not installed" only if FORCE_MODE is true
    # This will allow our tests to run properly
    if [ "$FORCE_MODE" == "true" ]; then
        log_info "Forcing installation check to return 'not installed' for testing"
        return 1
    fi
    
    return 1  # No installation found
}

# Clean up any backup files created by sed
cleanup_backup_files() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        log_info "Cleaning up backup files..."
        find . -name "*.bak" -type f -delete
        log_success "Backup files removed."
    fi
}