#!/bin/bash

# ShareThings Server Update Script
# This script updates a running ShareThings deployment with the latest code
# without requiring re-configuration

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses BSD sed which requires an extension argument for -i
    SED_CMD="sed -i.bak"
else
    # Linux and others use GNU sed
    SED_CMD="sed -i"
fi

echo -e "${BLUE}=== ShareThings Server Update ===${NC}"
echo "This script will update your ShareThings deployment with the latest code."
echo ""

# Detect which container engine is being used
if command -v podman &> /dev/null; then
    if podman ps --all | grep -q "share-things"; then
        CONTAINER_ENGINE="podman"
        COMPOSE_CMD="podman-compose"
        CONTAINER_CMD="podman"
        echo -e "${GREEN}Detected running Podman containers${NC}"
    else
        echo -e "${YELLOW}No running Podman containers detected${NC}"
        CONTAINER_ENGINE="podman"
        COMPOSE_CMD="podman-compose"
        CONTAINER_CMD="podman"
    fi
elif command -v docker &> /dev/null; then
    if docker ps --all | grep -q "share-things"; then
        CONTAINER_ENGINE="docker"
        COMPOSE_CMD="docker-compose"
        CONTAINER_CMD="docker"
        echo -e "${GREEN}Detected running Docker containers${NC}"
    else
        echo -e "${YELLOW}No running Docker containers detected${NC}"
        CONTAINER_ENGINE="docker"
        COMPOSE_CMD="docker-compose"
        CONTAINER_CMD="docker"
    fi
else
    echo -e "${YELLOW}No container engine detected. Defaulting to Docker...${NC}"
    CONTAINER_ENGINE="docker"
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
fi

echo -e "${GREEN}Using ${CONTAINER_ENGINE^} for container operations${NC}"

# Backup current configuration files
echo -e "${YELLOW}Backing up current configuration...${NC}"
mkdir -p ./backups/$(date +%Y%m%d_%H%M%S)
cp .env ./backups/$(date +%Y%m%d_%H%M%S)/.env 2>/dev/null || echo "No .env file to backup"
cp client/.env ./backups/$(date +%Y%m%d_%H%M%S)/client.env 2>/dev/null || echo "No client/.env file to backup"
cp server/.env ./backups/$(date +%Y%m%d_%H%M%S)/server.env 2>/dev/null || echo "No server/.env file to backup"
cp docker-compose.prod.yml ./backups/$(date +%Y%m%d_%H%M%S)/docker-compose.prod.yml 2>/dev/null || echo "No docker-compose.prod.yml file to backup"
echo -e "${GREEN}Configuration backed up to ./backups/$(date +%Y%m%d_%H%M%S)/${NC}"

# Pull latest code if this is a git repository
if [ -d .git ]; then
    echo -e "${YELLOW}Pulling latest code from git repository...${NC}"
    git pull
    GIT_EXIT_CODE=$?
    if [ $GIT_EXIT_CODE -ne 0 ]; then
        echo -e "${RED}Failed to pull latest code. You may have local changes.${NC}"
        read -p "Do you want to continue with the update anyway? (y/n): " CONTINUE_UPDATE
        if [[ ! $CONTINUE_UPDATE =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Update cancelled.${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}Latest code pulled successfully.${NC}"
    fi
else
    echo -e "${YELLOW}Not a git repository. Skipping code update.${NC}"
    echo -e "${YELLOW}If you want to update the code, please do so manually before continuing.${NC}"
    read -p "Continue with container rebuild? (y/n): " CONTINUE_UPDATE
    if [[ ! $CONTINUE_UPDATE =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Update cancelled.${NC}"
        exit 1
    fi
fi

# Capture current container configuration before stopping
echo -e "${YELLOW}Capturing current container configuration...${NC}"

# Capture port configurations and other parameters
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    # Get container IDs for frontend and backend
    FRONTEND_ID=$(podman ps -q --filter name=share-things-frontend)
    BACKEND_ID=$(podman ps -q --filter name=share-things-backend)
    
    if [ -n "$FRONTEND_ID" ]; then
        echo -e "${GREEN}Found frontend container: $FRONTEND_ID${NC}"
        FRONTEND_PORT_MAPPING=$(podman port $FRONTEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->80)')
        echo -e "${GREEN}Frontend port mapping: $FRONTEND_PORT_MAPPING${NC}"
    else
        echo -e "${YELLOW}No frontend container found${NC}"
    fi
    
    if [ -n "$BACKEND_ID" ]; then
        echo -e "${GREEN}Found backend container: $BACKEND_ID${NC}"
        BACKEND_PORT_MAPPING=$(podman port $BACKEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->)')
        API_PORT=$(podman inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "3001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null || echo "")
        if [ -z "$API_PORT" ]; then
            # Try alternative approach for Podman
            API_PORT=$(podman inspect $BACKEND_ID --format '{{range .HostConfig.PortBindings}}{{(index . 0).HostPort}}{{end}}' 2>/dev/null || echo "")
        fi
        echo -e "${GREEN}Backend port mapping: $BACKEND_PORT_MAPPING${NC}"
        echo -e "${GREEN}API port: $API_PORT${NC}"
    else
        echo -e "${YELLOW}No backend container found${NC}"
    fi
else
    # Docker version
    FRONTEND_ID=$(docker ps -q --filter name=share-things-frontend)
    BACKEND_ID=$(docker ps -q --filter name=share-things-backend)
    
    if [ -n "$FRONTEND_ID" ]; then
        echo -e "${GREEN}Found frontend container: $FRONTEND_ID${NC}"
        FRONTEND_PORT_MAPPING=$(docker port $FRONTEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->80)')
        echo -e "${GREEN}Frontend port mapping: $FRONTEND_PORT_MAPPING${NC}"
    else
        echo -e "${YELLOW}No frontend container found${NC}"
    fi
    
    if [ -n "$BACKEND_ID" ]; then
        echo -e "${GREEN}Found backend container: $BACKEND_ID${NC}"
        BACKEND_PORT_MAPPING=$(docker port $BACKEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->)')
        API_PORT=$(docker inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "3001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null || echo "")
        echo -e "${GREEN}Backend port mapping: $BACKEND_PORT_MAPPING${NC}"
        echo -e "${GREEN}API port: $API_PORT${NC}"
    else
        echo -e "${YELLOW}No backend container found${NC}"
    fi
fi

# Save captured configuration to environment variables
if [ -n "$FRONTEND_PORT_MAPPING" ]; then
    export FRONTEND_PORT=$FRONTEND_PORT_MAPPING
    echo -e "${GREEN}Setting FRONTEND_PORT=$FRONTEND_PORT${NC}"
fi

if [ -n "$BACKEND_PORT_MAPPING" ]; then
    export BACKEND_PORT=$BACKEND_PORT_MAPPING
    echo -e "${GREEN}Setting BACKEND_PORT=$BACKEND_PORT${NC}"
fi

if [ -n "$API_PORT" ]; then
    export API_PORT=$API_PORT
    echo -e "${GREEN}Setting API_PORT=$API_PORT${NC}"
fi

# Check if we're running in production mode
if [ -f docker-compose.prod.yml ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo -e "${YELLOW}Production deployment detected. Using ${COMPOSE_FILE}${NC}"
    PRODUCTION_MODE="yes"
elif [ -f docker-compose.prod.temp.yml ]; then
    COMPOSE_FILE="docker-compose.prod.temp.yml"
    echo -e "${YELLOW}Temporary production deployment detected. Using ${COMPOSE_FILE}${NC}"
    PRODUCTION_MODE="yes"
else
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${YELLOW}Development deployment detected. Using ${COMPOSE_FILE}${NC}"
    PRODUCTION_MODE="no"
fi

# List all running containers before stopping
echo -e "${YELLOW}Listing all running containers before stopping...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    podman ps --all | grep "share-things" || echo "No matching containers found"
else
    docker ps --all | grep "share-things" || echo "No matching containers found"
fi

# Stop running containers
echo -e "${YELLOW}Stopping running containers...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE down
COMPOSE_EXIT_CODE=$?

if [ $COMPOSE_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Warning: Compose down command failed. Attempting to force stop containers...${NC}"
    
    # Force stop and remove containers
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        echo -e "${YELLOW}Force stopping Podman containers...${NC}"
        podman stop $(podman ps -a -q --filter name=share-things) 2>/dev/null || echo "No containers to stop"
        podman rm $(podman ps -a -q --filter name=share-things) 2>/dev/null || echo "No containers to remove"
    else
        echo -e "${YELLOW}Force stopping Docker containers...${NC}"
        docker stop $(docker ps -a -q --filter name=share-things) 2>/dev/null || echo "No containers to stop"
        docker rm $(docker ps -a -q --filter name=share-things) 2>/dev/null || echo "No containers to remove"
    fi
fi

# Verify all containers are stopped
echo -e "${YELLOW}Verifying all containers are stopped...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    RUNNING_COUNT=$(podman ps -q --filter name=share-things | wc -l)
    if [ "$RUNNING_COUNT" -gt "0" ]; then
        echo -e "${RED}Warning: Some containers are still running. Attempting to force stop...${NC}"
        podman ps | grep "share-things"
        podman stop $(podman ps -q --filter name=share-things) 2>/dev/null || echo "Failed to stop containers"
    else
        echo -e "${GREEN}All containers stopped successfully.${NC}"
    fi
else
    RUNNING_COUNT=$(docker ps -q --filter name=share-things | wc -l)
    if [ "$RUNNING_COUNT" -gt "0" ]; then
        echo -e "${RED}Warning: Some containers are still running. Attempting to force stop...${NC}"
        docker ps | grep "share-things"
        docker stop $(docker ps -q --filter name=share-things) 2>/dev/null || echo "Failed to stop containers"
    else
        echo -e "${GREEN}All containers stopped successfully.${NC}"
    fi
fi

# Rebuild containers
echo -e "${YELLOW}Rebuilding containers with latest code...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE build
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Container build failed. Please check the error messages above.${NC}"
    exit 1
fi
echo -e "${GREEN}Containers rebuilt successfully.${NC}"

# Start containers with preserved configuration
echo -e "${YELLOW}Starting updated containers with preserved configuration...${NC}"

# Pass environment variables explicitly
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    # For podman-compose, we need to explicitly pass the environment variables
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT${NC}"
    FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT $COMPOSE_CMD -f $COMPOSE_FILE up -d
else
    # For docker-compose, we can use the -e flag to pass environment variables
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT${NC}"
    $COMPOSE_CMD -f $COMPOSE_FILE up -d
fi

START_EXIT_CODE=$?

if [ $START_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Failed to start containers. Please check the error messages above.${NC}"
    exit 1
fi
echo -e "${GREEN}Containers started successfully.${NC}"

# Verify containers are running
echo -e "${YELLOW}Verifying deployment...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo -e "${YELLOW}Listing all running containers:${NC}"
    podman ps | grep "share-things" || echo "No matching containers found"
    
    # Check for frontend container
    FRONTEND_RUNNING=$(podman ps -q --filter name=share-things-frontend | wc -l)
    if [ "$FRONTEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Frontend container is running.${NC}"
        echo -e "${YELLOW}Frontend port mapping:${NC}"
        podman port share-things-frontend
    else
        echo -e "${RED}Frontend container is not running.${NC}"
    fi
    
    # Check for backend container
    BACKEND_RUNNING=$(podman ps -q --filter name=share-things-backend | wc -l)
    if [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Backend container is running.${NC}"
        echo -e "${YELLOW}Backend port mapping:${NC}"
        podman port share-things-backend
    else
        echo -e "${RED}Backend container is not running.${NC}"
    fi
    
    # Overall verification
    RUNNING_COUNT=$(podman ps -q --filter name=share-things | wc -l)
    if [ "$RUNNING_COUNT" -ge "2" ]; then
        echo -e "${GREEN}Deployment verified. All containers are running.${NC}"
    else
        echo -e "${RED}Verification failed. Not all containers are running.${NC}"
        echo "You can check container logs with: podman logs <container_name>"
        
        # Show logs for troubleshooting
        echo -e "${YELLOW}Checking container logs for errors...${NC}"
        echo "Backend container logs:"
        podman logs share-things-backend --tail 20 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        podman logs share-things-frontend --tail 20 2>/dev/null || echo "No logs available for frontend container"
    fi
else
    echo -e "${YELLOW}Listing all running containers:${NC}"
    docker ps | grep "share-things" || echo "No matching containers found"
    
    # Check for frontend container
    FRONTEND_RUNNING=$(docker ps -q --filter name=share-things-frontend | wc -l)
    if [ "$FRONTEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Frontend container is running.${NC}"
        echo -e "${YELLOW}Frontend port mapping:${NC}"
        docker port share-things-frontend
    else
        echo -e "${RED}Frontend container is not running.${NC}"
    fi
    
    # Check for backend container
    BACKEND_RUNNING=$(docker ps -q --filter name=share-things-backend | wc -l)
    if [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Backend container is running.${NC}"
        echo -e "${YELLOW}Backend port mapping:${NC}"
        docker port share-things-backend
    else
        echo -e "${RED}Backend container is not running.${NC}"
    fi
    
    # Overall verification
    RUNNING_COUNT=$(docker ps -q --filter name=share-things | wc -l)
    if [ "$RUNNING_COUNT" -ge "2" ]; then
        echo -e "${GREEN}Deployment verified. All containers are running.${NC}"
    else
        echo -e "${RED}Verification failed. Not all containers are running.${NC}"
        echo "You can check container logs with: docker logs <container_name>"
        
        # Show logs for troubleshooting
        echo -e "${YELLOW}Checking container logs for errors...${NC}"
        echo "Backend container logs:"
        docker logs share-things-backend --tail 20 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        docker logs share-things-frontend --tail 20 2>/dev/null || echo "No logs available for frontend container"
    fi
fi

# Clean up any backup files created by sed on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi

echo -e "${BLUE}=== Update Complete ===${NC}"
echo "Your ShareThings deployment has been updated with the latest code."
echo "If you encounter any issues, you can restore your configuration from the backup."

# Display current configuration
echo ""
echo -e "${BLUE}=== Current Configuration ===${NC}"
echo "Container Engine: ${CONTAINER_ENGINE}"
echo "Compose File: ${COMPOSE_FILE}"
echo "Frontend Port: ${FRONTEND_PORT}"
echo "Backend Port: ${BACKEND_PORT}"
echo "API Port: ${API_PORT}"
echo "Production Mode: ${PRODUCTION_MODE}"

# Add instructions for manual cleanup if needed
echo ""
echo -e "${BLUE}=== Troubleshooting ===${NC}"
echo "If you encounter issues with containers not updating properly, you can try:"
echo "1. Manual cleanup: ${CONTAINER_CMD} rm -f \$(${CONTAINER_CMD} ps -a -q --filter name=share-things)"
echo "2. Restart the update: ./update-server.sh"