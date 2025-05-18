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
    
    # Build and start containers
    build_and_start_containers
    
    # Verify containers
    verify_containers
    
    # Display next steps
    echo ""
    echo -e "${BLUE}=== Next Steps ===${NC}"
    
    if [ "$EXPOSE_PORTS" = "true" ]; then
        echo "You can access the application at:"
        echo "- Frontend: ${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT} (container port 80)"
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
    echo "  cd $(pwd) && podman-compose -f build/config/podman-compose.yml down && podman-compose -f build/config/podman-compose.yml up -d"
    
    # Clean up any backup files created by sed
    cleanup_backup_files
}

# Perform update
perform_update() {
    # Backup current configuration
    backup_configuration
    
    # Pull latest code
    pull_latest_code
    
    # Capture current configuration
    capture_current_configuration
    
    # Determine which compose file to use
    if [ -f build/config/podman-compose.prod.yml ]; then
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.prod.yml"
    elif [ -f build/config/podman-compose.prod.temp.yml ]; then
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.prod.temp.yml"
    else
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.yml"
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
      - "${FRONTEND_PORT}:80"  # This will use 15000:80 for production
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
    log_info "Building containers with comprehensive configuration..."
    podman-compose -f "$(pwd)/build/config/podman-compose.update.yml" build
    
    log_info "Starting containers with explicit environment variables..."
    # Directly pass environment variables to the compose command
    FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$(pwd)/build/config/podman-compose.update.yml" up -d
    
    COMPOSE_FILE="$(pwd)/build/config/podman-compose.update.yml"
    
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
    verify_containers
    
    # Clean up any temporary files created during the update
    if [ -f build/config/podman-compose.update.yml ]; then
        log_info "Cleaning up temporary files..."
        # Keep the file for reference in case of issues
        mv build/config/podman-compose.update.yml build/config/podman-compose.update.yml.bak
        log_success "build/config/podman-compose.update.yml saved as build/config/podman-compose.update.yml.bak for reference."
    fi
    
    # Clean up any backup files created by sed
    cleanup_backup_files
    
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
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.prod.yml"
    elif [ -f build/config/podman-compose.prod.temp.yml ]; then
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.prod.temp.yml"
    elif [ -f build/config/podman-compose.update.yml ]; then
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.update.yml"
    else
        COMPOSE_FILE="$(pwd)/build/config/podman-compose.yml"
    fi
    
    # Stop and remove containers
    stop_containers
    
    # Clean container images
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