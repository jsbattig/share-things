#!/bin/bash

# ShareThings Setup and Management Script
# This script handles installation, updates, and management of ShareThings application
# Podman-only implementation

# Script name for logging
SCRIPT_NAME=$(basename "$0")

# Determine repository root
REPO_ROOT=$(dirname "$(readlink -f "$0")")
export REPO_ROOT

# Default values
INSTALL_MODE="install"
NON_INTERACTIVE="false"
FORCE_MODE="false"
PRODUCTION_MODE="false"
EXPOSE_PORTS="false"
PROTOCOL="http"
COMPOSE_CMD="podman-compose"
CONTAINER_CMD="podman"
COMPOSE_FILE="build/config/podman-compose.yml"
FORCE_INSTALL="false"
DEBUG_MODE="false"

# Export INSTALL_MODE so it's available to all functions
export INSTALL_MODE

# Source the module scripts
source setup/common.sh
source setup/config.sh
source setup/containers.sh
source setup/operations.sh

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --reinstall)
            INSTALL_MODE="reinstall"
            shift
            ;;
        --uninstall)
            INSTALL_MODE="uninstall"
            shift
            ;;
        --hostname=*)
            HOSTNAME_ARG="${1#*=}"
            shift
            ;;
        --frontend-port=*)
            FRONTEND_PORT_ARG="${1#*=}"
            shift
            ;;
        --backend-port=*)
            BACKEND_PORT_ARG="${1#*=}"
            shift
            ;;
        --api-port=*)
            API_PORT_ARG="${1#*=}"
            shift
            ;;
        --https)
            PROTOCOL="https"
            HTTPS_ARG="true"
            shift
            ;;
        --expose-ports)
            EXPOSE_PORTS="true"
            shift
            ;;
        --production)
            PRODUCTION_MODE="true"
            shift
            ;;
        --non-interactive)
            NON_INTERACTIVE="true"
            shift
            ;;
        --force)
            FORCE_MODE="true"
            shift
            ;;
        --force-install)
            FORCE_INSTALL="true"
            shift
            ;;
        --debug)
            DEBUG_MODE="true"
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution flow based on mode
# Perform Podman pre-operation check and cleanup if needed
podman_pre_operation_check

check_podman

# If debug mode is enabled, show more verbose output
if [ "$DEBUG_MODE" = "true" ]; then
    echo "Debug mode enabled - showing verbose output"
    
    # Create a debug log file with a fixed name to avoid command substitution issues
    # Create logs directory if it doesn't exist
    mkdir -p "logs"
    DEBUG_LOG_FILE="logs/setup-debug.log"
    # Remove any existing log file
    rm -f "$DEBUG_LOG_FILE"
    # Create a new log file with a header
    echo "=== Debug Log Started ===" > "$DEBUG_LOG_FILE"
    # Redirect output to the log file and console
    exec > >(tee -a "$DEBUG_LOG_FILE") 2>&1
    
    # Print system information without using set -x to avoid command substitution issues
    echo "=== System Information ==="
    echo "Date: $(date)"
    echo "Hostname: $(hostname)"
    echo "Kernel: $(uname -a)"
    echo "Podman version: $(podman --version)"
    echo "Podman Compose version: $(podman-compose --version)"
    echo "Current directory: $(pwd)"
    echo "Current user: $(whoami)"
    echo "Available disk space:"
    df -h
    echo "=========================="
    
    # Enable command tracing after the system information has been printed
    # This way the command substitution won't be displayed in the output
    set -x
fi

case $INSTALL_MODE in
    "install")
        # Check if already installed
        if check_installation && [ "$FORCE_INSTALL" != "true" ]; then
            log_error "ShareThings is already installed."
            log_info "Use --reinstall to remove and reinstall."
            log_info "Or use --force-install to force a fresh installation."
            exit 1
        fi
        
        # If force install is enabled, clean up first
        if [ "$FORCE_INSTALL" == "true" ]; then
            log_warning "Force install enabled. Cleaning up existing installation..."
            perform_uninstall
        fi
        
        log_info "Starting ShareThings installation..."
        perform_installation
        ;;
        
    "reinstall")
        # Check if installed
        if ! check_installation; then
            log_error "ShareThings is not installed. Cannot reinstall."
            log_info "Use the script without flags to perform a fresh installation."
            exit 1
        fi
        
        log_info "Starting ShareThings reinstallation..."
        
        # Capture current configuration
        capture_current_configuration
        
        # Perform uninstall
        perform_uninstall
        
        # Perform installation
        perform_installation
        ;;
        
    "uninstall")
        # Check if installed
        if ! check_installation; then
            log_error "ShareThings is not installed. Nothing to uninstall."
            exit 0
        fi
        
        log_info "Starting ShareThings uninstallation..."
        perform_uninstall
        ;;
esac

log_info "Script execution completed."