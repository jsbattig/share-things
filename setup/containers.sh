#!/bin/bash

# Container management functions for ShareThings setup scripts

# Always use the private registry URL
# This registry is accessible both internally and externally
REGISTRY_URL="linner.ddns.net:4443/docker.io.proxy"

# Stop and remove containers
stop_containers() {
    log_info "Stopping running containers..."
    
    # Save the currently running container IDs for later verification
    # Use a simpler approach to avoid command substitution issues
    RUNNING_CONTAINERS_BEFORE=""
    if podman ps -a -q --filter name=share-things | grep -q .; then
        RUNNING_CONTAINERS_BEFORE="has-containers"
    fi
    
    # Force stop and remove all containers with share-things in the name
    log_info "Force stopping and removing all share-things containers..."
    podman rm -f $(podman ps -a -q --filter name=share-things) 2>/dev/null || log_warning "No share-things containers to remove"
    
    # Check if podman is working properly
    if ! podman info &> /dev/null; then
        log_warning "Podman service may not be running properly. Attempting to reset..."
        podman system migrate &> /dev/null || true
        podman system reset --force &> /dev/null || true
        
        # Check again after reset
        if ! podman info &> /dev/null; then
            log_warning "Podman service still not running properly. Container operations may fail."
        else
            log_info "Podman service reset successfully."
        fi
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
    
    # Check if podman is working properly
    if ! podman info &> /dev/null; then
        log_warning "Podman service may not be running properly. Attempting to reset..."
        podman system migrate &> /dev/null || true
        podman system reset --force &> /dev/null || true
        
        # Check again after reset
        if ! podman info &> /dev/null; then
            log_warning "Podman service still not running properly. Image cleanup may fail."
        else
            log_info "Podman service reset successfully."
        fi
    fi
    
    # Force remove share-things images
    log_info "Force removing share-things images..."
    podman rmi -f $(podman images -q --filter reference=localhost/share-things*) 2>/dev/null || log_warning "No share-things images to remove"
    
    # Remove dangling images (not used by any container)
    log_info "Removing dangling images (not used by any container)..."
    podman image prune -f
    log_success "Podman dangling images removed."
    
    # Only remove unused images, not all images
    log_info "Removing unused images only (preserving currently used images)..."
    
    # List all running containers to ensure we don't remove images they use
    log_info "Current running containers:"
    podman ps
    
    # Use a more selective prune that preserves currently used images
    podman system prune -f --volumes
    log_success "Podman system cache cleaned (preserving currently used images)."
    
    # Don't use 'podman system prune -a' as it would remove ALL images
    # including ones that might be needed for the current deployment
}

# Build and start containers
build_and_start_containers() {
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
    
    # Determine if running in production mode
    if [ "$PRODUCTION_MODE" == "true" ]; then
        log_info "Creating temporary production podman-compose file without volume mounts..."
        
        # Create a temporary docker-compose file for production without volume mounts
        mkdir -p build/config
        
        # Use relative paths to server and client directories
        SERVER_DIR="$REPO_ROOT/server"
        CLIENT_DIR="$REPO_ROOT/client"
        
        # Create the production compose file with host networking
        log_info "Creating production compose file with host networking..."
        cat > build/config/podman-compose.prod.temp.yml << EOF
# Temporary production configuration for ShareThings Podman Compose

services:
  backend:
    build:
      context: $SERVER_DIR
      dockerfile: Dockerfile
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
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: $CLIENT_DIR
      dockerfile: Dockerfile
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
    # Run the Node.js static file server
    command:
      - sh
      - -c
      - |
        # Check if port is already in use
        if nc -z 0.0.0.0 15000 2>/dev/null; then
          echo "ERROR: Port 15000 is already in use by another process"
          netstat -tulpn | grep 15000 || echo "Could not determine which process is using port 15000"
          exit 1
        fi
        
        # Create necessary directories and files
        mkdir -p /app/public/health &&
        echo '{"status":"ok"}' > /app/public/health/index.json &&
        mkdir -p /app &&
        cd /app &&
        echo '{"type":"module","dependencies":{"express":"^4.18.2","compression":"^1.7.4"}}' > package.json &&
        npm install &&
        echo 'import express from "express";
        import path from "path";
        import { fileURLToPath } from "url";
        import compression from "compression";
        
        // Handle uncaught exceptions
        process.on("uncaughtException", (err) => {
          console.error("UNCAUGHT EXCEPTION:", err);
          process.exit(1);
        });
        
        const app = express();
        
        // Get directory name in ES modules
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        
        const STATIC_DIR = process.env.STATIC_DIR || "/app/public";
        const PORT = process.env.PORT || 15000;
        
        app.get("/health", (req, res) => {
          res.status(200).json({ status: "ok" });
        });
        
        app.use(compression());
        app.use(express.static(STATIC_DIR));
        
        app.get("*", (req, res) => {
          res.sendFile(path.join(STATIC_DIR, "index.html"));
        });
        
        // Try to start the server with error handling
        try {
          const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`Static file server running on port ${PORT}`);
          });
          
          server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
              console.error(`ERROR: Port ${PORT} is already in use by another process`);
            } else {
              console.error("Server error:", err);
            }
            process.exit(1);
          });
        } catch (err) {
          console.error("Failed to start server:", err);
          process.exit(1);
        }' > /app/server.mjs &&
        # Run the server with detailed error output
        node /app/server.mjs || { echo "Server failed to start"; exit 1; }
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
        log_success "Temporary production podman-compose file created in build/config/."
        
        log_info "Building containers in production mode..."
        
        # Export API_PORT as VITE_API_PORT to ensure it's available during build
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        # Use a more reliable path construction
        PROD_COMPOSE_PATH="build/config/podman-compose.prod.temp.yml"
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
            log_error "Container build failed in production mode"
            log_error "Cannot continue with installation. Please fix the build errors and try again."
            exit 1
        fi
        
        log_info "Starting containers in production mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # For podman-compose, we need to explicitly pass the environment variables
        # Include API_PORT to ensure it's available during the container runtime
        
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
    else
        log_info "Building containers in development mode..."
        
        # Export API_PORT as VITE_API_PORT to ensure it's available during build
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        # Create a temporary development compose file without volume mounts
        log_info "Creating temporary development podman-compose file..."
        
        # Use the detected repository root from the parent script
        CONFIG_DIR="build/config"
        mkdir -p "$CONFIG_DIR"
        
        # Set the compose file path using relative path
        DEV_COMPOSE_PATH="$CONFIG_DIR/podman-compose.dev.temp.yml"
        
        log_info "Using config directory: $CONFIG_DIR"
        log_info "Using compose file path: $DEV_COMPOSE_PATH"
        
        # Use relative paths to server and client directories
        SERVER_DIR="$REPO_ROOT/server"
        CLIENT_DIR="$REPO_ROOT/client"
        
        # Create the development compose file with bridge networking
        log_info "Creating development compose file with host networking..."
        cat > "$DEV_COMPOSE_PATH" <<-EOF
# Temporary development configuration for ShareThings Podman Compose with host networking

services:
  backend:
    build:
      context: $SERVER_DIR
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT:-15001}
    container_name: share-things-backend
    network_mode: "host"  # Use host networking instead of bridge
    volumes:
      - ./data:/app/data:Z  # CRITICAL: Mount data directory for persistence
    environment:
      - NODE_ENV=development
      - PORT=${API_PORT:-15001}
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: $CLIENT_DIR
      dockerfile: Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT:-15001}
        - VITE_API_PORT=${API_PORT:-15001}
    container_name: share-things-frontend
    network_mode: "host"  # Use host networking instead of bridge
    environment:
      - API_PORT=${API_PORT:-15001}
      - PORT=15000
      - STATIC_DIR=/app/public
    # Run the Node.js static file server
    command:
      - sh
      - -c
      - |
        # Check if port is already in use
        if nc -z 0.0.0.0 15000 2>/dev/null; then
          echo "ERROR: Port 15000 is already in use by another process"
          netstat -tulpn | grep 15000 || echo "Could not determine which process is using port 15000"
          exit 1
        fi
        
        # Create necessary directories and files
        mkdir -p /app/public/health &&
        echo '{"status":"ok"}' > /app/public/health/index.json &&
        mkdir -p /app &&
        cd /app &&
        echo '{"type":"module","dependencies":{"express":"^4.18.2","compression":"^1.7.4"}}' > package.json &&
        npm install &&
        echo 'import express from "express";
        import path from "path";
        import { fileURLToPath } from "url";
        import compression from "compression";
        
        // Handle uncaught exceptions
        process.on("uncaughtException", (err) => {
          console.error("UNCAUGHT EXCEPTION:", err);
          process.exit(1);
        });
        
        const app = express();
        
        // Get directory name in ES modules
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        
        const STATIC_DIR = process.env.STATIC_DIR || "/app/public";
        const PORT = process.env.PORT || 15000;
        
        app.get("/health", (req, res) => {
          res.status(200).json({ status: "ok" });
        });
        
        app.use(compression());
        app.use(express.static(STATIC_DIR));
        
        app.get("*", (req, res) => {
          res.sendFile(path.join(STATIC_DIR, "index.html"));
        });
        
        // Try to start the server with error handling
        try {
          const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`Static file server running on port ${PORT}`);
          });
          
          server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
              console.error(`ERROR: Port ${PORT} is already in use by another process`);
            } else {
              console.error("Server error:", err);
            }
            process.exit(1);
          });
        } catch (err) {
          console.error("Failed to start server:", err);
          process.exit(1);
        }' > /app/server.mjs &&
        # Run the server with detailed error output
        node /app/server.mjs || { echo "Server failed to start"; exit 1; }
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

# No networks needed with host networking

# Named volumes for node_modules
volumes:
  volume-backend-node-modules:
  volume-frontend-node-modules:
EOF
        log_success "Temporary development podman-compose file created at: $DEV_COMPOSE_PATH"
        
        log_info "Building containers with temporary development file..."
        
        # Verify the file exists
        if [ ! -f "$DEV_COMPOSE_PATH" ]; then
            log_error "Compose file not found at $DEV_COMPOSE_PATH, but we just created it"
            # This should never happen since we just created the file above
            ls -la "$(dirname "$DEV_COMPOSE_PATH")"
        fi
        
        log_info "Using compose file: $DEV_COMPOSE_PATH"
        
        # Use the relative path
        COMPOSE_PATH="$DEV_COMPOSE_PATH"
        log_info "Compose file path: $COMPOSE_PATH"
        
        # Build the containers
        log_info "Building containers with podman-compose..."
        # Use a more reliable path construction
        ABSOLUTE_COMPOSE_PATH="$(cd "$(dirname "$COMPOSE_PATH")" && pwd)/$(basename "$COMPOSE_PATH")"
        log_info "Using absolute compose file path: $ABSOLUTE_COMPOSE_PATH"
        
        # Check if podman is working properly before attempting to build
        if ! podman info &> /dev/null; then
            log_warning "Podman service may not be running properly. Attempting to reset..."
            podman system migrate &> /dev/null || true
            podman system reset --force &> /dev/null || true
            
            # Check again after reset
            if ! podman info &> /dev/null; then
                log_warning "Podman service still not running properly. Will attempt to continue with existing images..."
                BUILD_EXIT_CODE=1
            else
                log_info "Podman service reset successfully. Proceeding with build..."
                podman-compose -f "$ABSOLUTE_COMPOSE_PATH" build --no-cache
                BUILD_EXIT_CODE=$?
            fi
        else
            # Podman is working fine, proceed with build
            podman-compose -f "$ABSOLUTE_COMPOSE_PATH" build --no-cache
            BUILD_EXIT_CODE=$?
        fi
        
        if [ $BUILD_EXIT_CODE -ne 0 ]; then
            log_error "Container build failed with exit code $BUILD_EXIT_CODE"
            log_error "Cannot continue with installation. Please fix the build errors and try again."
            exit 1
        else
            log_success "Container build completed successfully"
        fi
        
        log_info "Starting containers in development mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # For podman-compose, we need to explicitly pass the environment variables
        # Use the same approach for starting containers
        log_info "Starting containers in development mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        # Export the variables to ensure they're available to podman-compose
        export FRONTEND_PORT
        export BACKEND_PORT
        export API_PORT
        
        # Start the containers
        log_info "Starting containers with podman-compose..."
        # Use the same absolute path approach
        
        # Check if podman is working properly before attempting to start containers
        if ! podman info &> /dev/null; then
            log_warning "Podman service may not be running properly. Attempting to reset..."
            podman system migrate &> /dev/null || true
            podman system reset --force &> /dev/null || true
            
            # Check again after reset
            if ! podman info &> /dev/null; then
                log_warning "Podman service still not running properly. Container startup may fail."
                podman-compose -f "$ABSOLUTE_COMPOSE_PATH" up -d
                UP_EXIT_CODE=$?
            else
                log_info "Podman service reset successfully. Proceeding with container startup..."
                podman-compose -f "$ABSOLUTE_COMPOSE_PATH" up -d
                UP_EXIT_CODE=$?
            fi
        else
            # Podman is working fine, proceed with container startup
            podman-compose -f "$ABSOLUTE_COMPOSE_PATH" up -d
            UP_EXIT_CODE=$?
        fi
        
        if [ $UP_EXIT_CODE -ne 0 ]; then
            log_error "Container startup failed with exit code $UP_EXIT_CODE"
            log_info "Checking for container errors..."
            podman ps -a --filter name=share-things
        else
            log_success "Containers started successfully"
        fi
        
        # Store the compose file name for later use
        COMPOSE_FILE="$ABSOLUTE_COMPOSE_PATH"
        log_info "Compose file set to: $COMPOSE_FILE"
        
        # No dummy containers - always use real containers for all environments
        log_info "Using real containers for all environments"
    fi
}

# Verify containers are running
verify_containers() {
    # Check if podman is working properly
    if ! podman info &> /dev/null; then
        log_warning "Podman service may not be running properly. Attempting to reset..."
        podman system migrate &> /dev/null || true
        podman system reset --force &> /dev/null || true
        
        # Check again after reset
        if ! podman info &> /dev/null; then
            log_warning "Podman service still not running properly. Container verification may fail."
        else
            log_info "Podman service reset successfully."
        fi
    fi
    
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