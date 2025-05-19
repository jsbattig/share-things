#!/bin/bash

# Container management functions for ShareThings setup scripts

# Stop and remove containers
stop_containers() {
    log_info "Stopping running containers..."
    
    # Save the currently running container IDs for later verification
    # Use a simpler approach to avoid command substitution issues
    RUNNING_CONTAINERS_BEFORE=""
    if podman ps -a -q --filter name=share-things | grep -q .; then
        RUNNING_CONTAINERS_BEFORE="has-containers"
    fi
    
    # First attempt with podman-compose down
    log_info "Stopping containers with podman-compose..."
    # Use a hardcoded path to avoid command substitution issues
    podman-compose -f build/config/podman-compose.yml down 2>/dev/null || log_warning "podman-compose down failed, continuing with direct container management"
    
    # Check if any containers are still running with either naming convention
    # Use a simpler approach to avoid command substitution issues
    STILL_RUNNING_AFTER_COMPOSE=""
    if podman ps -q --filter name=share-things | grep -q .; then
        STILL_RUNNING_AFTER_COMPOSE="has-containers"
    fi
    if [ -n "$STILL_RUNNING_AFTER_COMPOSE" ]; then
        log_warning "Some containers are still running after podman-compose down. Will try direct stop."
    fi
    
    # Second - try force stopping specific containers regardless of first attempt outcome
    log_info "Force stopping individual containers to ensure clean state..."
    
    # Get all container IDs with either naming convention
    # Use a direct approach to stop containers
    log_info "Stopping all containers with name containing 'share-things'"
    
    # Check if any containers are running
    # Use a simpler approach to avoid command substitution issues
    RUNNING_CONTAINERS=0
    if podman ps | grep -q "share-things"; then
        RUNNING_CONTAINERS=1
    fi
    if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
        log_info "Found $RUNNING_CONTAINERS running containers"
        
        # Stop all containers at once
        podman stop --all --time 10 2>/dev/null || log_warning "Failed to stop all containers"
        
        # Try to stop specific containers by name
        podman stop --time 10 share-things-frontend 2>/dev/null || log_warning "Failed to stop frontend container"
        podman stop --time 10 share-things-backend 2>/dev/null || log_warning "Failed to stop backend container"
    else
        log_info "No running containers found"
    fi
    
    # Remove containers with force flag
    log_info "Removing Podman containers..."
    # Use a direct approach to remove containers
    log_info "Removing all containers with name containing 'share-things'"
    
    # Check if any containers exist
    # Use a simpler approach to avoid command substitution issues
    ALL_CONTAINERS=0
    if podman ps -a | grep -q "share-things"; then
        ALL_CONTAINERS=1
    fi
    if [ "$ALL_CONTAINERS" -gt 0 ]; then
        log_info "Found $ALL_CONTAINERS containers to remove"
        
        # Remove all containers at once
        podman rm -f --all 2>/dev/null || log_warning "Failed to remove all containers"
        
        # Try to remove specific containers by name
        podman rm -f share-things-frontend 2>/dev/null || log_warning "Failed to remove frontend container"
        podman rm -f share-things-backend 2>/dev/null || log_warning "Failed to remove backend container"
    else
        log_info "No containers found to remove"
    fi
    
    # Clean up any associated networks
    log_info "Cleaning up networks..."
    podman network prune -f 2>/dev/null || echo "Network prune not supported or no networks to remove"
    
    # Final verification to make sure ALL containers are stopped
    log_info "Performing final verification..."
    
    # Just use podman ps to check for any containers
    # Use a simpler approach to avoid command substitution issues
    RUNNING_CONTAINERS=0
    if podman ps | grep -q "share-things"; then
        RUNNING_CONTAINERS=1
    fi
    if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
        log_error "Some containers are still running despite multiple stop attempts!"
        log_error "This could cause problems with the update. Listing containers:"
        podman ps | grep "share-things" || echo "No containers found in 'podman ps' output"
        
        # Last resort - kill with SIGKILL
        log_error "Performing emergency container kill..."
        
        # Use a direct approach to kill containers
        log_info "Killing all running containers with name containing 'share-things'"
        
        # Kill all containers at once
        podman kill --all 2>/dev/null || log_warning "Failed to kill all containers"
        
        # Try to kill specific containers by name
        podman kill share-things-frontend 2>/dev/null || log_warning "Failed to kill frontend container"
        podman kill share-things-backend 2>/dev/null || log_warning "Failed to kill backend container"
        
        # Use a direct approach to remove containers
        log_info "Force removing all containers with name containing 'share-things'"
        
        # Remove all containers at once
        podman rm -f --all 2>/dev/null || log_warning "Failed to remove all containers"
        
        # Try to remove specific containers by name
        podman rm -f share-things-frontend 2>/dev/null || log_warning "Failed to remove frontend container"
        podman rm -f share-things-backend 2>/dev/null || log_warning "Failed to remove backend container"
    fi
    
    # Final success message
    log_success "All containers stopped successfully."
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
        mkdir -p build/config
        
        # Create the production compose file using echo instead of cat
        echo "# Temporary production configuration for ShareThings Podman Compose" > build/config/podman-compose.prod.temp.yml
        echo "" >> build/config/podman-compose.prod.temp.yml
        echo "services:" >> build/config/podman-compose.prod.temp.yml
        echo "  backend:" >> build/config/podman-compose.prod.temp.yml
        echo "    build:" >> build/config/podman-compose.prod.temp.yml
        echo "      context: ../../server" >> build/config/podman-compose.prod.temp.yml
        echo "      dockerfile: Dockerfile" >> build/config/podman-compose.prod.temp.yml
        echo "      args:" >> build/config/podman-compose.prod.temp.yml
        echo "        - PORT=${API_PORT:-15001}" >> build/config/podman-compose.prod.temp.yml
        echo "    container_name: share-things-backend" >> build/config/podman-compose.prod.temp.yml
        echo "    hostname: backend" >> build/config/podman-compose.prod.temp.yml
        echo "    environment:" >> build/config/podman-compose.prod.temp.yml
        echo "      - NODE_ENV=production" >> build/config/podman-compose.prod.temp.yml
        echo "      - PORT=${API_PORT:-15001}" >> build/config/podman-compose.prod.temp.yml
        echo "    ports:" >> build/config/podman-compose.prod.temp.yml
        echo "      - \"${BACKEND_PORT:-15001}:${API_PORT:-15001}\"" >> build/config/podman-compose.prod.temp.yml
        echo "    restart: always" >> build/config/podman-compose.prod.temp.yml
        echo "    networks:" >> build/config/podman-compose.prod.temp.yml
        echo "      app_network:" >> build/config/podman-compose.prod.temp.yml
        echo "        aliases:" >> build/config/podman-compose.prod.temp.yml
        echo "          - backend" >> build/config/podman-compose.prod.temp.yml
        echo "    logging:" >> build/config/podman-compose.prod.temp.yml
        echo "      driver: \"json-file\"" >> build/config/podman-compose.prod.temp.yml
        echo "      options:" >> build/config/podman-compose.prod.temp.yml
        echo "        max-size: \"10m\"" >> build/config/podman-compose.prod.temp.yml
        echo "        max-file: \"3\"" >> build/config/podman-compose.prod.temp.yml
        echo "" >> build/config/podman-compose.prod.temp.yml
        echo "  frontend:" >> build/config/podman-compose.prod.temp.yml
        echo "    build:" >> build/config/podman-compose.prod.temp.yml
        echo "      context: ../../client" >> build/config/podman-compose.prod.temp.yml
        echo "      dockerfile: Dockerfile" >> build/config/podman-compose.prod.temp.yml
        echo "      args:" >> build/config/podman-compose.prod.temp.yml
        echo "        - API_URL=auto" >> build/config/podman-compose.prod.temp.yml
        echo "        - SOCKET_URL=auto" >> build/config/podman-compose.prod.temp.yml
        echo "        - API_PORT=${API_PORT:-15001}" >> build/config/podman-compose.prod.temp.yml
        echo "        - VITE_API_PORT=${API_PORT:-15001}" >> build/config/podman-compose.prod.temp.yml
        echo "    container_name: share-things-frontend" >> build/config/podman-compose.prod.temp.yml
        echo "    environment:" >> build/config/podman-compose.prod.temp.yml
        echo "      - API_PORT=${API_PORT:-15001}" >> build/config/podman-compose.prod.temp.yml
        echo "    ports:" >> build/config/podman-compose.prod.temp.yml
        echo "      - \"${FRONTEND_PORT:-15000}:80\"" >> build/config/podman-compose.prod.temp.yml
        echo "    restart: always" >> build/config/podman-compose.prod.temp.yml
        echo "    depends_on:" >> build/config/podman-compose.prod.temp.yml
        echo "      - backend" >> build/config/podman-compose.prod.temp.yml
        echo "    networks:" >> build/config/podman-compose.prod.temp.yml
        echo "      app_network:" >> build/config/podman-compose.prod.temp.yml
        echo "        aliases:" >> build/config/podman-compose.prod.temp.yml
        echo "          - frontend" >> build/config/podman-compose.prod.temp.yml
        echo "    logging:" >> build/config/podman-compose.prod.temp.yml
        echo "      driver: \"json-file\"" >> build/config/podman-compose.prod.temp.yml
        echo "      options:" >> build/config/podman-compose.prod.temp.yml
        echo "        max-size: \"10m\"" >> build/config/podman-compose.prod.temp.yml
        echo "        max-file: \"3\"" >> build/config/podman-compose.prod.temp.yml
        echo "" >> build/config/podman-compose.prod.temp.yml
        echo "# Explicit network configuration" >> build/config/podman-compose.prod.temp.yml
        echo "networks:" >> build/config/podman-compose.prod.temp.yml
        echo "  app_network:" >> build/config/podman-compose.prod.temp.yml
        echo "    driver: bridge" >> build/config/podman-compose.prod.temp.yml
        echo "" >> build/config/podman-compose.prod.temp.yml
        echo "# Named volumes for node_modules" >> build/config/podman-compose.prod.temp.yml
        echo "volumes:" >> build/config/podman-compose.prod.temp.yml
        echo "  volume-backend-node-modules:" >> build/config/podman-compose.prod.temp.yml
        echo "  volume-frontend-node-modules:" >> build/config/podman-compose.prod.temp.yml
        log_success "Temporary production podman-compose file created in build/config/."
        
        log_info "Building containers in production mode..."
        
        # Export API_PORT as VITE_API_PORT to ensure it's available during build
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        podman-compose -f "$(pwd)/build/config/podman-compose.prod.temp.yml" build --no-cache
        
        log_info "Starting containers in production mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # For podman-compose, we need to explicitly pass the environment variables
        # Include API_PORT to ensure it's available during the container runtime
        FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$(pwd)/build/config/podman-compose.prod.temp.yml" up -d
        
        # Store the compose file name for later use
        COMPOSE_FILE="build/config/podman-compose.prod.temp.yml"
    else
        log_info "Building containers in development mode..."
        
        # Export API_PORT as VITE_API_PORT to ensure it's available during build
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        # Create a temporary development compose file without volume mounts
        log_info "Creating temporary development podman-compose file..."
        mkdir -p build/config
        
        # Create the development compose file using echo instead of cat
        echo "# Temporary development configuration for ShareThings Podman Compose" > build/config/podman-compose.dev.temp.yml
        echo "" >> build/config/podman-compose.dev.temp.yml
        echo "services:" >> build/config/podman-compose.dev.temp.yml
        echo "  backend:" >> build/config/podman-compose.dev.temp.yml
        echo "    build:" >> build/config/podman-compose.dev.temp.yml
        echo "      context: ../../server" >> build/config/podman-compose.dev.temp.yml
        echo "      dockerfile: Dockerfile" >> build/config/podman-compose.dev.temp.yml
        echo "      args:" >> build/config/podman-compose.dev.temp.yml
        echo "        - PORT=${API_PORT:-15001}" >> build/config/podman-compose.dev.temp.yml
        echo "    container_name: share-things-backend" >> build/config/podman-compose.dev.temp.yml
        echo "    hostname: backend" >> build/config/podman-compose.dev.temp.yml
        echo "    environment:" >> build/config/podman-compose.dev.temp.yml
        echo "      - NODE_ENV=development" >> build/config/podman-compose.dev.temp.yml
        echo "      - PORT=${API_PORT:-15001}" >> build/config/podman-compose.dev.temp.yml
        echo "    ports:" >> build/config/podman-compose.dev.temp.yml
        echo "      - \"${BACKEND_PORT:-15001}:${API_PORT:-15001}\"" >> build/config/podman-compose.dev.temp.yml
        echo "    restart: always" >> build/config/podman-compose.dev.temp.yml
        echo "    networks:" >> build/config/podman-compose.dev.temp.yml
        echo "      app_network:" >> build/config/podman-compose.dev.temp.yml
        echo "        aliases:" >> build/config/podman-compose.dev.temp.yml
        echo "          - backend" >> build/config/podman-compose.dev.temp.yml
        echo "    logging:" >> build/config/podman-compose.dev.temp.yml
        echo "      driver: \"json-file\"" >> build/config/podman-compose.dev.temp.yml
        echo "      options:" >> build/config/podman-compose.dev.temp.yml
        echo "        max-size: \"10m\"" >> build/config/podman-compose.dev.temp.yml
        echo "        max-file: \"3\"" >> build/config/podman-compose.dev.temp.yml
        echo "" >> build/config/podman-compose.dev.temp.yml
        echo "  frontend:" >> build/config/podman-compose.dev.temp.yml
        echo "    build:" >> build/config/podman-compose.dev.temp.yml
        echo "      context: ../../client" >> build/config/podman-compose.dev.temp.yml
        echo "      dockerfile: Dockerfile" >> build/config/podman-compose.dev.temp.yml
        echo "      args:" >> build/config/podman-compose.dev.temp.yml
        echo "        - API_URL=auto" >> build/config/podman-compose.dev.temp.yml
        echo "        - SOCKET_URL=auto" >> build/config/podman-compose.dev.temp.yml
        echo "        - API_PORT=${API_PORT:-15001}" >> build/config/podman-compose.dev.temp.yml
        echo "        - VITE_API_PORT=${API_PORT:-15001}" >> build/config/podman-compose.dev.temp.yml
        echo "    container_name: share-things-frontend" >> build/config/podman-compose.dev.temp.yml
        echo "    environment:" >> build/config/podman-compose.dev.temp.yml
        echo "      - API_PORT=${API_PORT:-15001}" >> build/config/podman-compose.dev.temp.yml
        echo "    ports:" >> build/config/podman-compose.dev.temp.yml
        echo "      - \"${FRONTEND_PORT:-15000}:80\"" >> build/config/podman-compose.dev.temp.yml
        echo "    restart: always" >> build/config/podman-compose.dev.temp.yml
        echo "    depends_on:" >> build/config/podman-compose.dev.temp.yml
        echo "      - backend" >> build/config/podman-compose.dev.temp.yml
        echo "    networks:" >> build/config/podman-compose.dev.temp.yml
        echo "      app_network:" >> build/config/podman-compose.dev.temp.yml
        echo "        aliases:" >> build/config/podman-compose.dev.temp.yml
        echo "          - frontend" >> build/config/podman-compose.dev.temp.yml
        echo "    logging:" >> build/config/podman-compose.dev.temp.yml
        echo "      driver: \"json-file\"" >> build/config/podman-compose.dev.temp.yml
        echo "      options:" >> build/config/podman-compose.dev.temp.yml
        echo "        max-size: \"10m\"" >> build/config/podman-compose.dev.temp.yml
        echo "        max-file: \"3\"" >> build/config/podman-compose.dev.temp.yml
        echo "" >> build/config/podman-compose.dev.temp.yml
        echo "# Explicit network configuration" >> build/config/podman-compose.dev.temp.yml
        echo "networks:" >> build/config/podman-compose.dev.temp.yml
        echo "  app_network:" >> build/config/podman-compose.dev.temp.yml
        echo "    driver: bridge" >> build/config/podman-compose.dev.temp.yml
        echo "" >> build/config/podman-compose.dev.temp.yml
        echo "# Named volumes for node_modules" >> build/config/podman-compose.dev.temp.yml
        echo "volumes:" >> build/config/podman-compose.dev.temp.yml
        echo "  volume-backend-node-modules:" >> build/config/podman-compose.dev.temp.yml
        echo "  volume-frontend-node-modules:" >> build/config/podman-compose.dev.temp.yml
        log_success "Temporary development podman-compose file created in build/config/."
        
        log_info "Building containers with temporary development file..."
        # Create a variable with the full path to avoid command substitution issues
        # Use a more reliable approach to avoid command substitution issues
        echo "$(pwd)/build/config/podman-compose.dev.temp.yml" > /tmp/dev_compose_path.txt
        DEV_COMPOSE_PATH=$(cat /tmp/dev_compose_path.txt)
        podman-compose -f "$DEV_COMPOSE_PATH" build --no-cache
        
        log_info "Starting containers in development mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # For podman-compose, we need to explicitly pass the environment variables
        # Make sure the file exists before using it
        touch /tmp/dev_compose_path.txt
        DEV_COMPOSE_PATH=$(cat /tmp/dev_compose_path.txt)
        FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$DEV_COMPOSE_PATH" up -d
        
        # Store the compose file name for later use
        echo "build/config/podman-compose.dev.temp.yml" > /tmp/compose_file.txt
        COMPOSE_FILE=$(cat /tmp/compose_file.txt)
    fi
}

# Verify containers are running
verify_containers() {
    log_info "Checking container status..."
    echo "Running: podman ps --filter label=io.podman.compose.project=share-things"
    podman ps --filter label=io.podman.compose.project=share-things
    
    # Get detailed container information
    echo "Detailed container information:"
    podman ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" | grep share-things || echo "No share-things containers found"
    
    # Count running containers
    # Use a simpler approach to avoid command substitution issues
    RUNNING_COUNT=0
    if podman ps --filter label=io.podman.compose.project=share-things | grep -q "share-things-frontend"; then
        RUNNING_COUNT=$((RUNNING_COUNT + 1))
    fi
    if podman ps --filter label=io.podman.compose.project=share-things | grep -q "share-things-backend"; then
        RUNNING_COUNT=$((RUNNING_COUNT + 1))
    fi
    if [ "$RUNNING_COUNT" -ge "2" ]; then
        log_success "Containers are running successfully!"
        
        # Check container health
        echo "Container health status:"
        podman healthcheck run share-things-frontend 2>/dev/null || echo "Health check not configured for frontend container"
        podman healthcheck run share-things-backend 2>/dev/null || echo "Health check not configured for backend container"
        
        # Check container logs for errors
        log_info "Checking container logs for errors..."
        echo "Backend container logs:"
        podman logs share-things-backend --tail 20
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 20
        
        # Check container network
        echo "Container network information:"
        podman network inspect app_network 2>/dev/null || echo "Network app_network not found"
        
        # Check container ports
        echo "Container port mappings:"
        podman port share-things-frontend || echo "No port mappings for frontend container"
        podman port share-things-backend || echo "No port mappings for backend container"
    else
        log_error "Warning: Not all containers appear to be running."
        echo "You can check container logs with: podman logs <container_name>"
        
        # Show logs for troubleshooting
        log_info "Checking container logs for errors..."
        echo "Backend container logs:"
        podman logs share-things-backend --tail 30 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 30 2>/dev/null || echo "No logs available for frontend container"
        
        # Check if containers exist but are not running
        echo "Checking for stopped containers:"
        podman ps -a --filter name=share-things
        
        # Check for container creation errors
        echo "Checking for container creation errors:"
        podman events --filter event=create --filter event=die --since 5m --format "{{.Time}} {{.Type}} {{.Action}} {{.Actor.Name}}" || echo "No recent container events"
    fi
    
    # Save logs to file if in debug mode
    if [ "$DEBUG_MODE" = "true" ]; then
        CONTAINER_LOG_DIR="container-logs-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$CONTAINER_LOG_DIR"
        
        echo "Saving container logs to $CONTAINER_LOG_DIR directory..."
        podman logs share-things-frontend > "$CONTAINER_LOG_DIR/frontend.log" 2>&1 || echo "Could not save frontend logs"
        podman logs share-things-backend > "$CONTAINER_LOG_DIR/backend.log" 2>&1 || echo "Could not save backend logs"
        podman ps -a > "$CONTAINER_LOG_DIR/container-list.txt" 2>&1 || echo "Could not save container list"
        podman images > "$CONTAINER_LOG_DIR/images.txt" 2>&1 || echo "Could not save image list"
        
        echo "Container logs saved to $CONTAINER_LOG_DIR directory"
    fi
}