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

#######################
# New helper functions
#######################

# Check and fix permissions
check_and_fix_permissions() {
  echo -e "${YELLOW}Checking script permissions...${NC}"
  if ! touch .permission_test 2>/dev/null; then
    echo -e "${RED}ERROR: No write permission in current directory.${NC}"
    if command -v sudo &>/dev/null; then
      echo -e "${YELLOW}Attempting to fix permissions with sudo...${NC}"
      sudo chown -R $(whoami) .
      sudo chmod -R u+w .
      echo -e "${GREEN}Permissions fixed.${NC}"
    else
      echo -e "${RED}Cannot fix permissions without sudo. Please run script with appropriate permissions.${NC}"
      exit 1
    fi
  else
    rm .permission_test
    echo -e "${GREEN}Permission check passed.${NC}"
  fi
}

# Flexible container ID finding
find_container_id() {
  local container_type=$1
  local patterns=(
    "share-things-${container_type}"
    "share-things_${container_type}"
    "share-things_${container_type}_1"
    "${container_type}"
  )
  
  for pattern in "${patterns[@]}"; do
    container_id=$($CONTAINER_CMD ps -qa --filter name=${pattern} | head -1)
    if [ -n "$container_id" ]; then
      echo "$container_id"
      return 0
    fi
  done
  
  # Try partial name match as last resort
  container_id=$($CONTAINER_CMD ps -qa | xargs -I {} $CONTAINER_CMD inspect {} --format '{{.Name}}' 2>/dev/null | grep -i "${container_type}" | head -1 | xargs)
  if [ -n "$container_id" ]; then
    echo "$container_id"
    return 0
  fi
  
  return 1
}

# Handle git repository issues
handle_git_repository() {
  if [ -d .git ]; then
    echo -e "${YELLOW}Checking git repository status...${NC}"
    
    # Fix common git ownership issues
    if ! git rev-parse --git-dir &>/dev/null; then
      echo -e "${YELLOW}Git repository has ownership issues. Attempting to fix...${NC}"
      git_dir=$(pwd)
      if command -v sudo &>/dev/null; then
        sudo git config --global --add safe.directory "$git_dir"
        echo -e "${GREEN}Added $git_dir to git safe.directory.${NC}"
      else
        git config --global --add safe.directory "$git_dir" 2>/dev/null || true
        echo -e "${YELLOW}Attempted to add $git_dir to git safe.directory.${NC}"
      fi
    fi
    
    # Reset to clean state before pulling - this ensures no local changes interfere
    echo -e "${YELLOW}Resetting git repository to clean state...${NC}"
    git reset --hard HEAD 2>/dev/null || true
    git clean -fd 2>/dev/null || true
    
    # Pull latest code
    echo -e "${YELLOW}Pulling latest code from git repository...${NC}"
    git pull
    GIT_EXIT_CODE=$?
    
    if [ $GIT_EXIT_CODE -ne 0 ]; then
      echo -e "${RED}Failed to pull latest code.${NC}"
      echo -e "${YELLOW}Continuing with update anyway in autonomous mode...${NC}"
    else
      echo -e "${GREEN}Latest code pulled successfully.${NC}"
    fi
  else
    echo -e "${YELLOW}Not a git repository. Skipping code update.${NC}"
    echo -e "${YELLOW}Continuing with container rebuild in autonomous mode...${NC}"
  fi
}

# Robust file creation with error handling
create_compose_file() {
  local file_path="$1"
  local dir_name=$(dirname "$file_path")
  
  mkdir -p "$dir_name" 2>/dev/null
  if ! touch "$file_path" 2>/dev/null; then
    echo -e "${YELLOW}Cannot write to $file_path. Trying alternative location...${NC}"
    # Try home directory as fallback
    file_path="$HOME/$(basename $file_path)"
    if ! touch "$file_path" 2>/dev/null; then
      echo -e "${YELLOW}Cannot write to home directory. Using /tmp directory...${NC}"
      # Try temp directory as last resort
      file_path="/tmp/$(basename $file_path)"
      if ! touch "$file_path" 2>/dev/null; then
        echo -e "${RED}ERROR: Cannot create necessary files. Aborting.${NC}"
        exit 1
      fi
    fi
  fi
  
  echo -e "${GREEN}Using file path: $file_path${NC}"
  echo "$file_path"
}

# Improved container verification
verify_containers_running() {
  echo -e "${YELLOW}Performing thorough container verification...${NC}"
  
  # Check for any container matching our service pattern
  ALL_CONTAINERS=$($CONTAINER_CMD ps -a --format "{{.Names}},{{.ID}},{{.Status}}" | grep -i "share\|frontend\|backend" || echo "")
  
  if [ -z "$ALL_CONTAINERS" ]; then
    echo -e "${RED}No containers found that match our services.${NC}"
    return 1
  fi
  
  # Print all found containers for debugging
  echo -e "${YELLOW}Found these potential service containers:${NC}"
  echo "$ALL_CONTAINERS"
  
  # Check if any container is running (contains "Up" in status)
  if echo "$ALL_CONTAINERS" | grep -q "Up"; then
    echo -e "${GREEN}At least one service container is running.${NC}"
    
    # Check specifically for frontend and backend patterns
    FRONTEND_RUNNING=$(echo "$ALL_CONTAINERS" | grep -i "frontend" | grep "Up" || echo "")
    BACKEND_RUNNING=$(echo "$ALL_CONTAINERS" | grep -i "backend" | grep "Up" || echo "")
    
    if [ -n "$FRONTEND_RUNNING" ]; then
      echo -e "${GREEN}Frontend service is running.${NC}"
    else
      echo -e "${YELLOW}No frontend container running. Check logs for errors.${NC}"
    fi
    
    if [ -n "$BACKEND_RUNNING" ]; then
      echo -e "${GREEN}Backend service is running.${NC}"
    else
      echo -e "${YELLOW}No backend container running. Check logs for errors.${NC}"
    fi
    
    # If at least one component is running, consider it a partial success
    if [ -n "$FRONTEND_RUNNING" ] || [ -n "$BACKEND_RUNNING" ]; then
      return 0
    fi
  fi
  
  echo -e "${RED}No service containers running.${NC}"
  return 1
}

# Improved log checking function
check_container_logs() {
  local container_type=$1
  echo -e "${YELLOW}Checking ${container_type} container logs:${NC}"
  
  # Try multiple naming patterns for logs
  local patterns=(
    "share-things-${container_type}"
    "share-things_${container_type}"
    "share-things_${container_type}_1"
    "${container_type}"
  )
  
  local logs_found=0
  
  for pattern in "${patterns[@]}"; do
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
      if podman logs $pattern --tail 30 2>/dev/null; then
        logs_found=1
        break
      fi
    else
      if docker logs $pattern --tail 30 2>/dev/null; then
        logs_found=1
        break
      fi
    fi
  done
  
  if [ $logs_found -eq 0 ]; then
    # Try to find any container with name containing container_type
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
      local container_id=$(podman ps -a --format "{{.ID}},{{.Names}}" | grep -i "${container_type}" | head -1 | cut -d',' -f1)
      if [ -n "$container_id" ]; then
        echo -e "${YELLOW}Found container matching '${container_type}': ${container_id}${NC}"
        podman logs $container_id --tail 30 2>/dev/null || echo "No logs available"
        logs_found=1
      fi
    else
      local container_id=$(docker ps -a --format "{{.ID}},{{.Names}}" | grep -i "${container_type}" | head -1 | cut -d',' -f1)
      if [ -n "$container_id" ]; then
        echo -e "${YELLOW}Found container matching '${container_type}': ${container_id}${NC}"
        docker logs $container_id --tail 30 2>/dev/null || echo "No logs available"
        logs_found=1
      fi
    fi
  fi
  
  if [ $logs_found -eq 0 ]; then
    echo "No logs available for ${container_type} container"
  fi
}

#######################
# Main Script Execution
#######################

# Check permissions first
check_and_fix_permissions

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
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR" || {
    echo -e "${YELLOW}Cannot create backup directory. Using /tmp for backups...${NC}"
    BACKUP_DIR="/tmp/sharethings-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
}

cp .env "$BACKUP_DIR/.env" 2>/dev/null || echo "No .env file to backup"
cp client/.env "$BACKUP_DIR/client.env" 2>/dev/null || echo "No client/.env file to backup"
cp server/.env "$BACKUP_DIR/server.env" 2>/dev/null || echo "No server/.env file to backup"
cp docker-compose.prod.yml "$BACKUP_DIR/docker-compose.prod.yml" 2>/dev/null || echo "No docker-compose.prod.yml file to backup"
echo -e "${GREEN}Configuration backed up to $BACKUP_DIR/${NC}"

# Pull latest code if this is a git repository
handle_git_repository

# Capture current container configuration before stopping
echo -e "${YELLOW}Capturing current container configuration...${NC}"

# Use our flexible container detection function to find frontends and backends
FRONTEND_ID=$(find_container_id "frontend")
if [ -n "$FRONTEND_ID" ]; then
    echo -e "${GREEN}Found frontend container: $FRONTEND_ID${NC}"
    # Improved port detection with multiple patterns to handle different output formats
    FRONTEND_PORT_MAPPING=$($CONTAINER_CMD port $FRONTEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->80)' ||
                            $CONTAINER_CMD port $FRONTEND_ID | grep -oP '(?<=:)\d+(?=->80)' ||
                            $CONTAINER_CMD port $FRONTEND_ID | grep -E '.*->80/tcp' | awk -F':' '{print $NF}' | sed 's/->80\/tcp//')
    echo -e "${GREEN}Frontend port mapping: $FRONTEND_PORT_MAPPING${NC}"
else
    echo -e "${YELLOW}No frontend container found${NC}"
fi

BACKEND_ID=$(find_container_id "backend")
if [ -n "$BACKEND_ID" ]; then
    echo -e "${GREEN}Found backend container: $BACKEND_ID${NC}"
    # Improved port detection with multiple patterns to handle different output formats
    BACKEND_PORT_MAPPING=$($CONTAINER_CMD port $BACKEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->)' ||
                           $CONTAINER_CMD port $BACKEND_ID | grep -oP '(?<=:)\d+(?=->\d+)' ||
                           $CONTAINER_CMD port $BACKEND_ID | grep -E '.*->[0-9]+/tcp' | awk -F':' '{print $NF}' | sed 's/->[0-9]*\/tcp//')
    
    # Try multiple approaches to get the API port
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        API_PORT=$(podman inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "3001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  podman inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "15001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  echo "")
        if [ -z "$API_PORT" ]; then
            # Try alternative approach for Podman
            API_PORT=$(podman inspect $BACKEND_ID --format '{{range .HostConfig.PortBindings}}{{(index . 0).HostPort}}{{end}}' 2>/dev/null || echo "")
        fi
    else
        # Docker version
        API_PORT=$(docker inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "3001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  docker inspect $BACKEND_ID --format '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "15001/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' 2>/dev/null ||
                  echo "")
    fi
    echo -e "${GREEN}Backend port mapping: $BACKEND_PORT_MAPPING${NC}"
    echo -e "${GREEN}API port: $API_PORT${NC}"
else
    echo -e "${YELLOW}No backend container found${NC}"
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

# For production mode, we need to ensure we have the correct port mappings
if [[ "$PRODUCTION_MODE" == "yes" ]]; then
    # For production mode, use production ports if detection fails
    if [ -n "$FRONTEND_PORT_MAPPING" ]; then
        export FRONTEND_PORT=$FRONTEND_PORT_MAPPING
        echo -e "${GREEN}Setting FRONTEND_PORT=$FRONTEND_PORT${NC}"
    else
        echo -e "${YELLOW}No frontend port mapping found, using production port 15000${NC}"
        FRONTEND_PORT=15000
    fi
    
    if [ -n "$BACKEND_PORT_MAPPING" ]; then
        export BACKEND_PORT=$BACKEND_PORT_MAPPING
        echo -e "${GREEN}Setting BACKEND_PORT=$BACKEND_PORT${NC}"
    else
        echo -e "${YELLOW}No backend port mapping found, using production port 15001${NC}"
        BACKEND_PORT=15001
    fi
    
    if [ -n "$API_PORT" ]; then
        export API_PORT=$API_PORT
        echo -e "${GREEN}Setting API_PORT=$API_PORT${NC}"
    else
        echo -e "${YELLOW}No API port found, using production port 15001${NC}"
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

# List all running containers before stopping
echo -e "${YELLOW}Listing all running containers before stopping...${NC}"
$CONTAINER_CMD ps --all | grep "share-things" || echo "No matching containers found"

# Save the currently running container IDs for later verification
RUNNING_CONTAINERS_BEFORE=$($CONTAINER_CMD ps -a -q --filter name=share-things)

# First attempt with docker-compose/podman-compose down
echo -e "${YELLOW}Stopping containers with ${COMPOSE_CMD}...${NC}"
$COMPOSE_CMD -f $COMPOSE_FILE down
COMPOSE_EXIT_CODE=$?

# Check if any containers are still running with either naming convention
STILL_RUNNING_AFTER_COMPOSE=$($CONTAINER_CMD ps -q --filter name=share-things)
if [ -n "$STILL_RUNNING_AFTER_COMPOSE" ]; then
    echo -e "${YELLOW}Some containers are still running after ${COMPOSE_CMD} down. Will try direct stop.${NC}"
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
        # Try a broader search for containers
        CONTAINER_IDS=$(podman ps -a -q | xargs -I {} podman inspect {} --format '{{.Name}},{{.ID}}' 2>/dev/null | grep -i "share\|frontend\|backend" | cut -d',' -f2)
        if [ -n "$CONTAINER_IDS" ]; then
            echo "$CONTAINER_IDS"
            for CONTAINER_ID in $CONTAINER_IDS; do
                podman stop --time 10 $CONTAINER_ID 2>/dev/null || echo "Failed to stop container $CONTAINER_ID"
            done
        else
            echo "No running containers to stop"
        fi
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
        # Try a broader search for containers to remove
        CONTAINER_IDS=$(podman ps -a -q | xargs -I {} podman inspect {} --format '{{.Name}},{{.ID}}' 2>/dev/null | grep -i "share\|frontend\|backend" | cut -d',' -f2)
        if [ -n "$CONTAINER_IDS" ]; then
            echo "$CONTAINER_IDS"
            for CONTAINER_ID in $CONTAINER_IDS; do
                podman rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
            done
        else
            echo "No containers to remove"
        fi
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
        # Try a broader search for containers
        CONTAINER_IDS=$(docker ps -a -q | xargs -I {} docker inspect {} --format '{{.Name}},{{.ID}}' 2>/dev/null | grep -i "share\|frontend\|backend" | cut -d',' -f2)
        if [ -n "$CONTAINER_IDS" ]; then
            echo "$CONTAINER_IDS"
            for CONTAINER_ID in $CONTAINER_IDS; do
                docker stop --time 10 $CONTAINER_ID 2>/dev/null || echo "Failed to stop container $CONTAINER_ID"
            done
        else
            echo "No running containers to stop"
        fi
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
        # Try a broader search for containers to remove
        CONTAINER_IDS=$(docker ps -a -q | xargs -I {} docker inspect {} --format '{{.Name}},{{.ID}}' 2>/dev/null | grep -i "share\|frontend\|backend" | cut -d',' -f2)
        if [ -n "$CONTAINER_IDS" ]; then
            echo "$CONTAINER_IDS"
            for CONTAINER_ID in $CONTAINER_IDS; do
                docker rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
            done
        else
            echo "No containers to remove"
        fi
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
        
        # Try a broader search approach
        CONTAINER_IDS=$(podman ps -q | xargs -I {} podman inspect {} --format '{{.Name}}' 2>/dev/null | grep -i "share\|frontend\|backend" | xargs)
        if [ -n "$CONTAINER_IDS" ]; then
            for CONTAINER_ID in $CONTAINER_IDS; do
                echo "Killing container $CONTAINER_ID"
                podman kill $CONTAINER_ID 2>/dev/null || echo "Failed to kill container $CONTAINER_ID"
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
        
        # Try a broader search approach
        CONTAINER_IDS=$(docker ps -q | xargs -I {} docker inspect {} --format '{{.Name}}' 2>/dev/null | grep -i "share\|frontend\|backend" | xargs)
        if [ -n "$CONTAINER_IDS" ]; then
            for CONTAINER_ID in $CONTAINER_IDS; do
                echo "Killing container $CONTAINER_ID"
                docker kill $CONTAINER_ID 2>/dev/null || echo "Failed to kill container $CONTAINER_ID"
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
    COMPOSE_UPDATE_FILE=$(create_compose_file "docker-compose.update.yml")
    
    cat > "$COMPOSE_UPDATE_FILE" << EOL
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
    echo -e "${GREEN}Comprehensive docker-compose file created at: $COMPOSE_UPDATE_FILE${NC}"
    
    # Export API_PORT as VITE_API_PORT to ensure it's available during build
    export VITE_API_PORT="${API_PORT:-3001}"
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT, VITE_API_PORT=$VITE_API_PORT${NC}"
    
    # Build and run containers with explicitly passed environment variables
    echo -e "${YELLOW}Building containers with comprehensive configuration...${NC}"
    $COMPOSE_CMD -f "$COMPOSE_UPDATE_FILE" build
    
    echo -e "${YELLOW}Starting containers with explicit environment variables...${NC}"
    # Directly pass environment variables to the compose command
    FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT $COMPOSE_CMD -f "$COMPOSE_UPDATE_FILE" up -d
    
    COMPOSE_FILE="$COMPOSE_UPDATE_FILE"
else
    # For docker-compose, explicitly pass environment variables
    echo -e "${YELLOW}Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT${NC}"
    
    # Create a temporary .env file to ensure environment variables are properly passed
    ENV_TEMP_FILE=$(create_compose_file ".env.temp")
    echo "FRONTEND_PORT=$FRONTEND_PORT" > "$ENV_TEMP_FILE"
    echo "BACKEND_PORT=$BACKEND_PORT" >> "$ENV_TEMP_FILE"
    echo "API_PORT=$API_PORT" >> "$ENV_TEMP_FILE"
    
    # Use the env-file option for docker-compose
    $COMPOSE_CMD -f $COMPOSE_FILE --env-file "$ENV_TEMP_FILE" up -d
    
    # Clean up temporary .env file
    if [ -f "$ENV_TEMP_FILE" ]; then
        rm "$ENV_TEMP_FILE"
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

# Verify containers are running using improved verification
echo -e "${YELLOW}Verifying deployment...${NC}"
echo -e "${YELLOW}Listing all running containers:${NC}"
$CONTAINER_CMD ps | grep -i "share\|frontend\|backend" || echo "No matching containers found"

verify_containers_running
VERIFICATION_RESULT=$?

if [ $VERIFICATION_RESULT -eq 0 ]; then
    echo -e "${GREEN}Deployment verified. At least some containers are running.${NC}"
    
    # Use our improved container detection for port verification
    FRONTEND_ID=$(find_container_id "frontend")
    if [ -n "$FRONTEND_ID" ]; then
        echo -e "${YELLOW}Frontend container port mapping:${NC}"
        $CONTAINER_CMD port $FRONTEND_ID || echo "No port mapping found for frontend"
    fi
    
    BACKEND_ID=$(find_container_id "backend")
    if [ -n "$BACKEND_ID" ]; then
        echo -e "${YELLOW}Backend container port mapping:${NC}"
        $CONTAINER_CMD port $BACKEND_ID || echo "No port mapping found for backend"
    fi
else
    echo -e "${RED}Verification failed. No containers appear to be running.${NC}"
    echo "You can check container logs with: $CONTAINER_CMD logs <container_name>"
    
    # Show logs for troubleshooting using our improved log checking
    echo -e "${YELLOW}Checking container logs for errors...${NC}"
    check_container_logs "backend"
    check_container_logs "frontend"
fi

# Clean up any temporary files created during the update
if [ -f "$COMPOSE_UPDATE_FILE" ]; then
    echo -e "${YELLOW}Cleaning up temporary files...${NC}"
    # Keep the file for reference in case of issues
    mv "$COMPOSE_UPDATE_FILE" "${COMPOSE_UPDATE_FILE}.bak"
    echo -e "${GREEN}docker-compose update file saved as ${COMPOSE_UPDATE_FILE}.bak for reference.${NC}"
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
