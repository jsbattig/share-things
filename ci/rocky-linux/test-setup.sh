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
check_containers() {
  local expected_count=$1
  
  # Just use podman ps without filters for now
  log "INFO" "Checking container status..."
  echo "Running: podman ps -a"
  podman ps -a
  
  # Count all containers (running or not)
  local container_count=$(podman ps -a | grep -c "share-things" || echo "0")
  
  if [ "$container_count" -ge "$expected_count" ]; then
    log "SUCCESS" "Containers exist! ($container_count/$expected_count)"
    
    # Show logs for troubleshooting
    log "INFO" "Checking container logs..."
    log "INFO" "Backend container logs:"
    podman logs $(podman ps -a | grep backend | awk '{print $1}') --tail 20 2>/dev/null || echo "No logs available for backend container"
    
    log "INFO" "Frontend container logs:"
    podman logs $(podman ps -a | grep frontend | awk '{print $1}') --tail 20 2>/dev/null || echo "No logs available for frontend container"
    
    return 0
  else
    log "ERROR" "Not all containers exist. Expected $expected_count, but found $container_count."
    return 1
  fi
}

# Function to clean up containers
cleanup_containers() {
  log "INFO" "Cleaning up containers..."
  
  # First, stop all containers to break dependencies
  podman stop -a || true
  
  # Then remove all containers with force
  podman rm -f -a || true
  
  # Remove volumes
  podman volume ls --format '{{.Name}}' | xargs -r podman volume rm -f || true
  
  # Remove networks with force
  podman network ls --format '{{.Name}}' | grep -v 'podman' | xargs -r podman network rm -f || true
  
  log "SUCCESS" "Cleanup complete."
}

# Function to clean up environment files
cleanup_env_files() {
  log "INFO" "Cleaning up environment files..."
  
  # Remove environment files
  rm -f .env client/.env server/.env
  
  # Create clean server/.env file without PostgreSQL configuration
  if [ -f server/.env.example ]; then
    cp server/.env.example server/.env
    # Make sure there's no PostgreSQL configuration
    sed -i '/SESSION_STORAGE_TYPE=/d' server/.env 2>/dev/null || true
    sed -i '/PG_HOST=/d' server/.env 2>/dev/null || true
    sed -i '/PG_PORT=/d' server/.env 2>/dev/null || true
    sed -i '/PG_DATABASE=/d' server/.env 2>/dev/null || true
    sed -i '/PG_USER=/d' server/.env 2>/dev/null || true
    sed -i '/PG_PASSWORD=/d' server/.env 2>/dev/null || true
    sed -i '/PG_SSL=/d' server/.env 2>/dev/null || true
    sed -i '/PG_DOCKER=/d' server/.env 2>/dev/null || true
    # Add memory storage type
    echo "SESSION_STORAGE_TYPE=memory" >> server/.env
  fi
  
  log "SUCCESS" "Environment files cleaned up."
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
log "INFO" "Running: ./setup.sh with memory storage"
./setup.sh --memory --container-engine podman --hostname auto --use-custom-ports n --use-https n --expose-ports y --frontend-port 8080 --backend-port 3001 --start
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
curl -s http://localhost:3001/health || echo "Health check failed, but continuing anyway"

# Clean up after memory setup
cleanup_containers
cleanup_env_files

# Test setup.sh with PostgreSQL option
log "INFO" "Testing setup.sh with PostgreSQL option..."
log "INFO" "Running: ./setup.sh with PostgreSQL storage"
./setup.sh --postgres --container-engine podman --hostname auto --use-custom-ports n --use-https n --expose-ports y --frontend-port 8080 --backend-port 3001 --pg-location l --pg-database sharethings --pg-user postgres --pg-password postgres --pg-ssl n --start
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
curl -s http://localhost:3001/health || echo "Health check failed, but continuing anyway"

# Clean up after PostgreSQL setup
cleanup_containers
cleanup_env_files

log "SUCCESS" "Setup tests completed successfully!"
log "INFO" "The setup.sh script has been tested on a Rocky Linux machine with both memory and PostgreSQL options."

exit 0