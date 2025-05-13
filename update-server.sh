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
    # Try both naming conventions (with hyphens and with underscores)
    FRONTEND_ID=$(podman ps -q --filter name=share-things-frontend)
    if [ -z "$FRONTEND_ID" ]; then
        FRONTEND_ID=$(podman ps -q --filter name=share-things_frontend)
    fi
    
    BACKEND_ID=$(podman ps -q --filter name=share-things-backend)
    if [ -z "$BACKEND_ID" ]; then
        BACKEND_ID=$(podman ps -q --filter name=share-things_backend)
    fi
    
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
    # Try both naming conventions (with hyphens and with underscores)
    FRONTEND_ID=$(docker ps -q --filter name=share-things-frontend)
    if [ -z "$FRONTEND_ID" ]; then
        FRONTEND_ID=$(docker ps -q --filter name=share-things_frontend)
    fi
    
    BACKEND_ID=$(docker ps -q --filter name=share-things-backend)
    if [ -z "$BACKEND_ID" ]; then
        BACKEND_ID=$(docker ps -q --filter name=share-things_backend)
    fi
    
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
else
    # Default to value in .env file or default if not found
    FRONTEND_PORT=${FRONTEND_PORT:-8080}
    echo -e "${YELLOW}No frontend port mapping found, using default: $FRONTEND_PORT${NC}"
fi

if [ -n "$BACKEND_PORT_MAPPING" ]; then
    export BACKEND_PORT=$BACKEND_PORT_MAPPING
    echo -e "${GREEN}Setting BACKEND_PORT=$BACKEND_PORT${NC}"
else
    # Default to value in .env file or default if not found
    BACKEND_PORT=${BACKEND_PORT:-3001}
    echo -e "${YELLOW}No backend port mapping found, using default: $BACKEND_PORT${NC}"
fi

if [ -n "$API_PORT" ]; then
    export API_PORT=$API_PORT
    echo -e "${GREEN}Setting API_PORT=$API_PORT${NC}"
else
    # Default to value in .env file or default if not found
    API_PORT=${API_PORT:-3001}
    echo -e "${YELLOW}No API port found, using default: $API_PORT${NC}"
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

# Stop running containers - with enhanced container stopping logic
echo -e "${YELLOW}Stopping running containers...${NC}"

# Save the currently running container IDs for later verification
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    RUNNING_CONTAINERS_BEFORE=$(podman ps -a -q --filter name=share-things)
else
    RUNNING_CONTAINERS_BEFORE=$(docker ps -a -q --filter name=share-things)
fi

# First attempt with docker-compose/podman-compose down
echo -e "${YELLOW}Stopping containers with ${COMPOSE_CMD}...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE down
COMPOSE_EXIT_CODE=$?

# Check if any containers are still running with either naming convention
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    STILL_RUNNING_AFTER_COMPOSE=$(podman ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING_AFTER_COMPOSE" ]; then
        echo -e "${YELLOW}Some containers are still running after ${COMPOSE_CMD} down. Will try direct stop.${NC}"
    fi
else
    STILL_RUNNING_AFTER_COMPOSE=$(docker ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING_AFTER_COMPOSE" ]; then
        echo -e "${YELLOW}Some containers are still running after ${COMPOSE_CMD} down. Will try direct stop.${NC}"
    fi
fi

# Second - try force stopping specific containers regardless of first attempt outcome
echo -e "${YELLOW}Force stopping individual containers to ensure clean state...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo -e "${YELLOW}Force stopping Podman containers...${NC}"
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
    echo -e "${YELLOW}Removing Podman containers...${NC}"
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
    echo -e "${YELLOW}Cleaning up networks...${NC}"
    podman network prune -f 2>/dev/null || echo "Network prune not supported or no networks to remove"
else
    echo -e "${YELLOW}Force stopping Docker containers...${NC}"
    # Get all container IDs with either naming convention
    CONTAINER_IDS=$(docker ps -a -q --filter name=share-things)
    
    if [ -n "$CONTAINER_IDS" ]; then
        # Display container IDs being stopped
        echo "$CONTAINER_IDS"
        
        # Stop with extended timeout
        for CONTAINER_ID in $CONTAINER_IDS; do
            docker stop --time 10 $CONTAINER_ID 2>/dev/null || echo "Failed to stop container $CONTAINER_ID"
        done
    else
        echo "No running containers to stop"
    fi
    
    # Remove containers with force flag
    echo -e "${YELLOW}Removing Docker containers...${NC}"
    CONTAINER_IDS=$(docker ps -a -q --filter name=share-things)
    
    if [ -n "$CONTAINER_IDS" ]; then
        # Display container IDs being removed
        echo "$CONTAINER_IDS"
        
        # Remove containers
        for CONTAINER_ID in $CONTAINER_IDS; do
            docker rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
        done
    else
        echo "No containers to remove"
    fi
    
    # Clean up any associated networks
    echo -e "${YELLOW}Cleaning up networks...${NC}"
    docker network prune -f 2>/dev/null || echo "No networks to remove"
fi

# Final verification to make sure ALL containers are stopped
echo -e "${YELLOW}Performing final verification...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    STILL_RUNNING=$(podman ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING" ]; then
        echo -e "${RED}ERROR: Some containers are still running despite multiple stop attempts!${NC}"
        echo -e "${RED}This could cause problems with the update. Listing containers:${NC}"
        podman ps | grep "share-things"
        
        # Last resort - kill with SIGKILL
        echo -e "${RED}Performing emergency container kill...${NC}"
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
            echo -e "${RED}CRITICAL: Unable to stop containers. Manual intervention required.${NC}"
            echo -e "${RED}Please stop all ShareThings containers manually before continuing.${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}All containers stopped successfully.${NC}"
else
    STILL_RUNNING=$(docker ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING" ]; then
        echo -e "${RED}ERROR: Some containers are still running despite multiple stop attempts!${NC}"
        echo -e "${RED}This could cause problems with the update. Listing containers:${NC}"
        docker ps | grep "share-things"
        
        # Last resort - kill with SIGKILL
        echo -e "${RED}Performing emergency container kill...${NC}"
        CONTAINER_IDS=$(docker ps -q --filter name=share-things)
        if [ -n "$CONTAINER_IDS" ]; then
            for CONTAINER_ID in $CONTAINER_IDS; do
                echo "Killing container $CONTAINER_ID"
                docker kill $CONTAINER_ID 2>/dev/null || echo "Failed to kill container $CONTAINER_ID"
            done
        fi
        
        CONTAINER_IDS=$(docker ps -a -q --filter name=share-things)
        if [ -n "$CONTAINER_IDS" ]; then
            for CONTAINER_ID in $CONTAINER_IDS; do
                echo "Removing container $CONTAINER_ID"
                docker rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
            done
        fi
        
        # Check one more time
        FINAL_CHECK=$(docker ps -q --filter name=share-things)
        if [ -n "$FINAL_CHECK" ]; then
            echo -e "${RED}CRITICAL: Unable to stop containers. Manual intervention required.${NC}"
            echo -e "${RED}Please stop all ShareThings containers manually before continuing.${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}All containers stopped successfully.${NC}"
fi

# Clean container image cache before rebuilding
echo -e "${YELLOW}Cleaning container image cache before rebuilding...${NC}"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo -e "${YELLOW}Cleaning Podman image cache...${NC}"
    # Remove dangling images (not used by any container)
    podman image prune -f
    echo -e "${GREEN}Podman dangling images removed.${NC}"
    
    # Ask if user wants to do a more aggressive cleanup
    read -p "Do you want to perform a more aggressive cache cleanup? This will remove all unused images. (y/n): " FULL_CLEANUP
    if [[ $FULL_CLEANUP =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Performing full Podman system prune...${NC}"
        podman system prune -f
        echo -e "${GREEN}Podman system cache cleaned.${NC}"
    fi
else
    echo -e "${YELLOW}Cleaning Docker image cache...${NC}"
    # Remove dangling images (not used by any container)
    docker image prune -f
    echo -e "${GREEN}Docker dangling images removed.${NC}"
    
    # Ask if user wants to do a more aggressive cleanup
    read -p "Do you want to perform a more aggressive cache cleanup? This will remove all unused images. (y/n): " FULL_CLEANUP
    if [[ $FULL_CLEANUP =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Performing full Docker system prune...${NC}"
        docker system prune -f
        echo -e "${GREEN}Docker system cache cleaned.${NC}"
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
    
    # Create a temporary .env file to ensure environment variables are properly passed
    echo "FRONTEND_PORT=$FRONTEND_PORT" > .env.temp
    echo "BACKEND_PORT=$BACKEND_PORT" >> .env.temp
    echo "API_PORT=$API_PORT" >> .env.temp
    
    # Use the env-file option to ensure variables are properly passed
    $COMPOSE_CMD -f $COMPOSE_FILE --env-file .env.temp up -d
else
    # For docker-compose, explicitly pass environment variables
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT${NC}"
    
    # Create a temporary .env file to ensure environment variables are properly passed
    echo "FRONTEND_PORT=$FRONTEND_PORT" > .env.temp
    echo "BACKEND_PORT=$BACKEND_PORT" >> .env.temp
    echo "API_PORT=$API_PORT" >> .env.temp
    
    # Use the env-file option to ensure variables are properly passed
    $COMPOSE_CMD -f $COMPOSE_FILE --env-file .env.temp up -d
fi

START_EXIT_CODE=$?

# Clean up temporary .env file
if [ -f .env.temp ]; then
    rm .env.temp
    echo -e "${GREEN}Temporary environment file removed.${NC}"
fi

# Add additional debugging for port configuration
echo -e "${YELLOW}Verifying port configuration...${NC}"
echo -e "Expected configuration:"
echo -e "  Frontend Port: ${FRONTEND_PORT}"
echo -e "  Backend Port: ${BACKEND_PORT}"
echo -e "  API Port: ${API_PORT}"

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
    
    # Check for frontend container - try both naming conventions
    FRONTEND_RUNNING=$(podman ps -q --filter name=share-things | grep -E 'frontend|_frontend_' | wc -l)
    if [ "$FRONTEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Frontend container is running.${NC}"
        echo -e "${YELLOW}Frontend port mapping:${NC}"
        # Try both naming conventions for port display
        podman port share-things-frontend 2>/dev/null || podman port share-things_frontend_1 2>/dev/null || echo "Could not display port mapping"
    else
        echo -e "${RED}Frontend container is not running.${NC}"
    fi
    
    # Check for backend container - try both naming conventions
    BACKEND_RUNNING=$(podman ps -q --filter name=share-things | grep -E 'backend|_backend_' | wc -l)
    if [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Backend container is running.${NC}"
        echo -e "${YELLOW}Backend port mapping:${NC}"
        # Try both naming conventions for port display
        podman port share-things-backend 2>/dev/null || podman port share-things_backend_1 2>/dev/null || echo "Could not display port mapping"
    else
        echo -e "${RED}Backend container is not running.${NC}"
    fi
    
    # Overall verification - make sure we have at least one frontend and one backend container
    if [ "$FRONTEND_RUNNING" -gt "0" ] && [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Deployment verified. All containers are running.${NC}"
    else
        echo -e "${RED}Verification failed. Not all containers are running.${NC}"
        echo "You can check container logs with: podman logs <container_name>"
        
        # Show logs for troubleshooting
        echo -e "${YELLOW}Checking container logs for errors...${NC}"
        echo "Backend container logs:"
        # Try both naming conventions for logs
        podman logs share-things-backend --tail 20 2>/dev/null || podman logs share-things_backend_1 --tail 20 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        # Try both naming conventions for logs
        podman logs share-things-frontend --tail 20 2>/dev/null || podman logs share-things_frontend_1 --tail 20 2>/dev/null || echo "No logs available for frontend container"
    fi
else
    echo -e "${YELLOW}Listing all running containers:${NC}"
    docker ps | grep "share-things" || echo "No matching containers found"
    
    # Check for frontend container - try both naming conventions
    FRONTEND_RUNNING=$(docker ps -q --filter name=share-things | grep -E 'frontend|_frontend_' | wc -l)
    if [ "$FRONTEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Frontend container is running.${NC}"
        echo -e "${YELLOW}Frontend port mapping:${NC}"
        # Try both naming conventions for port display
        docker port share-things-frontend 2>/dev/null || docker port share-things_frontend_1 2>/dev/null || echo "Could not display port mapping"
    else
        echo -e "${RED}Frontend container is not running.${NC}"
    fi
    
    # Check for backend container - try both naming conventions
    BACKEND_RUNNING=$(docker ps -q --filter name=share-things | grep -E 'backend|_backend_' | wc -l)
    if [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Backend container is running.${NC}"
        echo -e "${YELLOW}Backend port mapping:${NC}"
        # Try both naming conventions for port display
        docker port share-things-backend 2>/dev/null || docker port share-things_backend_1 2>/dev/null || echo "Could not display port mapping"
    else
        echo -e "${RED}Backend container is not running.${NC}"
    fi
    
    # Overall verification - make sure we have at least one frontend and one backend container
    if [ "$FRONTEND_RUNNING" -gt "0" ] && [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Deployment verified. All containers are running.${NC}"
        
        # Add detailed port verification
        echo -e "${YELLOW}Verifying actual port configuration:${NC}"
        if [ -n "$BACKEND_ID" ]; then
            echo -e "${YELLOW}Backend container port configuration:${NC}"
            docker inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{$p}} -> {{(index $conf 0).HostPort}}{{end}}'
            echo -e "${YELLOW}Backend container environment variables:${NC}"
            docker inspect $BACKEND_ID --format '{{range .Config.Env}}{{.}}{{println}}{{end}}' | grep -E 'PORT|LISTEN'
        fi
        
        # Add detailed port verification
        echo -e "${YELLOW}Verifying actual port configuration:${NC}"
        if [ -n "$BACKEND_ID" ]; then
            echo -e "${YELLOW}Backend container port configuration:${NC}"
            podman inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{$p}} -> {{(index $conf 0).HostPort}}{{end}}'
            echo -e "${YELLOW}Backend container environment variables:${NC}"
            podman inspect $BACKEND_ID --format '{{range .Config.Env}}{{.}}{{println}}{{end}}' | grep -E 'PORT|LISTEN'
        fi
    else
        echo -e "${RED}Verification failed. Not all containers are running.${NC}"
        echo "You can check container logs with: docker logs <container_name>"
        
        # Show logs for troubleshooting
        echo -e "${YELLOW}Checking container logs for errors...${NC}"
        echo "Backend container logs:"
        # Try both naming conventions for logs
        docker logs share-things-backend --tail 20 2>/dev/null || docker logs share-things_backend_1 --tail 20 2>/dev/null || echo "No logs available for backend container"
        
        echo "Frontend container logs:"
        # Try both naming conventions for logs
        docker logs share-things-frontend --tail 20 2>/dev/null || docker logs share-things_frontend_1 --tail 20 2>/dev/null || echo "No logs available for frontend container"
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
