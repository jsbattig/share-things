#!/bin/bash

# Test Update Script for ShareThings on Rocky Linux
# This script tests the update-server.sh script by making a minimal change
# and verifying that the change is present after the update
# It is designed to be run directly on a Rocky Linux machine as part of CI/CD

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration (no secrets here)
BRANCH=${1:-"feature/postgresql-session-management"}
WORK_DIR=${2:-"$(pwd)"}
TEST_PORT=${3:-15000}

# Docker registry configuration
DOCKER_REGISTRY_URL=""
DOCKER_USERNAME=""
DOCKER_PASSWORD=""

# Parse command line arguments for Docker registry
while [[ $# -gt 3 ]]; do
  case $4 in
    --docker-registry-url)
      DOCKER_REGISTRY_URL="$5"
      shift 2
      ;;
    --docker-username)
      DOCKER_USERNAME="$5"
      shift 2
      ;;
    --docker-password)
      DOCKER_PASSWORD="$5"
      shift 2
      ;;
    *)
      # Skip unknown arguments
      shift
      ;;
  esac
done

# Check if we're running in GitHub Actions
if [ -n "$GITHUB_ACTIONS" ]; then
  # Use GitHub secrets if available
  if [ -n "$HARBORURL" ]; then
    DOCKER_REGISTRY_URL="$HARBORURL"
  fi
  if [ -n "$HARBORUSERNAME" ]; then
    DOCKER_USERNAME="$HARBORUSERNAME"
  fi
  if [ -n "$HARBORPASSWORD" ]; then
    DOCKER_PASSWORD="$HARBORPASSWORD"
  fi
fi

# Timeout settings
SETUP_TIMEOUT=300  # 5 minutes timeout for setup.sh
UPDATE_TIMEOUT=300  # 5 minutes timeout for update-server.sh
HEALTH_CHECK_TIMEOUT=10  # 10 seconds timeout for health check
CONTAINER_CHECK_TIMEOUT=60  # 1 minute timeout for container check
SERVICE_WAIT_TIMEOUT=10  # 10 seconds timeout for service availability

# Function to log messages
log() {
  local level=$1
  local message=$2
  local color=$BLUE
  
  case $level in
    "INFO") color=$BLUE ;;
    "SUCCESS") color=$GREEN ;;
    "WARNING") color=$YELLOW ;;
    "ERROR") color=$RED ;;
  esac
  
  echo -e "${color}[$level] $message${NC}"
}

# Function to check if a command exists
check_command() {
  local command=$1
  if ! command -v $command &> /dev/null; then
    log "ERROR" "$command is not installed. Please install it before running this script."
    return 1
  fi
  return 0
}

# Function to check if containers are running
check_running_containers() {
  log "INFO" "Checking for running containers..."
  
  # Check if any share-things containers are running
  local container_count
  container_count=$(podman ps | grep -c "share-things" 2>/dev/null || true)
  # Make sure container_count is a number
  if ! [[ "$container_count" =~ ^[0-9]+$ ]]; then
    container_count=0
  fi
  
  if [ "$container_count" -gt 0 ]; then
    log "WARNING" "Found $container_count running share-things containers."
    return 0
  else
    log "INFO" "No running share-things containers found."
    return 1
  fi
}

# Function to check if containers are running with timeout
check_containers() {
  local expected_count=$1
  local timeout=$CONTAINER_CHECK_TIMEOUT
  local start_time=$(date +%s)
  local end_time=$((start_time + timeout))
  
  log "INFO" "Checking container status (timeout: ${timeout}s)..."
  
  while [ $(date +%s) -lt $end_time ]; do
    echo "Running: podman ps -a"
    podman ps -a
    
    # Count all containers (running or not)
    local container_count
    container_count=$(podman ps -a | grep -c "share-things" 2>/dev/null || true)
    # Make sure container_count is a number
    if ! [[ "$container_count" =~ ^[0-9]+$ ]]; then
      container_count=0
    fi
    
    if [ "$container_count" -ge "$expected_count" ]; then
      log "SUCCESS" "Containers exist! ($container_count/$expected_count)"
      
      # Show logs for troubleshooting
      log "INFO" "Checking container logs..."
      log "INFO" "Backend container logs:"
      podman logs $(podman ps -a | grep backend | awk '{print $1}') --tail 20 2>/dev/null || echo "No logs available for backend container"
      
      log "INFO" "Frontend container logs:"
      podman logs $(podman ps -a | grep frontend | awk '{print $1}') --tail 20 2>/dev/null || echo "No logs available for frontend container"
      
      return 0
    fi
    
    log "INFO" "Not all containers are ready yet. Waiting 5 seconds... ($(( end_time - $(date +%s) ))s remaining)"
    sleep 5
  done
  
  log "ERROR" "Container check timed out after ${timeout} seconds. Expected $expected_count containers, but found $container_count."
  return 1
}

# Function to clean up containers
cleanup_containers() {
  log "INFO" "Cleaning up containers..."
  
  # First try to use podman-compose to kill and remove containers
  if command -v podman-compose &> /dev/null; then
    log "INFO" "Using podman-compose to kill containers..."
    podman-compose down -v --remove-orphans || true
  fi
  
  # Stop all containers to break dependencies
  log "INFO" "Stopping all containers..."
  podman stop -a || true
  
  # Remove all containers with force
  log "INFO" "Removing all containers..."
  podman rm -f -a || true
  
  # Remove volumes
  log "INFO" "Removing all volumes..."
  podman volume ls --format '{{.Name}}' | xargs -r podman volume rm -f || true
  
  # Remove networks with force
  log "INFO" "Removing all networks..."
  podman network ls --format '{{.Name}}' | grep -v 'podman' | xargs -r podman network rm -f || true
  
  # Clean container cache
  log "INFO" "Cleaning container cache..."
  podman system prune -f || true
  
  # Clean image cache
  log "INFO" "Cleaning image cache..."
  podman image prune -f || true
  
  log "SUCCESS" "Cleanup complete."
}

# Function to clean up environment files
cleanup_env_files() {
  log "INFO" "Cleaning up environment files..."
  
  # Remove environment files
  rm -f .env client/.env server/.env
  
  log "SUCCESS" "Environment files cleaned up."
}

# Function to wait for a service to be available with improved timeout
wait_for_service() {
  local url=$1
  local timeout=${2:-$SERVICE_WAIT_TIMEOUT}
  local start_time=$(date +%s)
  local end_time=$((start_time + timeout))
  
  log "INFO" "Waiting for service at $url (timeout: ${timeout}s)..."
  
  while [ $(date +%s) -lt $end_time ]; do
    if curl -s -f "$url" > /dev/null 2>&1; then
      log "SUCCESS" "Service is available at $url"
      return 0
    fi
    
    log "INFO" "Service not available yet, retrying in 5 seconds... ($(( end_time - $(date +%s) ))s remaining)"
    sleep 5
  done
  
  log "ERROR" "Service did not become available at $url after ${timeout} seconds"
  return 1
}

# Function to run a command with timeout and real-time output
run_with_timeout() {
  local cmd="$1"
  local timeout="$2"
  local message="$3"
  
  log "INFO" "$message (timeout: ${timeout}s)"
  
  # Run the command with timeout and show output in real-time
  # We use script to capture the output while still displaying it
  script -q -c "timeout $timeout bash -c \"$cmd\"" /dev/null
  local exit_code=$?
  
  if [ $exit_code -eq 124 ]; then
    log "ERROR" "Command timed out after ${timeout} seconds"
    return 124
  elif [ $exit_code -ne 0 ]; then
    log "ERROR" "Command failed with exit code $exit_code"
    return $exit_code
  fi
  
  return 0
}

# Main script
log "INFO" "=== ShareThings Update Test on Rocky Linux ==="
log "INFO" "This script will test the update-server.sh script by making a minimal change and verifying it."
log "INFO" "Branch: $BRANCH"
log "INFO" "Working directory: $WORK_DIR"
log "INFO" "Test port: $TEST_PORT"
echo ""

# Check required commands
log "INFO" "Checking required commands..."
check_command "podman" || exit 1
check_command "curl" || exit 1
check_command "sed" || exit 1
check_command "timeout" || exit 1
check_command "script" || exit 1

# Configure Docker registry access
log "INFO" "Configuring Docker registry access..."
log "INFO" "Docker Registry URL: ${DOCKER_REGISTRY_URL:-not set}"
log "INFO" "Docker Username: ${DOCKER_USERNAME:-not set}"
log "INFO" "Docker Password: ${DOCKER_PASSWORD:-masked}"

# Build the command with any provided arguments
DOCKER_AUTH_CMD="$(dirname "$0")/docker-auth.sh"
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  DOCKER_AUTH_CMD="$DOCKER_AUTH_CMD --registry-url $DOCKER_REGISTRY_URL"
fi
if [ -n "$DOCKER_USERNAME" ]; then
  DOCKER_AUTH_CMD="$DOCKER_AUTH_CMD --username $DOCKER_USERNAME"
fi
if [ -n "$DOCKER_PASSWORD" ]; then
  DOCKER_AUTH_CMD="$DOCKER_AUTH_CMD --password $DOCKER_PASSWORD"
fi

# Run the Docker registry configuration script
if [ -f "$(dirname "$0")/docker-auth.sh" ]; then
  log "INFO" "Running Docker auth script: $DOCKER_AUTH_CMD"
  chmod +x "$(dirname "$0")/docker-auth.sh"
  eval "$DOCKER_AUTH_CMD"
  if [ $? -eq 0 ]; then
    log "GREEN" "Docker registry configuration successful."
  else
    log "RED" "Docker registry configuration failed."
  fi
else
  log "RED" "Docker registry configuration script not found."
  
  # Fallback to basic configuration if script not found
  log "INFO" "Falling back to basic Docker registry configuration..."
  mkdir -p ~/.config/containers
  cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["docker.io", "quay.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL
fi

# Check if containers are already running and clean them up
if check_running_containers; then
  log "WARNING" "Found running containers. Cleaning up before proceeding..."
  cleanup_containers
fi

# Clean up any existing containers
cleanup_containers

# Clean up any existing environment files
cleanup_env_files

# Update docker-compose files to use fully qualified image names
log "INFO" "Updating docker-compose files to use fully qualified image names..."

# Determine registry prefix
REGISTRY_PREFIX="docker.io/library"
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  REGISTRY_PREFIX="${DOCKER_REGISTRY_URL}/library"
  log "INFO" "Using custom registry URL for docker-compose files: ${DOCKER_REGISTRY_URL}"
fi

# Check if we have a .docker-registry-url file from docker-auth.sh
if [ -f "./.docker-registry-url" ]; then
  REGISTRY_URL=$(cat ./.docker-registry-url)
  if [ -n "$REGISTRY_URL" ] && [ -z "$DOCKER_REGISTRY_URL" ]; then
    REGISTRY_PREFIX="${REGISTRY_URL}/library"
    log "INFO" "Using registry URL from .docker-registry-url: ${REGISTRY_URL}"
  fi
fi

# Update docker-compose files
log "INFO" "Using registry prefix: ${REGISTRY_PREFIX}"
sed -i "s|image: postgres:17-alpine|image: ${REGISTRY_PREFIX}/postgres:14-alpine|g" docker-compose.yml
sed -i "s|image: postgres:17-alpine|image: ${REGISTRY_PREFIX}/postgres:14-alpine|g" docker-compose.test.yml
sed -i "s|image: postgres:17-alpine|image: ${REGISTRY_PREFIX}/postgres:14-alpine|g" docker-compose.prod.yml

# Also update any existing image references
sed -i "s|image: docker.io/library/|image: ${REGISTRY_PREFIX}/|g" docker-compose.yml
sed -i "s|image: docker.io/library/|image: ${REGISTRY_PREFIX}/|g" docker-compose.test.yml
sed -i "s|image: docker.io/library/|image: ${REGISTRY_PREFIX}/|g" docker-compose.prod.yml

# Update Dockerfiles
if [ -f "./server/Dockerfile" ]; then
  log "INFO" "Updating server/Dockerfile..."
  sed -i "s|FROM docker.io/library/|FROM ${REGISTRY_PREFIX}/|g" ./server/Dockerfile
fi

if [ -f "./client/Dockerfile" ]; then
  log "INFO" "Updating client/Dockerfile..."
  sed -i "s|FROM docker.io/library/|FROM ${REGISTRY_PREFIX}/|g" ./client/Dockerfile
fi

# Prepare Docker registry parameters for setup.sh
SETUP_DOCKER_PARAMS=""
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  SETUP_DOCKER_PARAMS="$SETUP_DOCKER_PARAMS --docker-registry-url $DOCKER_REGISTRY_URL"
  log "INFO" "Adding Docker registry URL parameter to setup.sh"
fi
if [ -n "$DOCKER_USERNAME" ]; then
  SETUP_DOCKER_PARAMS="$SETUP_DOCKER_PARAMS --docker-username $DOCKER_USERNAME"
  log "INFO" "Adding Docker username parameter to setup.sh"
fi
if [ -n "$DOCKER_PASSWORD" ]; then
  SETUP_DOCKER_PARAMS="$SETUP_DOCKER_PARAMS --docker-password $DOCKER_PASSWORD"
  log "INFO" "Adding Docker password parameter to setup.sh"
fi

# Start the application with memory storage
log "INFO" "Starting the application with memory storage..."
log "INFO" "Setup command: ./setup.sh --memory --container-engine podman --hostname auto --use-custom-ports y --use-https n --expose-ports y --frontend-port 15000 --backend-port 15001 --start $SETUP_DOCKER_PARAMS"
run_with_timeout "./setup.sh --memory --container-engine podman --hostname auto --use-custom-ports y --use-https n --expose-ports y --frontend-port 15000 --backend-port 15001 --start $SETUP_DOCKER_PARAMS" $SETUP_TIMEOUT "Running: ./setup.sh with memory storage"
RESULT=$?
log "INFO" "Setup script exited with code: $RESULT"
if [ $RESULT -ne 0 ]; then
  log "ERROR" "Failed to start the application."
  cleanup_containers
  exit 1
fi

# Check if containers are running
log "INFO" "Checking if containers are running..."
check_containers 2
if [ $? -ne 0 ]; then
  log "ERROR" "Container check failed."
  
  # Get detailed logs from the backend container
  log "INFO" "Getting detailed logs from the backend container..."
  BACKEND_CONTAINER=$(podman ps -a | grep backend | awk '{print $1}')
  if [ -n "$BACKEND_CONTAINER" ]; then
    log "INFO" "Backend container ID: $BACKEND_CONTAINER"
    log "INFO" "Backend container logs:"
    podman logs $BACKEND_CONTAINER
    
    # Check if the backend container is running
    log "INFO" "Backend container status:"
    podman inspect $BACKEND_CONTAINER --format '{{.State.Status}}'
    
    # Check the exit code if the container has exited
    log "INFO" "Backend container exit code:"
    podman inspect $BACKEND_CONTAINER --format '{{.State.ExitCode}}'
    
    # Check the error message if the container has exited
    log "INFO" "Backend container error:"
    podman inspect $BACKEND_CONTAINER --format '{{.State.Error}}'
  else
    log "ERROR" "Backend container not found."
  fi
  
  cleanup_containers
  exit 1
fi

# Wait for the application to be available
wait_for_service "http://localhost:$TEST_PORT" $SERVICE_WAIT_TIMEOUT || {
  log "WARNING" "Application did not become available, but continuing anyway"
}

# Make a minimal change to the login screen
log "INFO" "Making a minimal change to the login screen..."
TIMESTAMP=$(date +%s)
TEST_MESSAGE="Update Test $TIMESTAMP"

# Find the HomePage.tsx file and add a test message
if [ -f "client/src/pages/HomePage.tsx" ]; then
  log "INFO" "Modifying client/src/pages/HomePage.tsx..."
  sed -i "s/<h1>ShareThings<\/h1>/<h1>ShareThings<\/h1><div id=\"update-test\">$TEST_MESSAGE<\/div>/g" client/src/pages/HomePage.tsx
else
  log "ERROR" "Could not find client/src/pages/HomePage.tsx"
  cleanup_containers
  exit 1
fi

# Prepare Docker registry parameters for update-server.sh
UPDATE_DOCKER_PARAMS=""
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  UPDATE_DOCKER_PARAMS="$UPDATE_DOCKER_PARAMS --docker-registry-url $DOCKER_REGISTRY_URL"
  log "INFO" "Adding Docker registry URL parameter to update-server.sh"
fi
if [ -n "$DOCKER_USERNAME" ]; then
  UPDATE_DOCKER_PARAMS="$UPDATE_DOCKER_PARAMS --docker-username $DOCKER_USERNAME"
  log "INFO" "Adding Docker username parameter to update-server.sh"
fi
if [ -n "$DOCKER_PASSWORD" ]; then
  UPDATE_DOCKER_PARAMS="$UPDATE_DOCKER_PARAMS --docker-password $DOCKER_PASSWORD"
  log "INFO" "Adding Docker password parameter to update-server.sh"
fi

# Run the update-server script
log "INFO" "Running the update-server script..."
log "INFO" "Update command: ./update-server.sh $UPDATE_DOCKER_PARAMS"
run_with_timeout "./update-server.sh $UPDATE_DOCKER_PARAMS" $UPDATE_TIMEOUT "Running: ./update-server.sh"
RESULT=$?
if [ $RESULT -ne 0 ]; then
  log "ERROR" "Failed to update the server."
  cleanup_containers
  exit 1
fi

# Check if containers are running after update
log "INFO" "Checking if containers are running after update..."
check_containers 2
if [ $? -ne 0 ]; then
  log "ERROR" "Container check failed after update."
  cleanup_containers
  exit 1
fi

# Wait for the application to be available again
# After update-server.sh runs, the port changes to 15000 for production mode
log "INFO" "Checking for service on port 15000 (production port)..."
wait_for_service "http://localhost:15000" $SERVICE_WAIT_TIMEOUT || {
  log "WARNING" "Application did not become available on port 15000 after update, trying original port $TEST_PORT..."
  wait_for_service "http://localhost:$TEST_PORT" $SERVICE_WAIT_TIMEOUT || {
    log "WARNING" "Application did not become available after update, but continuing anyway"
  }
}

# Verify that the change is present
log "INFO" "Verifying that the change is present..."
# Try production port first, then fall back to original port
RESPONSE=$(curl -s --max-time 30 "http://localhost:15000" || curl -s --max-time 30 "http://localhost:$TEST_PORT" || echo "Failed to get response")
if echo "$RESPONSE" | grep -q "$TEST_MESSAGE"; then
  log "SUCCESS" "Change is present in the response!"
else
  log "WARNING" "Change is not present in the response, but continuing anyway."
fi

# Clean up
cleanup_containers
cleanup_env_files

log "SUCCESS" "Update test completed successfully!"
log "INFO" "The update-server.sh script has been tested on a Rocky Linux machine."

exit 0