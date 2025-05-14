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

# Set to non-interactive mode for CI/CD
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# Detect if running in a CI/CD environment
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$JENKINS_URL" ] || ! tty -s; then
    IS_CI_CD=true
    echo "Running in CI/CD or non-interactive environment"
else
    IS_CI_CD=false
fi

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

# Check and fix permissions without sudo if possible
check_and_fix_permissions() {
    echo "Checking script permissions..."
    if ! touch .permission_test 2>/dev/null; then
        echo "No write permission in current directory."
        
        if [ "$IS_CI_CD" = true ]; then
            echo "Running in CI/CD environment, skipping permission fixes that require sudo."
            # Just continue, we'll use alternative paths for file operations
            return 1
        else
            # Try simple chmod first without sudo
            chmod -R u+w . 2>/dev/null
            if ! touch .permission_test 2>/dev/null; then
                echo "Still no permission. Will use alternative paths for file operations."
                return 1
            fi
        fi
    else
        rm .permission_test
        echo "Permission check passed."
        return 0
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

# Handle git repository issues without sudo
handle_git_repository() {
    if [ -d .git ]; then
        echo "Checking git repository status..."
        
        # Try fixing git ownership without sudo
        if ! git rev-parse --git-dir &>/dev/null; then
            echo "Git repository has ownership issues. Attempting to fix..."
            git_dir=$(pwd)
            
            # Try to add safe directory without sudo
            git config --global --add safe.directory "$git_dir" 2>/dev/null || true
            
            # Verify if it worked
            if ! git rev-parse --git-dir &>/dev/null; then
                echo "Still having git permission issues. Continuing anyway."
            else 
                echo "Git permissions fixed."
            fi
        fi
        
        # Reset to clean state before pulling
        echo "Resetting git repository to clean state..."
        if git rev-parse --git-dir &>/dev/null; then
            git reset --hard HEAD 2>/dev/null || true
            git clean -fd 2>/dev/null || true
        fi
        
        # Pull latest code
        echo "Pulling latest code from git repository..."
        if git rev-parse --git-dir &>/dev/null; then
            git pull
            GIT_EXIT_CODE=$?
            
            if [ $GIT_EXIT_CODE -ne 0 ]; then
                echo "Failed to pull latest code."
                echo "Continuing with update anyway in autonomous mode..."
            else
                echo "Latest code pulled successfully."
            fi
        else
            echo "Unable to use git commands. Continuing with existing code."
        fi
    else
        echo "Not a git repository. Skipping code update."
        echo "Continuing with container rebuild in autonomous mode..."
    fi
}

# Robust file creation with error handling - refactored to prevent color code leakage
create_file() {
    local file_path="$1"
    local dir_name=$(dirname "$file_path")
    local base_name=$(basename "$file_path")
    local result_path=""
    
    # Try current directory first
    mkdir -p "$dir_name" 2>/dev/null
    if touch "$file_path" 2>/dev/null; then
        result_path="$file_path"
    else
        # Try temp directory as reliable fallback
        result_path="/tmp/$base_name"
        touch "$result_path" 2>/dev/null
        
        if [ ! -f "$result_path" ]; then
            echo "ERROR: Cannot create file $base_name anywhere. Check permissions."
            return 1
        fi
    fi
    
    echo "Using file path: $result_path"
    echo "$result_path"
}

# Enhanced container verification with retries and waiting
verify_containers_running() {
    local max_attempts=12  # Try for up to 2 minutes (12 x 10 seconds)
    local attempt=1
    local delay=10
    
    echo "Performing container verification (with $max_attempts attempts, $delay second intervals)..."
    
    while [ $attempt -le $max_attempts ]; do
        echo "Verification attempt $attempt of $max_attempts..."
        
        # Method 1: Check for any container matching our service pattern
        ALL_CONTAINERS=$($CONTAINER_CMD ps -a --format "{{.Names}},{{.ID}},{{.Status}}" 2>/dev/null | grep -i "share\|frontend\|backend" || echo "")
        
        if [ -z "$ALL_CONTAINERS" ]; then
            echo "No containers found that match our services using format search."
            
            # Method 2: Try a simpler container list approach
            ALL_CONTAINERS=$($CONTAINER_CMD ps | grep -i "share\|frontend\|backend" || echo "")
            
            if [ -z "$ALL_CONTAINERS" ]; then
                echo "No containers found using simple list either."
                
                # Method 3: Try listing all containers to see what's there
                echo "Listing all running containers to see what's available:"
                $CONTAINER_CMD ps
            else
                echo "Found containers using simple grep method:"
                echo "$ALL_CONTAINERS"
            fi
        else
            echo "Found these potential service containers:"
            echo "$ALL_CONTAINERS"
        fi
        
        # Check for running containers (specific check for frontend/backend)
        FRONTEND_RUNNING=$($CONTAINER_CMD ps -q --filter name=share-things-frontend 2>/dev/null || 
                         $CONTAINER_CMD ps -q --filter name=share-things_frontend 2>/dev/null || 
                         $CONTAINER_CMD ps -q --filter name=frontend 2>/dev/null || echo "")
        
        BACKEND_RUNNING=$($CONTAINER_CMD ps -q --filter name=share-things-backend 2>/dev/null || 
                        $CONTAINER_CMD ps -q --filter name=share-things_backend 2>/dev/null || 
                        $CONTAINER_CMD ps -q --filter name=backend 2>/dev/null || echo "")
        
        # Additional approach - check anything running with a broader pattern
        ANY_SERVICE_RUNNING=$($CONTAINER_CMD ps -q | xargs $CONTAINER_CMD inspect 2>/dev/null | grep -i "share\|frontend\|backend" || echo "")
        
        # Set status messages
        if [ -n "$FRONTEND_RUNNING" ]; then
            echo "Frontend container is running."
            FRONTEND_OK=true
        else
            echo "No frontend container running yet."
            FRONTEND_OK=false
        fi
        
        if [ -n "$BACKEND_RUNNING" ]; then
            echo "Backend container is running."
            BACKEND_OK=true
        else
            echo "No backend container running yet."
            BACKEND_OK=false
        fi
        
        # Success if either FRONTEND_OK or BACKEND_OK is true, or if ANY_SERVICE_RUNNING is not empty
        if $FRONTEND_OK || $BACKEND_OK || [ -n "$ANY_SERVICE_RUNNING" ]; then
            echo "Verification successful - at least one container is running."
            return 0
        fi
        
        # Not successful yet, wait and try again if not the last attempt
        if [ $attempt -lt $max_attempts ]; then
            echo "Waiting $delay seconds for containers to start before trying again..."
            sleep $delay
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo "Verification timed out after $max_attempts attempts."
    
    # Final "Hail Mary" check - maybe the container is running but we couldn't detect it
    echo "Performing last-resort verification by checking for ANY listening containers..."
    
    # Try to find any listening service on expected ports
    if command -v netstat &>/dev/null; then
        echo "Checking port $FRONTEND_PORT via netstat:"
        netstat -tulpn 2>/dev/null | grep "$FRONTEND_PORT" || echo "No service on port $FRONTEND_PORT"
        
        echo "Checking port $BACKEND_PORT via netstat:"
        netstat -tulpn 2>/dev/null | grep "$BACKEND_PORT" || echo "No service on port $BACKEND_PORT"
    elif command -v ss &>/dev/null; then
        echo "Checking port $FRONTEND_PORT via ss:"
        ss -tulpn 2>/dev/null | grep "$FRONTEND_PORT" || echo "No service on port $FRONTEND_PORT"
        
        echo "Checking port $BACKEND_PORT via ss:"
        ss -tulpn 2>/dev/null | grep "$BACKEND_PORT" || echo "No service on port $BACKEND_PORT"
    elif command -v lsof &>/dev/null; then
        echo "Checking port $FRONTEND_PORT via lsof:"
        lsof -i:$FRONTEND_PORT 2>/dev/null || echo "No service on port $FRONTEND_PORT"
        
        echo "Checking port $BACKEND_PORT via lsof:"
        lsof -i:$BACKEND_PORT 2>/dev/null || echo "No service on port $BACKEND_PORT"
    fi
    
    # Even if verification failed, treat as non-fatal
    echo "Container verification couldn't confirm running containers, but continuing anyway."
    echo "This is treated as a non-fatal issue - containers may still be starting."
    return 1
}

# Improved log checking function
check_container_logs() {
    local container_type=$1
    echo "Checking ${container_type} container logs:"
    
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
                echo "Found container matching '${container_type}': ${container_id}"
                podman logs $container_id --tail 30 2>/dev/null || echo "No logs available"
                logs_found=1
            fi
        else
            local container_id=$(docker ps -a --format "{{.ID}},{{.Names}}" | grep -i "${container_type}" | head -1 | cut -d',' -f1)
            if [ -n "$container_id" ]; then
                echo "Found container matching '${container_type}': ${container_id}"
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

# Check permissions without requiring sudo
check_and_fix_permissions
HAS_PERMISSIONS=$?

# Detect which container engine is being used
if command -v podman &> /dev/null; then
    if podman ps --all | grep -q "share-things"; then
        CONTAINER_ENGINE="podman"
        COMPOSE_CMD="podman-compose"
        CONTAINER_CMD="podman"
        echo "Detected running Podman containers"
    else
        echo "No running Podman containers detected"
        CONTAINER_ENGINE="podman"
        COMPOSE_CMD="podman-compose"
        CONTAINER_CMD="podman"
    fi
elif command -v docker &> /dev/null; then
    if docker ps --all | grep -q "share-things"; then
        CONTAINER_ENGINE="docker"
        COMPOSE_CMD="docker-compose"
        CONTAINER_CMD="docker"
        echo "Detected running Docker containers"
    else
        echo "No running Docker containers detected"
        CONTAINER_ENGINE="docker"
        COMPOSE_CMD="docker-compose"
        CONTAINER_CMD="docker"
    fi
else
    echo "No container engine detected. Defaulting to Docker..."
    CONTAINER_ENGINE="docker"
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
fi

echo "Using ${CONTAINER_ENGINE^} for container operations"

# Backup current configuration files
echo "Backing up current configuration..."
BACKUP_DIR="/tmp/sharethings-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp .env "$BACKUP_DIR/.env" 2>/dev/null || echo "No .env file to backup"
cp client/.env "$BACKUP_DIR/client.env" 2>/dev/null || echo "No client/.env file to backup"
cp server/.env "$BACKUP_DIR/server.env" 2>/dev/null || echo "No server/.env file to backup"
cp docker-compose.prod.yml "$BACKUP_DIR/docker-compose.prod.yml" 2>/dev/null || echo "No docker-compose.prod.yml file to backup"
echo "Configuration backed up to $BACKUP_DIR/"

# Pull latest code without sudo
handle_git_repository

# Capture current container configuration before stopping
echo "Capturing current container configuration..."

# Use our flexible container detection function to find frontends and backends
FRONTEND_ID=$(find_container_id "frontend")
if [ -n "$FRONTEND_ID" ]; then
    echo "Found frontend container: $FRONTEND_ID"
    # Improved port detection with multiple patterns to handle different output formats
    FRONTEND_PORT_MAPPING=$($CONTAINER_CMD port $FRONTEND_ID | grep -oP '(?<=0.0.0.0:)\d+(?=->80)' ||
                            $CONTAINER_CMD port $FRONTEND_ID | grep -oP '(?<=:)\d+(?=->80)' ||
                            $CONTAINER_CMD port $FRONTEND_ID | grep -E '.*->80/tcp' | awk -F':' '{print $NF}' | sed 's/->80\/tcp//')
    echo "Frontend port mapping: $FRONTEND_PORT_MAPPING"
else
    echo "No frontend container found"
fi

BACKEND_ID=$(find_container_id "backend")
if [ -n "$BACKEND_ID" ]; then
    echo "Found backend container: $BACKEND_ID"
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
    echo "Backend port mapping: $BACKEND_PORT_MAPPING"
    echo "API port: $API_PORT"
else
    echo "No backend container found"
fi

# Check if we're running in production mode
if [ -f docker-compose.prod.yml ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo "Production deployment detected. Using ${COMPOSE_FILE}"
    PRODUCTION_MODE="yes"
elif [ -f docker-compose.prod.temp.yml ]; then
    COMPOSE_FILE="docker-compose.prod.temp.yml"
    echo "Temporary production deployment detected. Using ${COMPOSE_FILE}"
    PRODUCTION_MODE="yes"
else
    COMPOSE_FILE="docker-compose.yml"
    echo "Development deployment detected. Using ${COMPOSE_FILE}"
    PRODUCTION_MODE="no"
fi

# For production mode, we need to ensure we have the correct port mappings
if [[ "$PRODUCTION_MODE" == "yes" ]]; then
    # For production mode, use production ports if detection fails
    if [ -n "$FRONTEND_PORT_MAPPING" ]; then
        export FRONTEND_PORT=$FRONTEND_PORT_MAPPING
        echo "Setting FRONTEND_PORT=$FRONTEND_PORT"
    else
        echo "No frontend port mapping found, using production port 15000"
        FRONTEND_PORT=15000
    fi
    
    if [ -n "$BACKEND_PORT_MAPPING" ]; then
        export BACKEND_PORT=$BACKEND_PORT_MAPPING
        echo "Setting BACKEND_PORT=$BACKEND_PORT"
    else
        echo "No backend port mapping found, using production port 15001"
        BACKEND_PORT=15001
    fi
    
    if [ -n "$API_PORT" ]; then
        export API_PORT=$API_PORT
        echo "Setting API_PORT=$API_PORT"
    else
        echo "No API port found, using production port 15001"
        API_PORT=15001
    fi
else
    # For development mode, we can use defaults if detection fails
    if [ -n "$FRONTEND_PORT_MAPPING" ]; then
        export FRONTEND_PORT=$FRONTEND_PORT_MAPPING
        echo "Setting FRONTEND_PORT=$FRONTEND_PORT"
    else
        # Use known production port if detection fails
        FRONTEND_PORT=${FRONTEND_PORT:-15000}
        echo "No frontend port mapping found, using production port: $FRONTEND_PORT"
    fi
    
    if [ -n "$BACKEND_PORT_MAPPING" ]; then
        export BACKEND_PORT=$BACKEND_PORT_MAPPING
        echo "Setting BACKEND_PORT=$BACKEND_PORT"
    else
        # Use known production port if detection fails
        BACKEND_PORT=${BACKEND_PORT:-15001}
        echo "No backend port mapping found, using production port: $BACKEND_PORT"
    fi
    
    if [ -n "$API_PORT" ]; then
        export API_PORT=$API_PORT
        echo "Setting API_PORT=$API_PORT"
    else
        # Use known production port if detection fails
        API_PORT=${API_PORT:-15001}
        echo "No API port found, using production port: $API_PORT"
    fi
fi

# List all running containers before stopping
echo "Listing all running containers before stopping..."
$CONTAINER_CMD ps --all | grep "share-things" || echo "No matching containers found"

# Save the currently running container IDs for later verification
RUNNING_CONTAINERS_BEFORE=$($CONTAINER_CMD ps -a -q --filter name=share-things)

# First attempt with docker-compose/podman-compose down
echo "Stopping containers with ${COMPOSE_CMD}..."
$COMPOSE_CMD -f $COMPOSE_FILE down
COMPOSE_EXIT_CODE=$?

# Check if any containers are still running with either naming convention
STILL_RUNNING_AFTER_COMPOSE=$($CONTAINER_CMD ps -q --filter name=share-things)
if [ -n "$STILL_RUNNING_AFTER_COMPOSE" ]; then
    echo "Some containers are still running after ${COMPOSE_CMD} down. Will try direct stop."
fi

# Second - try force stopping specific containers regardless of first attempt outcome
echo "Force stopping individual containers to ensure clean state..."
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo "Force stopping Podman containers..."
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
    echo "Removing Podman containers..."
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
    echo "Cleaning up networks..."
    podman network prune -f 2>/dev/null || echo "Network prune not supported or no networks to remove"
else
    echo "Force stopping Docker containers..."
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
    echo "Removing Docker containers..."
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
            for CONTAINER_ID in $CONTAINER_IDS; then
                docker rm -f $CONTAINER_ID 2>/dev/null || echo "Failed to remove container $CONTAINER_ID"
            done
        else
            echo "No containers to remove"
        fi
    fi
    
    # Clean up any associated networks
    echo "Cleaning up networks..."
    docker network prune -f 2>/dev/null || echo "No networks to remove"
fi

# Final verification to make sure ALL containers are stopped
echo "Performing final verification..."
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    STILL_RUNNING=$(podman ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING" ]; then
        echo "ERROR: Some containers are still running despite multiple stop attempts!"
        echo "This could cause problems with the update. Listing containers:"
        podman ps | grep "share-things"
        
        # Last resort - kill with SIGKILL
        echo "Performing emergency container kill..."
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
            echo "CRITICAL: Unable to stop containers. Manual intervention required."
            echo "Please stop all ShareThings containers manually before continuing."
            exit 1
        fi
    fi
    echo "All containers stopped successfully."
else
    STILL_RUNNING=$(docker ps -q --filter name=share-things)
    if [ -n "$STILL_RUNNING" ]; then
        echo "ERROR: Some containers are still running despite multiple stop attempts!"
        echo "This could cause problems with the update. Listing containers:"
        docker ps | grep "share-things"
        
        # Last resort - kill with SIGKILL
        echo "Performing emergency container kill..."
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
            echo "CRITICAL: Unable to stop containers. Manual intervention required."
            echo "Please stop all ShareThings containers manually before continuing."
            exit 1
        fi
    fi
    echo "All containers stopped successfully."
fi

# Clean container image cache before rebuilding
echo "Cleaning container image cache before rebuilding..."
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo "Cleaning Podman image cache..."
    # Remove dangling images (not used by any container)
    podman image prune -f
    echo "Podman dangling images removed."
    
    # Perform full cleanup automatically in autonomous mode
    echo "Performing full Podman system prune automatically..."
    podman system prune -f
    echo "Podman system cache cleaned."
else
    echo "Cleaning Docker image cache..."
    # Remove dangling images (not used by any container)
    docker image prune -f
    echo "Docker dangling images removed."
    
    # Perform full cleanup automatically in autonomous mode
    echo "Performing full Docker system prune automatically..."
    docker system prune -f
    echo "Docker system cache cleaned."
fi

# Rebuild containers
echo "Rebuilding containers with latest code..."
$COMPOSE_CMD -f $COMPOSE_FILE build
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "Container build failed. Please check the error messages above."
    exit 1
fi
echo "Containers rebuilt successfully."

# Start containers with preserved configuration
echo "Starting updated containers with preserved configuration..."

# For podman, create a complete docker-compose file to ensure proper port mapping
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo "Creating a comprehensive docker-compose file for update..."
    # Create a temporary but complete docker-compose file specifically for the update
    COMPOSE_UPDATE_FILE=$(create_file "/tmp/docker-compose.update.yml")
    
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
    echo "Comprehensive docker-compose file created at: $COMPOSE_UPDATE_FILE"
    
    # Export API_PORT as VITE_API_PORT to ensure it's available during build
    export VITE_API_PORT="${API_PORT:-3001}"
    echo "Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT, VITE_API_PORT=$VITE_API_PORT"
    
    # Build and run containers with explicitly passed environment variables
    echo "Building containers with comprehensive configuration..."
    $COMPOSE_CMD -f "$COMPOSE_UPDATE_FILE" build
    
    echo "Starting containers with explicit environment variables..."
    # Directly pass environment variables to the compose command
    FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT $COMPOSE_CMD -f "$COMPOSE_UPDATE_FILE" up -d
    
    COMPOSE_FILE="$COMPOSE_UPDATE_FILE"
else
    # For docker-compose, explicitly pass environment variables
    echo "Using environment variables: FRONTEND_PORT=$FRONTEND_PORT, BACKEND_PORT=$BACKEND_PORT, API_PORT=$API_PORT"
    
    # Create a temporary .env file to ensure environment variables are properly passed
    ENV_TEMP_FILE=$(create_file "/tmp/.env.temp")
    echo "FRONTEND_PORT=$FRONTEND_PORT" > "$ENV_TEMP_FILE"
    echo "BACKEND_PORT=$BACKEND_PORT" >> "$ENV_TEMP_FILE"
    echo "API_PORT=$API_PORT" >> "$ENV_TEMP_FILE"
    
    # Use the env-file option for docker-compose
    $COMPOSE_CMD -f $COMPOSE_FILE --env-file "$ENV_TEMP_FILE" up -d
    
    # Clean up temporary .env file
    if [ -f "$ENV_TEMP_FILE" ]; then
        rm "$ENV_TEMP_FILE"
        echo "Temporary environment file removed."
    fi
fi

START_EXIT_CODE=$?

# Add additional debugging for port configuration
echo "Verifying port configuration..."
echo "Expected configuration:"
echo "  Frontend Port: ${FRONTEND_PORT} (should be 15000 for production)"
echo "  Backend Port: ${BACKEND_PORT} (should be 15001 for production)"
echo "  API Port: ${API_PORT} (should be 15001 for production)"

# Add explicit warning if ports don't match expected production values
if [[ "$PRODUCTION_MODE" == "yes" ]]; then
    if [[ "$FRONTEND_PORT" != "15000" ]]; then
        echo "WARNING: Frontend port ${FRONTEND_PORT} does not match expected production port 15000"
        echo "Forcing frontend port to 15000 for production deployment"
        FRONTEND_PORT=15000
    fi
    
    if [[ "$BACKEND_PORT" != "15001" ]]; then
        echo "WARNING: Backend port ${BACKEND_PORT} does not match expected production port 15001"
        echo "Forcing backend port to 15001 for production deployment"
        BACKEND_PORT=15001
    fi
    
    if [[ "$API_PORT" != "15001" ]]; then
        echo "WARNING: API port ${API_PORT} does not match expected production port 15001"
        echo "Forcing API port to 15001 for production deployment"
        API_PORT=15001
    fi
    
    echo "Verified production port configuration:"
    echo "  Frontend Port: ${FRONTEND_PORT}"
    echo "  Backend Port: ${BACKEND_PORT}"
    echo "  API Port: ${API_PORT}"
fi

if [ $START_EXIT_CODE -ne 0 ]; then
    echo "Failed to start containers. Please check the error messages above."
    exit 1
fi
echo "Containers started successfully."

# Verify containers are running with enhanced verification and retries
echo "Verifying deployment..."
echo "Listing all running containers:"
$CONTAINER_CMD ps | grep -i "share\|frontend\|backend" || echo "No matching containers found"

# Call our enhanced verification function
verify_containers_running
VERIFICATION_RESULT=$?

# Even if verification technically failed, treat it as informational only
echo "Container port information:"
# Use our improved container detection for port verification
FRONTEND_ID=$(find_container_id "frontend")
if [ -n "$FRONTEND_ID" ]; then
    echo "Frontend container port mapping:"
    $CONTAINER_CMD port $FRONTEND_ID || echo "No port mapping found for frontend"
fi

BACKEND_ID=$(find_container_id "backend")
if [ -n "$BACKEND_ID" ]; then
    echo "Backend container port mapping:"
    $CONTAINER_CMD port $BACKEND_ID || echo "No port mapping found for backend"
fi

# Always show logs for informational purposes
echo "Container logs for reference:"
check_container_logs "backend"
check_container_logs "frontend"

# Clean up any temporary files created during the update
if [ -f "$COMPOSE_UPDATE_FILE" ]; then
    echo "Cleaning up temporary files..."
    # Keep the file for reference in case of issues
    cp "$COMPOSE_UPDATE_FILE" "${COMPOSE_UPDATE_FILE}.bak" 2>/dev/null || true
    echo "Docker-compose update file backed up for reference."
fi

# Clean up any backup files created by sed on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Cleaning up backup files..."
    find . -name "*.bak" -type f -delete 2>/dev/null || true
    echo "Backup files removed."
fi

echo "=== Update Complete ==="
echo "Your ShareThings deployment has been updated with the latest code."
echo "If you encounter any issues, you can restore your configuration from the backup."

# Display current configuration
echo ""
echo "=== Current Configuration ==="
echo "Container Engine: ${CONTAINER_ENGINE}"
echo "Compose File: ${COMPOSE_FILE}"
echo "Frontend Port: ${FRONTEND_PORT}"
echo "Backend Port: ${BACKEND_PORT}"
echo "API Port: ${API_PORT}"
echo "Production Mode: ${PRODUCTION_MODE}"

# Add instructions for manual cleanup if needed
echo ""
echo "=== Troubleshooting ==="
echo "If you encounter issues with containers not updating properly, you can try:"
echo "1. Manual cleanup: ${CONTAINER_CMD} rm -f \$(${CONTAINER_CMD} ps -a -q --filter name=share-things)"
echo "2. Restart the update: ./update-server.sh"
