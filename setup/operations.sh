#!/bin/bash

# Operation functions for ShareThings setup scripts (install, update, uninstall)

# Perform installation
perform_installation() {
    # Create environment files
    create_env_files
    
    # Configure hostname
    configure_hostname
    
    # Configure HTTPS
    configure_https
    
    # Configure ports
    configure_ports
    
    # Update environment files
    update_env_files
    
    # Make the docker-entrypoint.sh script executable
    if [ -f "client/docker-entrypoint.sh" ]; then
        chmod +x client/docker-entrypoint.sh
        log_success "Made client/docker-entrypoint.sh executable."
    else
        log_warning "Warning: client/docker-entrypoint.sh not found. Container networking might have issues."
    fi
    
    # Make the docker-entrypoint.sh script executable
    if [ -f "client/docker-entrypoint.sh" ]; then
        chmod +x client/docker-entrypoint.sh
        log_success "Made client/docker-entrypoint.sh executable."
    else
        log_warning "Warning: client/docker-entrypoint.sh not found. Container networking might have issues."
    fi
    
    # Build and start containers
    build_and_start_containers
    
    # Verify containers
    verify_containers
    
    # Display next steps
    echo ""
    echo -e "${BLUE}=== Next Steps ===${NC}"
    
    if [ "$EXPOSE_PORTS" = "true" ]; then
        echo "You can access the application at:"
        echo "- Frontend: ${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT} (container port 15000)"
        echo "- Backend: ${PROTOCOL}://${HOSTNAME}:${BACKEND_PORT} (container port ${API_PORT})"
        
        # Verify that the correct ports are being used
        echo ""
        echo -e "${YELLOW}Verifying port mappings:${NC}"
        podman port share-things-frontend
        podman port share-things-backend
        
        # Display deployment information
        echo ""
        echo -e "${GREEN}Running in production-optimized mode.${NC}"
        echo "Containers use optimized builds from Dockerfiles with data persistence via volume mounts."
        echo "The application data persists across container restarts and updates."
    else
        echo "The containers are running, but ports are not exposed to the host."
        echo "Make sure your HAProxy is properly configured to route traffic to the containers."
    fi
    
    log_success "Installation complete!"
    
    # Add a function to check container status at any time
    echo ""
    echo -e "${BLUE}=== Container Status Check ===${NC}"
    echo "You can check container status at any time by running:"
    echo "  podman ps --filter label=io.podman.compose.project=share-things"
    echo ""
    echo "If containers aren't running, you can view error logs with:"
    echo "  podman logs share-things-frontend"
    echo "  podman logs share-things-backend"
    echo ""
    echo "To restart the containers:"
    echo "  podman-compose -f build/config/podman-compose.yml down && podman-compose -f build/config/podman-compose.yml up -d"
    
    # Clean up any backup files created by sed
    cleanup_backup_files
}



# Perform uninstall
perform_uninstall() {
    log_info "Uninstalling ShareThings..."
    
    # Determine which compose file to use
    if [ -f build/config/podman-compose.prod.yml ]; then
        COMPOSE_FILE="build/config/podman-compose.prod.yml"
    elif [ -f build/config/podman-compose.prod.temp.yml ]; then
        COMPOSE_FILE="build/config/podman-compose.prod.temp.yml"
    elif [ -f build/config/podman-compose.update.yml ]; then
        COMPOSE_FILE="build/config/podman-compose.update.yml"
    else
        COMPOSE_FILE="build/config/podman-compose.yml"
    fi
    
    # Stop and remove containers
    # This function is defined in setup/containers.sh, but we'll add it here as a fallback
    if ! type stop_containers &>/dev/null; then
        stop_containers() {
            log_info "Stopping running containers..."
            
            # Stop all containers at once
            podman stop --all --time 10 2>/dev/null || log_warning "Failed to stop all containers"
            
            # Try to stop specific containers by name
            podman stop --time 10 share-things-frontend 2>/dev/null || log_warning "Failed to stop frontend container"
            podman stop --time 10 share-things-backend 2>/dev/null || log_warning "Failed to stop backend container"
            
            # Remove all containers at once
            podman rm -f --all 2>/dev/null || log_warning "Failed to remove all containers"
            
            # Try to remove specific containers by name
            podman rm -f share-things-frontend 2>/dev/null || log_warning "Failed to remove frontend container"
            podman rm -f share-things-backend 2>/dev/null || log_warning "Failed to remove backend container"
            
            log_success "All containers stopped successfully."
        }
    fi
    
    stop_containers
    
    # Clean container images
    # This function is defined in setup/containers.sh, but we'll add it here as a fallback
    if ! type clean_container_images &>/dev/null; then
        clean_container_images() {
            log_info "Cleaning container image cache..."
            
            # Remove dangling images (not used by any container)
            podman image prune -f
            log_success "Podman dangling images removed."
            
            # Perform full cleanup automatically in autonomous mode
            log_info "Performing full Podman system prune..."
            podman system prune -f
            log_success "Podman system cache cleaned."
        }
    fi
    
    clean_container_images
    
    # Ask if want to remove configuration files
    if [ "$NON_INTERACTIVE" != "true" ] && [ "$FORCE_MODE" != "true" ]; then
        read -p "Do you want to remove configuration files? (y/n): " REMOVE_CONFIG
        if [[ $REMOVE_CONFIG =~ ^[Yy]$ ]]; then
            log_info "Removing configuration files..."
            rm -f .env client/.env server/.env
            rm -f "$(pwd)/build/config/podman-compose.prod.yml" "$(pwd)/build/config/podman-compose.prod.temp.yml" "$(pwd)/build/config/podman-compose.update.yml"
            log_success "Configuration files removed."
        fi
    fi
    
    log_success "ShareThings has been uninstalled."
}