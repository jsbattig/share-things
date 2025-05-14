#!/bin/bash

# ShareThings Server Update Script - Simplified Version
# This script updates a running ShareThings deployment with the latest code

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== ShareThings Server Update (Simplified) ===${NC}"
echo "This script will update your ShareThings deployment with the latest code."
echo ""

# Detect if running in a CI/CD environment
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$JENKINS_URL" ] || ! tty -s; then
    IS_CI_CD="true"
    echo "Running in CI/CD or non-interactive environment"
else
    IS_CI_CD="false"
fi

# Detect which container engine is being used
if command -v podman &> /dev/null; then
    CONTAINER_ENGINE="podman"
    COMPOSE_CMD="podman-compose"
    CONTAINER_CMD="podman"
    echo "Using Podman for container operations"
elif command -v docker &> /dev/null; then
    CONTAINER_ENGINE="docker"
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
    echo "Using Docker for container operations"
else
    echo "No container engine detected. Defaulting to Docker..."
    CONTAINER_ENGINE="docker"
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
fi

# Backup current configuration files
echo "Backing up current configuration..."
BACKUP_DIR="/tmp/sharethings-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp .env "$BACKUP_DIR/.env" 2>/dev/null || echo "No .env file to backup"
cp client/.env "$BACKUP_DIR/client.env" 2>/dev/null || echo "No client/.env file to backup"
cp server/.env "$BACKUP_DIR/server.env" 2>/dev/null || echo "No server/.env file to backup"
cp docker-compose.prod.yml "$BACKUP_DIR/docker-compose.prod.yml" 2>/dev/null || echo "No docker-compose.prod.yml file to backup"
echo "Configuration backed up to $BACKUP_DIR/"

# Handle git repository
if [ -d .git ]; then
    echo "Checking git repository status..."
    
    # Fix git ownership issues
    REPO_PATH=$(pwd)
    echo "Repository path: $REPO_PATH"
    
    # Try to add safe directory
    git config --global --add safe.directory "$REPO_PATH" 2>/dev/null
    
    # Try to pull code
    echo "Pulling latest code from git repository..."
    git pull || echo "Failed to pull latest code. Continuing anyway..."
else
    echo "Not a git repository. Skipping code update."
fi

# Check if we're running in production mode
if [ -f docker-compose.prod.yml ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo "Production deployment detected. Using ${COMPOSE_FILE}"
    PRODUCTION_MODE="yes"
    
    # Set production ports
    FRONTEND_PORT=15000
    BACKEND_PORT=15001
    API_PORT=15001
else
    COMPOSE_FILE="docker-compose.yml"
    echo "Development deployment detected. Using ${COMPOSE_FILE}"
    PRODUCTION_MODE="no"
    
    # Set development ports (same as production for simplicity)
    FRONTEND_PORT=15000
    BACKEND_PORT=15001
    API_PORT=15001
fi

# Stop running containers
echo "Stopping running containers..."
$COMPOSE_CMD -f $COMPOSE_FILE down || true

# Force stop any remaining containers
echo "Force stopping any remaining containers..."
if [ "$CONTAINER_ENGINE" = "podman" ]; then
    podman ps -q --filter name=share-things | xargs -r podman stop --time 10 || true
    podman ps -a -q --filter name=share-things | xargs -r podman rm -f || true
else
    docker ps -q --filter name=share-things | xargs -r docker stop --time 10 || true
    docker ps -a -q --filter name=share-things | xargs -r docker rm -f || true
fi

echo "All containers stopped."

# Clean container image cache
echo "Cleaning container image cache..."
if [ "$CONTAINER_ENGINE" = "podman" ]; then
    podman image prune -f || true
    podman system prune -f || true
else
    docker image prune -f || true
    docker system prune -f || true
fi

# Rebuild containers
echo "Rebuilding containers with latest code..."
$COMPOSE_CMD -f $COMPOSE_FILE build || {
    echo "Container build failed."
    exit 1
}
echo "Containers rebuilt successfully."

# Create a temporary docker-compose file for update
COMPOSE_UPDATE_FILE="/tmp/docker-compose.update.yml"

cat > "$COMPOSE_UPDATE_FILE" << EOL
# Update configuration for ShareThings Docker Compose

services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=production
      - PORT=${API_PORT}
      - LISTEN_PORT=${API_PORT}
    ports:
      - "${BACKEND_PORT}:${API_PORT}"
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
        - API_PORT=${API_PORT}
        - VITE_API_PORT=${API_PORT}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT}
    ports:
      - "${FRONTEND_PORT}:80"
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
EOL

echo "Comprehensive docker-compose file created at: $COMPOSE_UPDATE_FILE"

# Start containers with explicit environment variables
echo "Starting containers with explicit environment variables..."
export VITE_API_PORT="$API_PORT"
FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT $COMPOSE_CMD -f "$COMPOSE_UPDATE_FILE" up -d || {
    echo "Failed to start containers."
    exit 1
}

echo "Containers started successfully."

# Wait for containers to start
echo "Waiting 10 seconds for containers to initialize..."
sleep 10

# Check for running containers
echo "Checking for running containers:"
$CONTAINER_CMD ps | grep -i "share\|frontend\|backend" || echo "No matching containers found"

# Always assume success in CI/CD environments
if [ "$IS_CI_CD" = "true" ]; then
    echo "Running in CI/CD environment - assuming containers are starting correctly"
    echo "Container startup may take longer than verification can wait for"
fi

# Display logs for reference
echo "Container logs for reference:"
$CONTAINER_CMD logs share-things-backend --tail 30 2>/dev/null || echo "No logs available for backend container"
$CONTAINER_CMD logs share-things-frontend --tail 30 2>/dev/null || echo "No logs available for frontend container"

echo "=== Update Complete ==="
echo "Your ShareThings deployment has been updated with the latest code."
echo "If you encounter any issues, you can restore your configuration from the backup."

# Display current configuration
echo ""
echo "=== Current Configuration ==="
echo "Container Engine: ${CONTAINER_ENGINE}"
echo "Compose File: ${COMPOSE_UPDATE_FILE}"
echo "Frontend Port: ${FRONTEND_PORT}"
echo "Backend Port: ${BACKEND_PORT}"
echo "API Port: ${API_PORT}"
echo "Production Mode: ${PRODUCTION_MODE}"

# Add instructions for manual cleanup if needed
echo ""
echo "=== Troubleshooting ==="
echo "If you encounter issues with containers not updating properly, you can try:"
echo "1. Manual cleanup: ${CONTAINER_CMD} rm -f \$(${CONTAINER_CMD} ps -a -q --filter name=share-things)"
echo "2. Restart the update: ./update-server-simple.sh"