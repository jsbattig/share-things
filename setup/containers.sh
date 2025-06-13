#!/bin/bash

# Container management functions for ShareThings setup scripts

# Source Podman cleanup functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/podman-cleanup.sh"

# Always use the private registry URL
# This registry is accessible both internally and externally
REGISTRY_URL="linner.ddns.net:4443/docker.io.proxy"

# Stop and remove containers
stop_containers() {
    log_info "Stopping running containers..."
    
    # Perform pre-operation Podman check
    podman_pre_operation_check
    
    # Force stop and remove all containers with share-things in the name
    log_info "Force stopping and removing all share-things containers..."
    podman rm -f $(podman ps -a -q --filter name=share-things) 2>/dev/null || log_warning "No share-things containers to remove"
    
    # First attempt with podman-compose down
    log_info "Stopping containers with podman-compose..."
    podman-compose -f build/config/podman-compose.yml down 2>/dev/null || log_warning "podman-compose down failed, continuing with direct container management"
    
    # Stop and remove specific containers by name
    log_info "Force stopping individual containers to ensure clean state..."
    
    if podman ps | grep -q "share-things"; then
        log_info "Found running containers"
        
        # Stop containers
        podman stop --time 10 share-things-frontend 2>/dev/null || log_warning "Failed to stop frontend container"
        podman stop --time 10 share-things-backend 2>/dev/null || log_warning "Failed to stop backend container"
    else
        log_info "No running containers found"
    fi
    
    # Remove containers
    log_info "Removing Podman containers..."
    if podman ps -a | grep -q "share-things"; then
        log_info "Found containers to remove"
        
        # Remove containers
        podman rm -f share-things-frontend 2>/dev/null || log_warning "Failed to remove frontend container"
        podman rm -f share-things-backend 2>/dev/null || log_warning "Failed to remove backend container"
    else
        log_info "No containers found to remove"
    fi
    
    # Clean up any associated networks
    log_info "Cleaning up networks..."
    podman network prune -f 2>/dev/null || echo "Network prune not supported or no networks to remove"
    
    log_success "All containers stopped successfully."
}

# Clean container images
clean_container_images() {
    log_info "Cleaning container image cache..."
    
    # Perform pre-operation Podman check
    podman_pre_operation_check
    
    # Force remove share-things images
    log_info "Force removing share-things images..."
    podman rmi -f $(podman images -q --filter reference=localhost/share-things*) 2>/dev/null || log_warning "No share-things images to remove"
    
    # Remove dangling images (not used by any container)
    log_info "Removing dangling images (not used by any container)..."
    podman image prune -f
    log_success "Podman dangling images removed."
    
    # Use a selective prune that preserves currently used images
    podman system prune -f --volumes
    log_success "Podman system cache cleaned (preserving currently used images)."
}

# Build and start containers
build_and_start_containers() {
    # Perform pre-operation Podman check
    podman_pre_operation_check
    
    # Ensure data directory exists before starting containers
    log_info "Ensuring data directory exists with proper permissions..."
    if [ -f "$REPO_ROOT/ensure-data-directory.sh" ]; then
        bash "$REPO_ROOT/ensure-data-directory.sh"
    else
        # Fallback: create data directory manually
        mkdir -p "$REPO_ROOT/data/sessions"
        chmod 755 "$REPO_ROOT/data" "$REPO_ROOT/data/sessions"
        log_info "Data directory created at: $REPO_ROOT/data"
    fi
    
    # Always build in production-optimized mode
    log_info "Creating podman-compose file for production deployment..."
    
    # Create a compose file for production deployment
    mkdir -p build/config
    
    # Create the production compose file with bridge networking and volume mounts
    log_info "Creating compose file with bridge networking and data volume mounts..."
    cat > build/config/podman-compose.prod.yml << EOF
# Production configuration for ShareThings Podman Compose

services:
  backend:
    build:
      context: $REPO_ROOT
      dockerfile: server/Dockerfile
      args:
        - PORT=${API_PORT:-15001}
    container_name: share-things-backend
    ports:
      - "${BACKEND_PORT}:${API_PORT:-15001}"
    volumes:
      - ./data:/app/data:Z  # CRITICAL: Mount data directory for persistence
    networks:
      app_network:
        aliases:
          - backend
    environment:
      - NODE_ENV=production
      - PORT=${API_PORT:-15001}
      - SQLITE_DB_PATH=/app/data/sessions.db
      - STORAGE_PATH=/app/data/sessions
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: $REPO_ROOT
      dockerfile: client/Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT:-15001}
        - VITE_API_PORT=${API_PORT:-15001}
    container_name: share-things-frontend
    ports:
      - "${FRONTEND_PORT}:15000"
    networks:
      app_network:
        aliases:
          - frontend
    environment:
      - API_PORT=${API_PORT:-15001}
      - PORT=15000
      - STATIC_DIR=/app/public
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

# Define networks
networks:
  app_network:
    driver: bridge

# Named volumes for node_modules
volumes:
  volume-backend-node-modules:
  volume-frontend-node-modules:
EOF
    log_success "Production podman-compose file created in build/config/."
    
    log_info "Building containers in production mode..."
    
    # Export API_PORT as VITE_API_PORT to ensure it's available during build
    export VITE_API_PORT="${API_PORT:-15001}"
    log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
    
    # Use the production compose file
    PROD_COMPOSE_PATH="build/config/podman-compose.prod.yml"
    ABSOLUTE_PROD_COMPOSE_PATH="$(cd "$(dirname "$PROD_COMPOSE_PATH")" && pwd)/$(basename "$PROD_COMPOSE_PATH")"
    log_info "Using absolute compose file path: $ABSOLUTE_PROD_COMPOSE_PATH"
    
    # Check if podman is working properly before attempting to build
    if ! podman info &> /dev/null; then
        log_warning "Podman service may not be running properly. Attempting to reset..."
        podman system migrate &> /dev/null || true
        podman system reset --force &> /dev/null || true
        
        # Check again after reset
        if ! podman info &> /dev/null; then
            log_warning "Podman service still not running properly. Will attempt to continue with existing images..."
        else
            log_info "Podman service reset successfully. Proceeding with build..."
            podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" build --no-cache
        fi
    else
        # Podman is working fine, proceed with build
        podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" build --no-cache
    fi
    
    # Check if build was successful
    if [ $? -ne 0 ]; then
        log_error "Container build failed"
        log_error "Cannot continue with installation. Please fix the build errors and try again."
        exit 1
    fi
    
    log_info "Starting containers with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
    
    # Check if podman is working properly before attempting to start containers
    if ! podman info &> /dev/null; then
        log_warning "Podman service may not be running properly. Attempting to reset..."
        podman system migrate &> /dev/null || true
        podman system reset --force &> /dev/null || true
        
        # Check again after reset
        if ! podman info &> /dev/null; then
            log_warning "Podman service still not running properly. Container startup may fail."
            FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" up -d
        else
            log_info "Podman service reset successfully. Proceeding with container startup..."
            FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" up -d
        fi
    else
        # Podman is working fine, proceed with container startup
        FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" up -d
    fi
    
    # Store the compose file name for later use
    COMPOSE_FILE="$ABSOLUTE_PROD_COMPOSE_PATH"
}

# Verify containers are running
verify_containers() {
    # Perform pre-operation Podman check
    podman_pre_operation_check
    
    log_info "Checking container status..."
    echo "Running: podman ps | grep share-things"
    podman ps | grep share-things || echo "No share-things containers found in 'podman ps' output"
    
    # Get detailed container information
    echo "Detailed container information:"
    podman ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" | grep share-things || echo "No share-things containers found"
    
    # Count running containers by name, without relying on labels
    # This is more reliable as it checks for containers by name pattern
    RUNNING_COUNT=0
    if podman ps | grep -q "share-things-frontend"; then
        RUNNING_COUNT=$((RUNNING_COUNT + 1))
    fi
    if podman ps | grep -q "share-things-backend"; then
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
        podman logs share-things-backend --tail 20 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 20 2>/dev/null || echo "No logs available for frontend container"
        
        # Check container network
        echo "Container network information:"
        podman network inspect app_network 2>/dev/null || echo "Network app_network not found"
        
        # Check container ports
        echo "Container port mappings:"
        podman port share-things-frontend 2>/dev/null || echo "No port mappings for frontend container"
        podman port share-things-backend 2>/dev/null || echo "No port mappings for backend container"
    else
        log_warning "Not all expected containers appear to be running."
        echo "You can check container logs with: podman logs <container_name>"
        
        # Show logs for troubleshooting
        log_info "Checking container logs for errors..."
        echo "Backend container logs:"
        podman logs share-things-backend --tail 30 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 30 2>/dev/null || echo "No logs available for frontend container"
        
        # Check if containers exist but are not running
        echo "Checking for stopped containers:"
        podman ps -a | grep share-things || echo "No share-things containers found"
        
        # Check for container creation errors
        echo "Checking for container creation errors:"
        # Use a timeout to prevent hanging
        timeout 5 podman events --filter event=create --filter event=die --since 5m --format "{{.Time}} {{.Type}} {{.Action}} {{.Actor.Name}}" 2>/dev/null || echo "No recent container events"
    fi
    
    # Save logs to file if in debug mode
    if [ "$DEBUG_MODE" = "true" ]; then
        # Create logs directory if it doesn't exist
        mkdir -p "logs/container-logs"
        
        # Get the date in a separate step to avoid command substitution issues
        CURRENT_DATE=$(date +%Y%m%d-%H%M%S)
        
        # Add error handling to detect and report when command substitution fails
        if [[ ! $CURRENT_DATE =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
            log_warning "Failed to get properly formatted date. Using fallback."
            CURRENT_DATE="fallback-$(date +%s)"  # Use Unix timestamp as fallback
        fi
        
        # Use the variable to create the directory name under logs/container-logs
        CONTAINER_LOG_DIR="logs/container-logs/${CURRENT_DATE}"
        mkdir -p "$CONTAINER_LOG_DIR"
        
        log_info "Debug: date command output: $(date +%Y%m%d-%H%M%S)"
        log_info "Debug: CONTAINER_LOG_DIR value: $CONTAINER_LOG_DIR"
        
        echo "Saving container logs to $CONTAINER_LOG_DIR directory..."
        podman logs share-things-frontend > "$CONTAINER_LOG_DIR/frontend.log" 2>&1 || echo "Could not save frontend logs"
        podman logs share-things-backend > "$CONTAINER_LOG_DIR/backend.log" 2>&1 || echo "Could not save backend logs"
        podman ps -a > "$CONTAINER_LOG_DIR/container-list.txt" 2>&1 || echo "Could not save container list"
        podman images > "$CONTAINER_LOG_DIR/images.txt" 2>&1 || echo "Could not save image list"
        
        echo "Container logs saved to $CONTAINER_LOG_DIR directory"
    fi
}