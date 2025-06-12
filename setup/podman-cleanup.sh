#!/bin/bash

# Podman Cleanup and State Reset Functions for CI/CD
# This script provides comprehensive Podman cleanup functions to resolve state corruption issues

# Text colors for logging
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[PODMAN-CLEANUP]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[PODMAN-CLEANUP]${NC} $1"
}

log_error() {
    echo -e "${RED}[PODMAN-CLEANUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PODMAN-CLEANUP]${NC} $1"
}

# Hard cleanup and Podman state reset function
podman_hard_cleanup_and_reset() {
    log_info "=== Starting Podman Hard Cleanup and State Reset ==="
    
    # Step 1: Force stop and remove all containers
    log_info "Step 1: Force stopping and removing all containers..."
    podman stop --all --time 5 2>/dev/null || log_warning "Failed to stop all containers"
    podman rm -f --all 2>/dev/null || log_warning "Failed to remove all containers"
    
    # Step 2: Remove all images
    log_info "Step 2: Removing all images..."
    podman rmi -f --all 2>/dev/null || log_warning "Failed to remove all images"
    
    # Step 3: Clean up networks
    log_info "Step 3: Cleaning up networks..."
    podman network prune -f 2>/dev/null || log_warning "Failed to prune networks"
    
    # Step 4: Clean up volumes
    log_info "Step 4: Cleaning up volumes..."
    podman volume prune -f 2>/dev/null || log_warning "Failed to prune volumes"
    
    # Step 5: System prune
    log_info "Step 5: Performing system prune..."
    podman system prune -a -f --volumes 2>/dev/null || log_warning "Failed to perform system prune"
    
    # Step 6: Reset Podman state
    log_info "Step 6: Resetting Podman state..."
    podman system migrate 2>/dev/null || log_warning "Podman migrate completed with warnings"
    podman system reset --force 2>/dev/null || log_warning "Podman reset completed with warnings"
    
    # Step 7: Clean up storage directories
    log_info "Step 7: Cleaning up storage directories..."
    rm -rf ~/.local/share/containers/storage/overlay-containers/* 2>/dev/null || true
    rm -rf ~/.local/share/containers/storage/overlay-images/* 2>/dev/null || true
    rm -rf ~/.local/share/containers/storage/overlay-layers/* 2>/dev/null || true
    rm -rf ~/.local/share/containers/storage/vfs-containers/* 2>/dev/null || true
    rm -rf ~/.local/share/containers/storage/vfs-images/* 2>/dev/null || true
    rm -rf ~/.local/share/containers/storage/vfs-layers/* 2>/dev/null || true
    
    # Step 8: Restart Podman service if available
    log_info "Step 8: Attempting to restart Podman service..."
    systemctl --user restart podman.socket 2>/dev/null || log_warning "Could not restart Podman service"
    sleep 2
    
    # Step 9: Verify Podman is working
    log_info "Step 9: Verifying Podman functionality..."
    if podman info >/dev/null 2>&1; then
        log_success "Podman is working correctly after cleanup"
    else
        log_warning "Podman may still have issues, but continuing..."
    fi
    
    log_success "=== Podman Hard Cleanup and State Reset Complete ==="
}

# Light cleanup and state reset function (for less aggressive cleanup)
podman_light_cleanup_and_reset() {
    log_info "=== Starting Podman Light Cleanup and State Reset ==="
    
    # Step 1: Reset Podman state first
    log_info "Step 1: Resetting Podman state..."
    podman system migrate 2>/dev/null || log_warning "Podman migrate completed with warnings"
    podman system reset --force 2>/dev/null || log_warning "Podman reset completed with warnings"
    
    # Step 2: Clean up dangling resources
    log_info "Step 2: Cleaning up dangling resources..."
    podman container prune -f 2>/dev/null || log_warning "Failed to prune containers"
    podman image prune -f 2>/dev/null || log_warning "Failed to prune images"
    podman network prune -f 2>/dev/null || log_warning "Failed to prune networks"
    podman volume prune -f 2>/dev/null || log_warning "Failed to prune volumes"
    
    # Step 3: Restart Podman service if available
    log_info "Step 3: Attempting to restart Podman service..."
    systemctl --user restart podman.socket 2>/dev/null || log_warning "Could not restart Podman service"
    sleep 1
    
    # Step 4: Verify Podman is working
    log_info "Step 4: Verifying Podman functionality..."
    if podman info >/dev/null 2>&1; then
        log_success "Podman is working correctly after light cleanup"
    else
        log_warning "Podman may still have issues, attempting hard cleanup..."
        podman_hard_cleanup_and_reset
    fi
    
    log_success "=== Podman Light Cleanup and State Reset Complete ==="
}

# Pre-operation Podman check and reset
podman_pre_operation_check() {
    log_info "=== Podman Pre-Operation Check ==="
    
    # Check if Podman is working
    if ! podman info >/dev/null 2>&1; then
        log_warning "Podman not working properly, performing light cleanup..."
        podman_light_cleanup_and_reset
    else
        log_success "Podman is working correctly"
    fi
}

# Export functions for use in other scripts
export -f podman_hard_cleanup_and_reset
export -f podman_light_cleanup_and_reset
export -f podman_pre_operation_check
export -f log_info
export -f log_warning
export -f log_error
export -f log_success