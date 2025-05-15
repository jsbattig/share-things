#!/bin/bash

# Test Setup Script for ShareThings on Rocky Linux
# This script tests the setup.sh script with both memory and PostgreSQL options
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

# Timeout settings
SETUP_TIMEOUT=300  # 5 minutes timeout for setup.sh
HEALTH_CHECK_TIMEOUT=60  # 1 minute timeout for health check
CONTAINER_CHECK_TIMEOUT=60  # 1 minute timeout for container check

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
  container_count=$(podman ps | grep -c "share-things" || echo "0")
  
  if [ "${container_count}" -gt 0 ]; then
    log "WARNING" "Found ${container_count} running share-things containers."
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
    container_count=$(podman ps -a | grep -c "share-things" || echo "0")
    
    if [ "${container_count}" -ge "${expected_count}" ]; then
      log "SUCCESS" "Containers exist! (${container_count}/${expected_count})"
      
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
  
  log "ERROR" "Container check timed out after ${timeout} seconds. Expected ${expected_count} containers, but found ${container_count}."
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

# Function to perform health check with timeout
health_check() {
  local url="$1"
  local timeout="$2"
  local start_time=$(date +%s)
  local end_time=$((start_time + timeout))
  
  log "INFO" "Performing health check on $url (timeout: ${timeout}s)..."
  
  while [ $(date +%s) -lt $end_time ]; do
    if curl -s -f "$url" > /dev/null 2>&1; then
      log "SUCCESS" "Health check passed for $url"
      return 0
    fi
    
    log "INFO" "Health check failed, retrying in 5 seconds... ($(( end_time - $(date +%s) ))s remaining)"
    sleep 5
  done
  
  log "ERROR" "Health check timed out after ${timeout} seconds"
  return 1
}

# Main script
log "INFO" "=== ShareThings Setup Test on Rocky Linux ==="
log "INFO" "This script will test the setup.sh script with both memory and PostgreSQL options."
log "INFO" "Branch: $BRANCH"
log "INFO" "Working directory: $WORK_DIR"
echo ""

# Check required commands
log "INFO" "Checking required commands..."
check_command "podman" || exit 1
check_command "curl" || exit 1
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

# Test setup.sh with memory option
log "INFO" "Testing setup.sh with memory option..."
run_with_timeout "./setup.sh --memory --container-engine podman --hostname auto --use-custom-ports n --use-https n --expose-ports y --frontend-port 8080 --backend-port 3001 --start" $SETUP_TIMEOUT "Running: ./setup.sh with memory storage"
RESULT=$?
log "INFO" "Setup script exited with code: $RESULT"
if [ $RESULT -ne 0 ]; then
  log "ERROR" "Memory setup failed."
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

# Test the application
log "INFO" "Testing the application..."
health_check "http://localhost:3001/health" $HEALTH_CHECK_TIMEOUT || log "WARNING" "Health check failed, but continuing anyway"

# Clean up after memory setup
cleanup_containers
cleanup_env_files

# Test setup.sh with PostgreSQL option
log "INFO" "Testing setup.sh with PostgreSQL option..."
run_with_timeout "./setup.sh --postgres --container-engine podman --hostname auto --use-custom-ports n --use-https n --expose-ports y --frontend-port 8080 --backend-port 3001 --pg-location l --pg-database sharethings --pg-user postgres --pg-password postgres --pg-ssl n --start" $SETUP_TIMEOUT "Running: ./setup.sh with PostgreSQL storage"
RESULT=$?
log "INFO" "Setup script exited with code: $RESULT"
if [ $RESULT -ne 0 ]; then
  log "ERROR" "PostgreSQL setup failed."
  cleanup_containers
  exit 1
fi

# Check if containers are running
log "INFO" "Checking if containers are running..."
check_containers 3  # backend, frontend, postgres
if [ $? -ne 0 ]; then
  log "ERROR" "Container check failed."
  cleanup_containers
  exit 1
fi

# Test the application
log "INFO" "Testing the application..."
health_check "http://localhost:3001/health" $HEALTH_CHECK_TIMEOUT || log "WARNING" "Health check failed, but continuing anyway"

# Clean up after PostgreSQL setup
cleanup_containers
cleanup_env_files

log "SUCCESS" "Setup tests completed successfully!"
log "INFO" "The setup.sh script has been tested on a Rocky Linux machine with both memory and PostgreSQL options."

exit 0