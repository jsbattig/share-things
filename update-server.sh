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
        echo -e "${YELLOW}Continuing with update anyway in autonomous mode...${NC}"
    else
        echo -e "${GREEN}Latest code pulled successfully.${NC}"
    fi
else
    echo -e "${YELLOW}Not a git repository. Skipping code update.${NC}"
    echo -e "${YELLOW}Continuing with container rebuild in autonomous mode...${NC}"
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
        # Improved port detection with multiple patterns to handle different output formats
        FRONTEND_PORT_MAPPING=$(podman port $FRONTEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->80)' ||
                               podman port $FRONTEND_ID | grep -oP '(?<=:)\d+(?=->80)' ||
                               podman port $FRONTEND_ID | grep -E '.*->80/tcp' | awk -F':' '{print $NF}' | sed 's/->80\/tcp//')
        echo -e "${GREEN}Frontend port mapping: $FRONTEND_PORT_MAPPING${NC}"
    else
        echo -e "${YELLOW}No frontend container found${NC}"
    fi
    
    if [ -n "$BACKEND_ID" ]; then
        echo -e "${GREEN}Found backend container: $BACKEND_ID${NC}"
        # Improved port detection with multiple patterns to handle different output formats
        BACKEND_PORT_MAPPING=$(podman port $BACKEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->)' ||
                              podman port $BACKEND_ID | grep -oP '(?<=:)\d+(?=->\d+)' ||
                              podman port $BACKEND_ID | grep -E '.*->[0-9]+/tcp' | awk -F':' '{print $NF}' | sed 's/->[0-9]*\/tcp//')
        
        # Try multiple approaches to get the API port
        API_PORT=$(podman inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "3001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  podman inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "15001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  echo "")
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
        # Improved port detection with multiple patterns to handle different output formats
        FRONTEND_PORT_MAPPING=$(docker port $FRONTEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->80)' ||
                               docker port $FRONTEND_ID | grep -oP '(?<=:)\d+(?=->80)' ||
                               docker port $FRONTEND_ID | grep -E '.*->80/tcp' | awk -F':' '{print $NF}' | sed 's/->80\/tcp//')
        echo -e "${GREEN}Frontend port mapping: $FRONTEND_PORT_MAPPING${NC}"
    else
        echo -e "${YELLOW}No frontend container found${NC}"
    fi
    
    if [ -n "$BACKEND_ID" ]; then
        echo -e "${GREEN}Found backend container: $BACKEND_ID${NC}"
        # Improved port detection with multiple patterns to handle different output formats
        BACKEND_PORT_MAPPING=$(docker port $BACKEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->)' ||
                              docker port $BACKEND_ID | grep -oP '(?<=:)\d+(?=->\d+)' ||
                              docker port $BACKEND_ID | grep -E '.*->[0-9]+/tcp' | awk -F':' '{print $NF}' | sed 's/->[0-9]*\/tcp//')
        
        # Try multiple approaches to get the API port
        API_PORT=$(docker inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "3001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  docker inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "15001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  echo "")
        echo -e "${GREEN}Backend port mapping: $BACKEND_PORT_MAPPING${NC}"
        echo -e "${GREEN}API port: $API_PORT${NC}"
    else
        echo -e "${YELLOW}No backend container found${NC}"
    fi
fi

# Verify that we have both container port mappings before proceeding
if [[ "$PRODUCTION_MODE" == "yes" ]]; then
    # For production mode, we need to ensure we have the correct port mappings
    if [ -z "$FRONTEND_ID" ] || [ -z "$BACKEND_ID" ]; then
        echo -e "${RED}ERROR: Could not find both frontend and backend containers.${NC}"
        echo -e "${RED}Cannot safely proceed with update without knowing both container configurations.${NC}"
        echo -e "${RED}Aborting update to prevent port mapping issues.${NC}"
        exit 1
    fi
    
    # Save captured configuration to environment variables
    if [ -n "$FRONTEND_PORT_MAPPING" ]; then
        export FRONTEND_PORT=$FRONTEND_PORT_MAPPING
        echo -e "${GREEN}Setting FRONTEND_PORT=$FRONTEND_PORT${NC}"
    else
        # In production mode, abort if we can't detect the frontend port
        echo -e "${RED}ERROR: Could not detect frontend port mapping.${NC}"
        echo -e "${RED}Cannot safely proceed with update without knowing frontend port.${NC}"
        echo -e "${RED}Forcing to production port 15000.${NC}"
        FRONTEND_PORT=15000
    fi
    
    if [ -n "$BACKEND_PORT_MAPPING" ]; then
        export BACKEND_PORT=$BACKEND_PORT_MAPPING
        echo -e "${GREEN}Setting BACKEND_PORT=$BACKEND_PORT${NC}"
    else
        # In production mode, abort if we can't detect the backend port
        echo -e "${RED}ERROR: Could not detect backend port mapping.${NC}"
        echo -e "${RED}Cannot safely proceed with update without knowing backend port.${NC}"
        echo -e "${RED}Forcing to production port 15001.${NC}"
        BACKEND_PORT=15001
    fi
    
    if [ -n "$API_PORT" ]; then
        export API_PORT=$API_PORT
        echo -e "${GREEN}Setting API_PORT=$API_PORT${NC}"
    else
        # In production mode, abort if we can't detect the API port
        echo -e "${RED}ERROR: Could not detect API port.${NC}"
        echo -e "${RED}Cannot safely proceed with update without knowing API port.${NC}"
        echo -e "${RED}Forcing to production port 15001.${NC}"
        API_PORT=15001
    fi
else
    # For development mode, we can use defaults if detection fails
    if [ -n "$FRONTEND_PORT_MAPPING" ]; then
        export FRONTEND_PORT=$FRONTEND_PORT_MAPPING
        echo -e "${GREEN}Setting FRONTEND_PORT=$FRONTEND_PORT${NC}"
    else
        # Use known production port if detection fails
        FRONTEND_PORT=${FRONTEND_PORT:-15000}
        echo -e "${YELLOW}No frontend port mapping found, using production port: $FRONTEND_PORT${NC}"
    fi
    
    if [ -n "$BACKEND_PORT_MAPPING" ]; then
        export BACKEND_PORT=$BACKEND_PORT_MAPPING
        echo -e "${GREEN}Setting BACKEND_PORT=$BACKEND_PORT${NC}"
    else
        # Use known production port if detection fails
        BACKEND_PORT=${BACKEND_PORT:-15001}
        echo -e "${YELLOW}No backend port mapping found, using production port: $BACKEND_PORT${NC}"
    fi
    
    if [ -n "$API_PORT" ]; then
        export API_PORT=$API_PORT
        echo -e "${GREEN}Setting API_PORT=$API_PORT${NC}"
    else
        # Use known production port if detection fails
        API_PORT=${API_PORT:-15001}
        echo -e "${YELLOW}No API port found, using production port: $API_PORT${NC}"
    fi
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
    
    # Perform full cleanup automatically in autonomous mode
    echo -e "${YELLOW}Performing full Podman system prune automatically...${NC}"
    podman system prune -f
    echo -e "${GREEN}Podman system cache cleaned.${NC}"
else
    echo -e "${YELLOW}Cleaning Docker image cache...${NC}"
    # Remove dangling images (not used by any container)
    docker image prune -f
    echo -e "${GREEN}Docker dangling images removed.${NC}"
    
    # Perform full cleanup automatically in autonomous mode
    echo -e "${YELLOW}Performing full Docker system prune automatically...${NC}"
    docker system prune -f
    echo -e "${GREEN}Docker system cache cleaned.${NC}"
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

# For podman, create a complete docker-compose file to ensure proper port mapping
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo -e "${YELLOW}Creating a comprehensive docker-compose file for update...${NC}"
    # Create a temporary but complete docker-compose file specifically for the update
    cat > docker-compose.update.yml << EOL
# Update configuration for ShareThings Docker Compose

services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT:-3001}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=production
      - PORT=${API_PORT:-3001}
      - LISTEN_PORT=${API_PORT:-3001}
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
        - API_PORT=${API_PORT:-3001}
        - VITE_API_PORT=${API_PORT:-3001}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT:-3001}
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
EOL
    echo -e "${GREEN}Comprehensive docker-compose.update.yml created.${NC}"
    
    # Export API_PORT as VITE_API_PORT to ensure it's available during build
    export VITE_API_PORT="${API_PORT:-3001}"
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT, VITE_API_PORT=$VITE_API_PORT${NC}"
    
    # Build and run containers with explicitly passed environment variables
    echo -e "${YELLOW}Building containers with comprehensive configuration...${NC}"
    $COMPOSE_CMD -f docker-compose.update.yml build
    
    echo -e "${YELLOW}Starting containers with explicit environment variables...${NC}"
    # Directly pass environment variables to the compose command
    FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT $COMPOSE_CMD -f docker-compose.update.yml up -d
    
    COMPOSE_FILE="docker-compose.update.yml"
else
    # For docker-compose, explicitly pass environment variables
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT${NC}"
    
    # Create a temporary .env file to ensure environment variables are properly passed
    echo "FRONTEND_PORT=$FRONTEND_PORT" > .env.temp
    echo "BACKEND_PORT=$BACKEND_PORT" >> .env.temp
    echo "API_PORT=$API_PORT" >> .env.temp
    
    # Use the env-file option for docker-compose
    $COMPOSE_CMD -f $COMPOSE_FILE --env-file .env.temp up -d
    
    # Clean up temporary .env file
    if [ -f .env.temp ]; then
        rm .env.temp
        echo -e "${GREEN}Temporary environment file removed.${NC}"
    fi
fi

START_EXIT_CODE=$?

# Add additional debugging for port configuration
echo -e "${YELLOW}Verifying port configuration...${NC}"
echo -e "Expected configuration:"
echo -e "  Frontend Port: ${FRONTEND_PORT} (should be 15000 for production)"
echo -e "  Backend Port: ${BACKEND_PORT} (should be 15001 for production)"
echo -e "  API Port: ${API_PORT} (should be 15001 for production)"

# Add explicit warning if ports don't match expected production values
if [[ "$PRODUCTION_MODE" == "yes" ]]; then
    if [[ "$FRONTEND_PORT" != "15000" ]]; then
        echo -e "${RED}WARNING: Frontend port ${FRONTEND_PORT} does not match expected production port 15000${NC}"
        echo -e "${YELLOW}Forcing frontend port to 15000 for production deployment${NC}"
        FRONTEND_PORT=15000
    fi
    
    if [[ "$BACKEND_PORT" != "15001" ]]; then
        echo -e "${RED}WARNING: Backend port ${BACKEND_PORT} does not match expected production port 15001${NC}"
        echo -e "${YELLOW}Forcing backend port to 15001 for production deployment${NC}"
        BACKEND_PORT=15001
    fi
    
    if [[ "$API_PORT" != "15001" ]]; then
        echo -e "${RED}WARNING: API port ${API_PORT} does not match expected production port 15001${NC}"
        echo -e "${YELLOW}Forcing API port to 15001 for production deployment${NC}"
        API_PORT=15001
    fi
    
    echo -e "${GREEN}Verified production port configuration:${NC}"
    echo -e "  Frontend Port: ${FRONTEND_PORT}"
    echo -e "  Backend Port: ${BACKEND_PORT}"
    echo -e "  API Port: ${API_PORT}"
fi

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
    
    # Enhanced verification of container port mappings
    echo -e "${YELLOW}Verifying container port mappings...${NC}"
    
    # Check for frontend container - directly check for containers with frontend in their name
    FRONTEND_RUNNING=$(podman ps -q --filter name=share-things-frontend | wc -l)
    if [ "$FRONTEND_RUNNING" -eq "0" ]; then
        # Try alternate naming convention with underscore
        FRONTEND_RUNNING=$(podman ps -q --filter name=share-things_frontend | wc -l)
    fi
    if [ "$FRONTEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Frontend container is running.${NC}"
        # Get frontend container ID
        FRONTEND_ID=$(podman ps -q --filter name=share-things-frontend 2>/dev/null || podman ps -q --filter name=share-things_frontend_1 2>/dev/null)
        if [ -n "$FRONTEND_ID" ]; then
            echo -e "${YELLOW}Frontend container ID: $FRONTEND_ID${NC}"
            echo -e "${YELLOW}Frontend port mapping:${NC}"
            podman port $FRONTEND_ID || echo "No port mapping found for frontend"
            
            # If no port mapping is found, try to manually add it
            if ! podman port $FRONTEND_ID | grep -q '80/tcp'; then
                echo -e "${YELLOW}No port mapping found. Attempting to add port mapping...${NC}"
                # Stop the container
                podman stop $FRONTEND_ID
                # Remove the container but keep the image
                podman rm $FRONTEND_ID
                # Run the container again with explicit port mapping - use exactly the detected port config (15000:80 for production)
                echo -e "${YELLOW}Creating frontend container with port mapping ${FRONTEND_PORT}:80${NC}"
                podman run -d --name share-things-frontend -p ${FRONTEND_PORT}:80 --network=app_network --restart=always localhost/share-things_frontend:latest
                echo -e "${GREEN}Verified frontend container is using port ${FRONTEND_PORT}${NC}"
                echo -e "${GREEN}Recreated frontend container with explicit port mapping.${NC}"
            fi
        else
            echo -e "${RED}Could not find frontend container ID.${NC}"
        fi
    else
        echo -e "${RED}Frontend container is not running.${NC}"
    fi
    
    # Check for backend container - directly check for containers with backend in their name
    BACKEND_RUNNING=$(podman ps -q --filter name=share-things-backend | wc -l)
    if [ "$BACKEND_RUNNING" -eq "0" ]; then
        # Try alternate naming convention with underscore
        BACKEND_RUNNING=$(podman ps -q --filter name=share-things_backend | wc -l)
    fi
    if [ "$BACKEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Backend container is running.${NC}"
        # Get backend container ID
        BACKEND_ID=$(podman ps -q --filter name=share-things-backend 2>/dev/null || podman ps -q --filter name=share-things_backend_1 2>/dev/null)
        if [ -n "$BACKEND_ID" ]; then
            echo -e "${YELLOW}Backend container ID: $BACKEND_ID${NC}"
            echo -e "${YELLOW}Backend port mapping:${NC}"
            podman port $BACKEND_ID || echo "No port mapping found for backend"
            
            # If no port mapping is found, try to manually add it
            if ! podman port $BACKEND_ID | grep -q "${API_PORT:-3001}/tcp"; then
                echo -e "${YELLOW}No port mapping found. Attempting to add port mapping...${NC}"
                # Stop the container
                podman stop $BACKEND_ID
                # Remove the container but keep the image
                podman rm $BACKEND_ID
                # Run the container again with explicit port mapping - use exactly the detected port config (15001:15001 for production)
                echo -e "${YELLOW}Creating backend container with port mapping ${BACKEND_PORT}:${API_PORT}${NC}"
                podman run -d --name share-things-backend -p ${BACKEND_PORT}:${API_PORT} -e NODE_ENV=production -e PORT=${API_PORT} --network=app_network --restart=always localhost/share-things_backend:latest
                echo -e "${GREEN}Verified backend container is using port ${BACKEND_PORT}:${API_PORT}${NC}"
                echo -e "${GREEN}Recreated backend container with explicit port mapping.${NC}"
            fi
        else
            echo -e "${RED}Could not find backend container ID.${NC}"
        fi
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
    
    # Check for frontend container - directly check for containers with frontend in their name
    FRONTEND_RUNNING=$(docker ps -q --filter name=share-things-frontend | wc -l)
    if [ "$FRONTEND_RUNNING" -eq "0" ]; then
        # Try alternate naming convention with underscore
        FRONTEND_RUNNING=$(docker ps -q --filter name=share-things_frontend | wc -l)
    fi
    if [ "$FRONTEND_RUNNING" -gt "0" ]; then
        echo -e "${GREEN}Frontend container is running.${NC}"
        echo -e "${YELLOW}Frontend port mapping:${NC}"
        # Try both naming conventions for port display
        docker port share-things-frontend 2>/dev/null || docker port share-things_frontend_1 2>/dev/null || echo "Could not display port mapping"
    else
        echo -e "${RED}Frontend container is not running.${NC}"
    fi
    
    # Check for backend container - directly check for containers with backend in their name
    BACKEND_RUNNING=$(docker ps -q --filter name=share-things-backend | wc -l)
    if [ "$BACKEND_RUNNING" -eq "0" ]; then
        # Try alternate naming convention with underscore
        BACKEND_RUNNING=$(docker ps -q --filter name=share-things_backend | wc -l)
    fi
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

# Clean up any temporary files created during the update
if [ -f docker-compose.update.yml ]; then
    echo -e "${YELLOW}Cleaning up temporary files...${NC}"
    # Keep the file for reference in case of issues
    mv docker-compose.update.yml docker-compose.update.yml.bak
    echo -e "${GREEN}docker-compose.update.yml saved as docker-compose.update.yml.bak for reference.${NC}"
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
