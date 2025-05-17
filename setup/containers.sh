#!/bin/bash

# Container management functions for ShareThings setup scripts

# Stop and remove containers
stop_containers() {
    log_info "Stopping running containers..."
    
    # Save the currently running container IDs for later verification
    RUNNING_CONTAINERS_BEFORE=$(podman ps -a -q --filter name=share-things)
    
    # First attempt with podman-compose down
    log_info "Stopping containers with podman-compose..."
    podman-compose -f $COMPOSE_FILE down 2>/dev/null || log_warning "podman-compose down failed, continuing with direct container management"
    
    # Check if any containers are still running with either naming convention
    STILL_RUNNING_AFTER_COMPOSE=$(podman ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING_AFTER_COMPOSE" ]; then
        log_warning "Some containers are still running after podman-compose down. Will try direct stop."
    fi
    
    # Second - try force stopping specific containers regardless of first attempt outcome
    log_info "Force stopping individual containers to ensure clean state..."
    
    # Get all container IDs with either naming convention
    CONTAINER_IDS=$(podman ps -a -q --filter name=share-things)
    
    if [ -n "$CONTAINER_IDS" ]; then
        # Display container IDs being stopped
        echo "$CONTAINER_IDS"
        
        # Stop with extended timeout
        for CONTAINER_ID in $CONTAINER_IDS; do
            podman stop --time 10 $CONTAINER_ID 2>/dev/null || echo "Failed to stop container $CONTAINER_ID"
        done
    else
        echo "No running containers to stop"
    fi
    
    # Remove containers with force flag
    log_info "Removing Podman containers..."
    CONTAINER_IDS=$(podman ps -a -q --filter name=share-things)
    
    if [ -n "$CONTAINER_IDS" ]; then
        # Display container IDs being removed
        echo "$CONTAINER_IDS"
        
        # Remove containers
        for CONTAINER_ID in $CONTAINER_IDS; do
            podman rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
        done
    else
        echo "No containers to remove"
    fi
    
    # Clean up any associated networks
    log_info "Cleaning up networks..."
    podman network prune -f 2>/dev/null || echo "Network prune not supported or no networks to remove"
    
    # Final verification to make sure ALL containers are stopped
    log_info "Performing final verification..."
    STILL_RUNNING=$(podman ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING" ]; then
        log_error "Some containers are still running despite multiple stop attempts!"
        log_error "This could cause problems with the update. Listing containers:"
        podman ps | grep "share-things"
        
        # Last resort - kill with SIGKILL
        log_error "Performing emergency container kill..."
        CONTAINER_IDS=$(podman ps -q --filter name=share-things)
        if [ -n "$CONTAINER_IDS" ]; then
            for CONTAINER_ID in $CONTAINER_IDS; do
                echo "Killing container $CONTAINER_ID"
                podman kill $CONTAINER_ID 2>/dev/null || echo "Failed to kill container $CONTAINER_ID"
            done
        fi
        
        CONTAINER_IDS=$(podman ps -a -q --filter name=share-things)
        if [ -n "$CONTAINER_IDS" ]; then
            for CONTAINER_ID in $CONTAINER_IDS; do
                echo "Removing container $CONTAINER_ID"
                podman rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
            done
        fi
        
        # Check one more time
        FINAL_CHECK=$(podman ps -q --filter name=share-things)
        if [ -n "$FINAL_CHECK" ]; then
            log_error "CRITICAL: Unable to stop containers. Manual intervention required."
            log_error "Please stop all ShareThings containers manually before continuing."
            exit 1
        fi
    fi
    
    log_success "All containers stopped successfully."
}

# Clean container images
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

# Build and start containers
build_and_start_containers() {
    # Determine if running in production mode
    if [ "$PRODUCTION_MODE" == "true" ]; then
        log_info "Creating temporary production podman-compose file without volume mounts..."
        
        # Create a temporary docker-compose file for production without volume mounts
        cat > podman-compose.prod.temp.yml << EOL
# Temporary production configuration for ShareThings Podman Compose

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
    ports:
      - "${BACKEND_PORT:-15001}:${API_PORT:-15001}"
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
        - VITE_API_PORT=${API_PORT:-15001}  # Explicitly pass Vite env var
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT:-15001}
    ports:
      - "${FRONTEND_PORT:-15000}:80"
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
        log_success "Temporary production podman-compose file created."
        
        log_info "Building containers in production mode..."
        
        # Export API_PORT as VITE_API_PORT to ensure it's available during build
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        podman-compose -f podman-compose.prod.temp.yml build --no-cache
        
        log_info "Starting containers in production mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # For podman-compose, we need to explicitly pass the environment variables
        # Include API_PORT to ensure it's available during the container runtime
        FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f podman-compose.prod.temp.yml up -d
        
        # Store the compose file name for later use
        COMPOSE_FILE="podman-compose.prod.temp.yml"
    else
        log_info "Building containers in development mode..."
        
        # Export API_PORT as VITE_API_PORT to ensure it's available during build
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        # Create a temporary development compose file without volume mounts
        log_info "Creating temporary development podman-compose file..."
        cat > podman-compose.dev.temp.yml << EOL
# Temporary development configuration for ShareThings Podman Compose

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
      - NODE_ENV=development
      - PORT=${API_PORT:-15001}
    ports:
      - "${BACKEND_PORT:-15001}:${API_PORT:-15001}"
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
        - VITE_API_PORT=${API_PORT:-15001}  # Explicitly pass Vite env var
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT:-15001}
    ports:
      - "${FRONTEND_PORT:-15000}:80"
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
        log_success "Temporary development podman-compose file created."
        
        log_info "Building containers with temporary development file..."
        podman-compose -f podman-compose.dev.temp.yml build --no-cache
        
        log_info "Starting containers in development mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # For podman-compose, we need to explicitly pass the environment variables
        FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f podman-compose.dev.temp.yml up -d
        
        # Store the compose file name for later use
        COMPOSE_FILE="podman-compose.dev.temp.yml"
    fi
}

# Verify containers are running
verify_containers() {
    log_info "Checking container status..."
    echo "Running: podman ps --filter label=io.podman.compose.project=share-things"
    podman ps --filter label=io.podman.compose.project=share-things
    
    # Count running containers
    RUNNING_COUNT=$(podman ps --filter label=io.podman.compose.project=share-things | grep -c "share-things" || echo "0")
    if [ "$RUNNING_COUNT" -ge "2" ]; then
        log_success "Containers are running successfully!"
        
        # Check container logs for errors
        log_info "Checking container logs for errors..."
        echo "Backend container logs:"
        podman logs share-things-backend --tail 10
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 10
    else
        log_error "Warning: Not all containers appear to be running."
        echo "You can check container logs with: podman logs <container_name>"
        
        # Show logs for troubleshooting
        log_info "Checking container logs for errors..."
        echo "Backend container logs:"
        podman logs share-things-backend --tail 20 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 20 2>/dev/null || echo "No logs available for frontend container"
    fi
}