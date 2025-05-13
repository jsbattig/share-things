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
if command -v podman &> /dev/null && podman ps | grep -q "share-things"; then
    CONTAINER_ENGINE="podman"
    COMPOSE_CMD="podman-compose"
    CONTAINER_CMD="podman"
elif command -v docker &> /dev/null && docker ps | grep -q "share-things"; then
    CONTAINER_ENGINE="docker"
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
else
    echo -e "${YELLOW}No running ShareThings containers detected. Defaulting to Docker...${NC}"
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

# Check if we're running in production mode
if [ -f docker-compose.prod.yml ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo -e "${YELLOW}Production deployment detected. Using ${COMPOSE_FILE}${NC}"
elif [ -f docker-compose.prod.temp.yml ]; then
    COMPOSE_FILE="docker-compose.prod.temp.yml"
    echo -e "${YELLOW}Temporary production deployment detected. Using ${COMPOSE_FILE}${NC}"
else
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${YELLOW}Development deployment detected. Using ${COMPOSE_FILE}${NC}"
fi

# Stop running containers
echo -e "${YELLOW}Stopping running containers...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE down
echo -e "${GREEN}Containers stopped.${NC}"

# Rebuild containers
echo -e "${YELLOW}Rebuilding containers with latest code...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE build
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Container build failed. Please check the error messages above.${NC}"
    exit 1
fi
echo -e "${GREEN}Containers rebuilt successfully.${NC}"

# Start containers
echo -e "${YELLOW}Starting updated containers...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE up -d
START_EXIT_CODE=$?

if [ $START_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Failed to start containers. Please check the error messages above.${NC}"
    exit 1
fi
echo -e "${GREEN}Containers started successfully.${NC}"

# Verify containers are running
echo -e "${YELLOW}Verifying deployment...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    RUNNING_COUNT=$(podman ps --filter label=io.podman.compose.project=share-things | grep -c "share-things" || echo "0")
    if [ "$RUNNING_COUNT" -ge "2" ]; then
        echo -e "${GREEN}Deployment verified. Containers are running.${NC}"
    else
        echo -e "${RED}Verification failed. Not all containers are running.${NC}"
        echo "You can check container logs with: podman logs <container_name>"
    fi
else
    RUNNING_COUNT=$(docker ps --filter label=com.docker.compose.project=share-things | grep -c "share-things" || echo "0")
    if [ "$RUNNING_COUNT" -ge "2" ]; then
        echo -e "${GREEN}Deployment verified. Containers are running.${NC}"
    else
        echo -e "${RED}Verification failed. Not all containers are running.${NC}"
        echo "You can check container logs with: docker logs <container_name>"
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