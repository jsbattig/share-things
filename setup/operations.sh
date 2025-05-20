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
        
        # Display mode information
        if [ "$PRODUCTION_MODE" == "true" ]; then
            echo ""
            echo -e "${GREEN}Running in production mode (no volume mounts).${NC}"
            echo "This means the containers are using the built files from the Dockerfile."
            echo "Any changes to the source code will require rebuilding the containers."
        else
            echo ""
            echo -e "${YELLOW}Running in development mode (with volume mounts).${NC}"
            echo "This means the containers are using the local source code."
            echo "Changes to the source code will be reflected in the containers."
            echo ""
            echo -e "${YELLOW}Note for Podman users:${NC}"
            echo "If you encounter errors like 'Cannot find module '/app/dist/index.js'', try:"
            echo "1. Stop the containers: podman-compose down"
            echo "2. Restart in production mode: ./setup.sh --production"
        fi
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

# Perform update
perform_update() {
    echo "=== Starting update process with detailed logging ==="
    echo "Current time: $(date)"
    
    # Backup current configuration
    echo "Step 1: Backing up current configuration..."
    backup_configuration
    
    # Pull latest code
    echo "Step 2: Pulling latest code from repository..."
    pull_latest_code
    
    # Log git status and last commit
    if [ -d .git ]; then
        echo "Git repository information:"
        echo "Current branch: $(git branch --show-current)"
        echo "Last commit: $(git log -1 --pretty=format:'%h - %s (%cr) <%an>')"
        echo "Modified files:"
        git status --porcelain
    fi
    
    # Capture current configuration
    echo "Step 3: Capturing current configuration..."
    capture_current_configuration
    
    # Determine which compose file to use
    if [ -f build/config/podman-compose.prod.yml ]; then
        COMPOSE_FILE="build/config/podman-compose.prod.yml"
    elif [ -f build/config/podman-compose.prod.temp.yml ]; then
        COMPOSE_FILE="build/config/podman-compose.prod.temp.yml"
    else
        COMPOSE_FILE="build/config/podman-compose.yml"
    fi
    
    # Stop containers
    stop_containers
    
    # Clean container images
    clean_container_images
    
    # Update environment files
    update_env_files
    
    # Make the docker-entrypoint.sh script executable
    if [ -f "client/docker-entrypoint.sh" ]; then
        chmod +x client/docker-entrypoint.sh
        log_success "Made client/docker-entrypoint.sh executable."
    else
        log_warning "Warning: client/docker-entrypoint.sh not found. Container networking might have issues."
    fi
    
    # Set default values for ports if not provided
    FRONTEND_PORT=${FRONTEND_PORT:-15000}
    BACKEND_PORT=${BACKEND_PORT:-15001}
    API_PORT=${API_PORT:-15001}
    
    # For podman, create a complete docker-compose file to ensure proper port mapping
    log_info "Creating a comprehensive podman-compose file for update..."
    log_info "Using ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}, API=${API_PORT}"
    # Create a temporary but complete docker-compose file specifically for the update
    cat > build/config/podman-compose.update.yml << EOL
# Update configuration for ShareThings Podman Compose

services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT:-15001}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=production
      - PORT=${API_PORT:-15001}
      - LISTEN_PORT=${API_PORT:-15001}
    ports:
      - "${BACKEND_PORT}:${API_PORT}"  # This will use 15001:15001 for production
    restart: always
    networks:
      app_network:
        aliases:
          - backend
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT:-15001}
        - VITE_API_PORT=${API_PORT:-15001}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT:-15001}
    ports:
      - "${FRONTEND_PORT}:15000"  # This will use 15000:15000 for production
    restart: always
    depends_on:
      - backend
    networks:
      app_network:
        aliases:
          - frontend
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

# Explicit network configuration
networks:
  app_network:
    driver: bridge

# Named volumes for node_modules
volumes:
  volume-backend-node-modules:
  volume-frontend-node-modules:
EOL
    log_success "Comprehensive build/config/podman-compose.update.yml created."
    
    # Export API_PORT as VITE_API_PORT to ensure it's available during build
    export VITE_API_PORT="${API_PORT}"
    log_info "Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT, VITE_API_PORT=$VITE_API_PORT"
    
    # Build and run containers with explicitly passed environment variables
    log_info "Step 8: Building containers with comprehensive configuration..."
    # Use a fixed path without command substitution
    COMPOSE_UPDATE_PATH="./build/config/podman-compose.update.yml"
    
    # Create the directory if it doesn't exist
    mkdir -p "./build/config"
    
    # Create the update compose file
    cat > "$COMPOSE_UPDATE_PATH" << EOF
# Update configuration for ShareThings Podman Compose
version: '3'

services:
  backend:
    build:
      context: ../../server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=development
      - PORT=${API_PORT}
    ports:
      - "${BACKEND_PORT}:${API_PORT}"
    restart: always
    networks:
      app_network:
        aliases:
          - backend

  frontend:
    build:
      context: ../../client
      dockerfile: Dockerfile
      args:
        - API_URL=${PROTOCOL}://${HOSTNAME}
        - SOCKET_URL=${PROTOCOL}://${HOSTNAME}
        - API_PORT=${API_PORT}
        - VITE_API_PORT=${API_PORT}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT}
    ports:
      - "${FRONTEND_PORT}:15000"
    restart: always
    depends_on:
      - backend
    networks:
      app_network:
        aliases:
          - frontend

networks:
  app_network:
    driver: bridge
EOF
    
    log_info "Created update compose file: $COMPOSE_UPDATE_PATH"
    echo "Running: podman-compose -f \"$COMPOSE_UPDATE_PATH\" build --no-cache"
    
    # Build the containers
    log_info "Using compose file: $COMPOSE_UPDATE_PATH"
    echo "Running: podman-compose -f \"$COMPOSE_UPDATE_PATH\" build --no-cache"
    podman-compose -f "$COMPOSE_UPDATE_PATH" build --no-cache
    BUILD_EXIT_CODE=$?
    
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        log_error "Container build failed with exit code $BUILD_EXIT_CODE"
        echo "Build logs:"
        podman logs podman-build 2>&1 || echo "No build logs available"
        # Don't exit here, try to continue with existing images
        log_warning "Attempting to continue with existing images"
    else
        log_success "Container build completed successfully"
    fi
    BUILD_EXIT_CODE=$?
    echo "Build exit code: $BUILD_EXIT_CODE"
    
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        log_error "Container build failed with exit code $BUILD_EXIT_CODE"
        echo "Build logs:"
        podman logs podman-build 2>&1 || echo "No build logs available"
    else
        log_success "Container build completed successfully"
    fi
    
    log_info "Step 9: Starting containers with explicit environment variables..."
    # Use the same variable for consistency
    echo "Running: FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f \"$COMPOSE_UPDATE_PATH\" up -d"
    # Directly pass environment variables to the compose command
    # Use the same approach for starting containers
    log_info "Starting containers with update configuration"
    
    # Export the variables to ensure they're available to podman-compose
    export FRONTEND_PORT
    export BACKEND_PORT
    export API_PORT
    
    # Start the containers
    log_info "Starting containers with update configuration"
    echo "Running: podman-compose -f \"$COMPOSE_UPDATE_PATH\" up -d"
    podman-compose -f "$COMPOSE_UPDATE_PATH" up -d
    UP_EXIT_CODE=$?
    
    if [ $UP_EXIT_CODE -ne 0 ]; then
        log_error "Container startup failed with exit code $UP_EXIT_CODE"
        echo "Container logs:"
        podman logs share-things-frontend 2>&1 || echo "No frontend logs available"
        podman logs share-things-backend 2>&1 || echo "No backend logs available"
        # This is a critical error, but we'll continue to show diagnostics
        log_warning "Container startup failed, but continuing for diagnostics"
    else
        log_success "Containers started successfully"
    fi
    
    # No dummy containers - always use real containers for all environments
    log_info "Using real containers for all environments"
    UP_EXIT_CODE=$?
    echo "Up exit code: $UP_EXIT_CODE"
    
    if [ $UP_EXIT_CODE -ne 0 ]; then
        log_error "Container startup failed with exit code $UP_EXIT_CODE"
    else
        log_success "Containers started successfully"
    fi
    
    COMPOSE_FILE="build/config/podman-compose.update.yml"
    
    # Add additional debugging for port configuration
    log_info "Verifying port configuration..."
    echo -e "Expected configuration:"
    echo -e "  Frontend Port: ${FRONTEND_PORT} (should be 15000 for production)"
    echo -e "  Backend Port: ${BACKEND_PORT} (should be 15001 for production)"
    echo -e "  API Port: ${API_PORT} (should be 15001 for production)"
    
    # Add explicit warning if ports don't match expected production values
    if [[ "$PRODUCTION_MODE" == "true" ]]; then
        if [[ "$FRONTEND_PORT" != "15000" ]]; then
            log_warning "Frontend port ${FRONTEND_PORT} does not match expected production port 15000"
            log_info "Forcing frontend port to 15000 for production deployment"
            FRONTEND_PORT=15000
        fi
        
        if [[ "$BACKEND_PORT" != "15001" ]]; then
            log_warning "Backend port ${BACKEND_PORT} does not match expected production port 15001"
            log_info "Forcing backend port to 15001 for production deployment"
            BACKEND_PORT=15001
        fi
        
        if [[ "$API_PORT" != "15001" ]]; then
            log_warning "API port ${API_PORT} does not match expected production port 15001"
            log_info "Forcing API port to 15001 for production deployment"
            API_PORT=15001
        fi
        
        log_success "Verified production port configuration:"
        echo -e "  Frontend Port: ${FRONTEND_PORT}"
        echo -e "  Backend Port: ${BACKEND_PORT}"
        echo -e "  API Port: ${API_PORT}"
    fi
    
    # Verify containers
    echo "Step 10: Verifying containers..."
    verify_containers
    
    # List all images to verify they were rebuilt
    echo "Step 11: Listing all container images..."
    podman images | grep share-things || echo "No share-things images found"
    
    # Clean up any temporary files created during the update
    if [ -f build/config/podman-compose.update.yml ]; then
        log_info "Cleaning up temporary files..."
        # Keep the file for reference in case of issues
        cp build/config/podman-compose.update.yml build/config/podman-compose.update.yml.bak
        log_success "build/config/podman-compose.update.yml saved as build/config/podman-compose.update.yml.bak for reference."
    fi
    
    # Clean up any backup files created by sed
    cleanup_backup_files
    
    echo "=== Update process completed ==="
    echo "End time: $(date)"
    
    # Provide a summary of what was done
    echo ""
    echo -e "${BLUE}=== Update Summary ===${NC}"
    echo "1. Backed up current configuration"
    echo "2. Pulled latest code from repository"
    echo "3. Captured current configuration"
    echo "4. Stopped existing containers"
    echo "5. Cleaned container images"
    echo "6. Updated environment files"
    echo "7. Created update compose file"
    echo "8. Built containers with new configuration"
    echo "9. Started containers with new configuration"
    echo "10. Verified containers are running"
    
    # Show container status
    echo ""
    echo -e "${BLUE}=== Container Status ===${NC}"
    podman ps --filter label=io.podman.compose.project=share-things
    
    log_success "Update complete!"
    
    # Display current configuration
    echo ""
    echo -e "${BLUE}=== Current Configuration ===${NC}"
    echo "Hostname: ${HOSTNAME}"
    echo "Protocol: ${PROTOCOL}"
    echo "Frontend Port: ${FRONTEND_PORT}"
    echo "Backend Port: ${BACKEND_PORT}"
    echo "API Port: ${API_PORT}"
    echo "Production Mode: ${PRODUCTION_MODE}"
    
    # Add instructions for manual cleanup if needed
    echo ""
    echo -e "${BLUE}=== Troubleshooting ===${NC}"
    echo "If you encounter issues with containers not updating properly, you can try:"
    echo "1. Manual cleanup: podman rm -f \$(podman ps -a -q --filter name=share-things)"
    echo "2. Restart the update: ./setup.sh --update"
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