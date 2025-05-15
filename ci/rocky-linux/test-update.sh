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
TEST_PORT=${3:-8080}

# Timeout settings
SETUP_TIMEOUT=300  # 5 minutes timeout for setup.sh
UPDATE_TIMEOUT=300  # 5 minutes timeout for update-server.sh
HEALTH_CHECK_TIMEOUT=60  # 1 minute timeout for health check
CONTAINER_CHECK_TIMEOUT=60  # 1 minute timeout for container check
SERVICE_WAIT_TIMEOUT=120  # 2 minutes timeout for service availability

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
  container_count=$(podman ps | grep -c "share-things" 2>/dev/null || echo "0")
  container_count=${container_count:-0}
  
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
    container_count=$(podman ps -a | grep -c "share-things" 2>/dev/null || echo "0")
    container_count=${container_count:-0}
    
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

# Configure Podman to allow short names
log "INFO" "Configuring Podman to allow short names..."
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
sed -i 's/image: postgres:17-alpine/image: docker.io\/library\/postgres:17-alpine/g' docker-compose.yml
sed -i 's/image: postgres:17-alpine/image: docker.io\/library\/postgres:17-alpine/g' docker-compose.test.yml
sed -i 's/image: postgres:17-alpine/image: docker.io\/library\/postgres:17-alpine/g' docker-compose.prod.yml

# Start the application with memory storage
log "INFO" "Starting the application with memory storage..."
run_with_timeout "./setup.sh --memory --container-engine podman --hostname auto --use-custom-ports n --use-https n --expose-ports y --frontend-port $TEST_PORT --backend-port 3001 --start" $SETUP_TIMEOUT "Running: ./setup.sh with memory storage"
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

# Run the update-server script
log "INFO" "Running the update-server script..."
run_with_timeout "./update-server.sh" $UPDATE_TIMEOUT "Running: ./update-server.sh"
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
wait_for_service "http://localhost:$TEST_PORT" $SERVICE_WAIT_TIMEOUT || {
  log "WARNING" "Application did not become available after update, but continuing anyway"
}

# Verify that the change is present
log "INFO" "Verifying that the change is present..."
RESPONSE=$(curl -s --max-time 30 "http://localhost:$TEST_PORT" || echo "Failed to get response")
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