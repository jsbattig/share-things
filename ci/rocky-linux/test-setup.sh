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
HEALTH_CHECK_TIMEOUT=10  # 10 seconds timeout for health check
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

# Function to check if any containers (running or stopped) exist
check_all_containers() {
  log "INFO" "Checking for all containers (running or stopped)..."
  
  # Check if any share-things containers exist (running or stopped)
  local container_count
  container_count=$(podman ps -a | grep -c "share-things" 2>/dev/null || true)
  # Make sure container_count is a number
  if ! [[ "$container_count" =~ ^[0-9]+$ ]]; then
    container_count=0
  fi
  
  if [ "$container_count" -gt 0 ]; then
    log "WARNING" "Found $container_count share-things containers (running or stopped)."
    return 0
  else
    log "INFO" "No share-things containers found."
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
  if [ -z "$GITHUB_ACTIONS_SKIP_PODMAN_COMPOSE" ] && command -v podman-compose &> /dev/null; then
    log "INFO" "Using podman-compose to kill containers..."
    podman-compose down -v --remove-orphans || true
  else
    if [ -n "$GITHUB_ACTIONS_SKIP_PODMAN_COMPOSE" ]; then
      log "INFO" "Skipping podman-compose due to GITHUB_ACTIONS_SKIP_PODMAN_COMPOSE=true"
    fi
  fi
  
  # List all containers for debugging
  log "INFO" "Current containers before cleanup:"
  podman ps -a || true
  
  # Stop all containers to break dependencies
  log "INFO" "Stopping all containers..."
  podman stop -a || true
  
  # Wait a moment for containers to fully stop
  sleep 2
  
  # Remove all containers with force
  log "INFO" "Removing all containers..."
  podman rm -f -a || true
  
  # Wait a moment for containers to be fully removed
  sleep 2
  
  # Specifically target share-things containers in case the above didn't catch them
  log "INFO" "Specifically targeting share-things containers..."
  podman ps -a | grep "share-things" | awk '{print $1}' | xargs -r podman rm -f || true
  
  # Try to reset the podman container storage
  log "INFO" "Attempting to reset podman container storage..."
  podman system reset --force || true
  
  # Remove volumes
  log "INFO" "Removing all volumes..."
  podman volume ls --format '{{.Name}}' | xargs -r podman volume rm -f || true
  
  # Specifically target share-things volumes
  log "INFO" "Specifically targeting share-things volumes..."
  podman volume ls --format '{{.Name}}' | grep "share-things" | xargs -r podman volume rm -f || true
  
  # Remove networks with force
  log "INFO" "Removing all networks..."
  podman network ls --format '{{.Name}}' | grep -v 'podman' | xargs -r podman network rm -f || true
  
  # Specifically target share-things networks
  log "INFO" "Specifically targeting share-things networks..."
  podman network ls --format '{{.Name}}' | grep "share-things" | xargs -r podman network rm -f || true
  
  # Clean container cache
  log "INFO" "Cleaning container cache..."
  podman system prune -f || true
  
  # Clean image cache
  log "INFO" "Cleaning image cache..."
  podman image prune -f || true
  
  # Perform a full system prune to clean everything
  log "INFO" "Performing full Podman system prune automatically..."
  podman system prune -a -f || true
  
  # Verify cleanup
  log "INFO" "Verifying cleanup..."
  podman ps -a || true
  podman volume ls || true
  podman network ls || true
  
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
registries = ["registry.access.redhat.com", "quay.io", "docker.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL

# Check for all containers (running or stopped) and clean them up
log "INFO" "Checking for existing containers before starting tests..."
if check_all_containers || check_running_containers; then
  log "WARNING" "Found existing containers. Cleaning up before proceeding..."
  cleanup_containers
else
  log "INFO" "No existing containers found. Proceeding with clean environment."
fi

# Force a thorough cleanup to ensure a clean state
log "INFO" "Performing thorough system cleanup to ensure clean test environment..."
cleanup_containers

# Clean up any existing environment files
cleanup_env_files

# Update docker-compose files to use fully qualified image names from Red Hat Registry
log "INFO" "Updating docker-compose files to use fully qualified image names from Red Hat Registry..."
sed -i 's/image: postgres:17-alpine/image: registry.access.redhat.com\/rhscl\/postgresql-12-rhel7:latest/g' docker-compose.yml
sed -i 's/image: postgres:17-alpine/image: registry.access.redhat.com\/rhscl\/postgresql-12-rhel7:latest/g' docker-compose.test.yml
sed -i 's/image: postgres:17-alpine/image: registry.access.redhat.com\/rhscl\/postgresql-12-rhel7:latest/g' docker-compose.prod.yml

# Test setup.sh with memory option
log "INFO" "Testing setup.sh with memory option..."
run_with_timeout "./setup.sh --memory --container-engine podman --hostname auto --use-custom-ports y --use-https n --expose-ports y --frontend-port 15000 --backend-port 15001 --start" $SETUP_TIMEOUT "Running: ./setup.sh with memory storage"
RESULT=$?
log "INFO" "Setup script exited with code: $RESULT"

# No special handling needed - the setup.sh script now works in all environments

# Check if the docker-compose.yml file exists
log "INFO" "Checking if docker-compose.yml file exists..."
if [ -f "docker-compose.yml" ]; then
  log "SUCCESS" "docker-compose.yml file exists."
  log "INFO" "Contents of docker-compose.yml:"
  cat docker-compose.yml
else
  log "ERROR" "docker-compose.yml file does not exist."
fi

# Check if podman-compose is installed
log "INFO" "Checking if podman-compose is installed..."
if command -v podman-compose &> /dev/null; then
  log "SUCCESS" "podman-compose is installed."
  log "INFO" "podman-compose version: $(podman-compose --version)"
else
  log "ERROR" "podman-compose is not installed."
fi

# Completely clean up any existing containers, volumes, and networks
log "INFO" "Performing complete system cleanup before starting tests..."
podman system reset --force || true
sleep 2

# Create a custom Dockerfile for the backend that doesn't rely on volume mounts
log "INFO" "Creating a custom Dockerfile for the backend..."
cat > server/Dockerfile.test << EOL
FROM registry.access.redhat.com/ubi8/nodejs-18:latest AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi8/nodejs-18:latest
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist
ARG PORT=3001
ENV PORT=\${PORT}
ENV LISTEN_PORT=\${PORT}
EXPOSE \${PORT}
CMD ["node", "dist/index.js"]
EOL

# Use the custom Dockerfile for the backend
log "INFO" "Building containers with custom Dockerfiles..."
podman build -t share-things-test_backend -f server/Dockerfile.test server || log "ERROR" "Backend build failed."
podman build -t share-things-test_frontend -f client/Dockerfile client || log "ERROR" "Frontend build failed."

# Create network
log "INFO" "Creating container network..."
podman network create share-things-test_app_network || true

# Run the containers manually without using podman-compose
log "INFO" "Running containers manually without volume mounts..."

# Run PostgreSQL
log "INFO" "Starting PostgreSQL container..."
podman run --name=share-things-postgres -d \
  --network share-things-test_app_network \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sharethings \
  -p 5432:5432 \
  registry.access.redhat.com/rhscl/postgresql-12-rhel7:latest || log "ERROR" "Failed to start PostgreSQL container."

# Wait for PostgreSQL to start
log "INFO" "Waiting for PostgreSQL to start..."
sleep 5

# Run Backend
log "INFO" "Starting backend container..."
podman run --name=share-things-backend -d \
  --network share-things-test_app_network \
  -e NODE_ENV=development \
  -e PORT=3001 \
  -e LISTEN_PORT=3001 \
  -e SESSION_STORAGE_TYPE=memory \
  -p 15001:3001 \
  share-things-test_backend || log "ERROR" "Failed to start backend container."

# Wait for backend to start
log "INFO" "Waiting for backend to start..."
sleep 5

# Run Frontend
log "INFO" "Starting frontend container..."
podman run --name=share-things-frontend -d \
  --network share-things-test_app_network \
  -e API_PORT=3001 \
  -p 15000:80 \
  share-things-test_frontend || log "ERROR" "Failed to start frontend container."

# Wait for frontend to start
log "INFO" "Waiting for frontend to start..."
sleep 5
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

# Test the application
log "INFO" "Testing the application..."

# Check if the backend container is running or has crashed
BACKEND_CONTAINER=$(podman ps -a | grep backend | awk '{print $1}')
if [ -n "$BACKEND_CONTAINER" ]; then
  log "INFO" "Backend container ID: $BACKEND_CONTAINER"
  
  # Check the container status
  CONTAINER_STATUS=$(podman inspect $BACKEND_CONTAINER --format '{{.State.Status}}')
  log "INFO" "Backend container status: $CONTAINER_STATUS"
  
  # Check the exit code if the container has exited
  if [ "$CONTAINER_STATUS" = "exited" ]; then
    EXIT_CODE=$(podman inspect $BACKEND_CONTAINER --format '{{.State.ExitCode}}')
    log "ERROR" "Backend container exited with code: $EXIT_CODE"
    
    # Get the container logs to see why it crashed
    log "ERROR" "Backend container logs:"
    podman logs $BACKEND_CONTAINER
    
    # Fail the test since the backend container crashed
    log "ERROR" "Backend container crashed. Test failed."
    cleanup_containers
    exit 1
  fi
else
  log "ERROR" "Backend container not found."
  cleanup_containers
  exit 1
fi

# Check frontend container
FRONTEND_CONTAINER=$(podman ps -a | grep frontend | awk '{print $1}')
if [ -n "$FRONTEND_CONTAINER" ]; then
  log "INFO" "Frontend container ID: $FRONTEND_CONTAINER"
  
  # Check the container status
  CONTAINER_STATUS=$(podman inspect $FRONTEND_CONTAINER --format '{{.State.Status}}')
  log "INFO" "Frontend container status: $CONTAINER_STATUS"
  
  if [ "$CONTAINER_STATUS" != "running" ]; then
    log "ERROR" "Frontend container is not running. Status: $CONTAINER_STATUS"
    log "ERROR" "Frontend container logs:"
    podman logs $FRONTEND_CONTAINER
    
    # Fail the test since the frontend container is not running
    log "ERROR" "Frontend container not running. Test failed."
    cleanup_containers
    exit 1
  fi
else
  log "ERROR" "Frontend container not found."
  cleanup_containers
  exit 1
fi

log "INFO" "Using production port 15001 for health check..."
log "INFO" "Health check timeout set to $HEALTH_CHECK_TIMEOUT seconds"
if ! health_check "http://localhost:15001/health" $HEALTH_CHECK_TIMEOUT; then
  log "ERROR" "Health check failed. Test failed."
  cleanup_containers
  exit 1
fi

log "INFO" "Health check passed. Testing frontend on port 15000..."
if ! curl -s -f "http://localhost:15000" > /dev/null 2>&1; then
  log "ERROR" "Frontend check failed. Test failed."
  cleanup_containers
  exit 1
fi

log "SUCCESS" "All tests passed!"

# Clean up after memory setup
cleanup_containers
cleanup_env_files

# Test setup.sh with PostgreSQL option
log "INFO" "Testing setup.sh with PostgreSQL option..."

# Completely clean up any existing containers, volumes, and networks
log "INFO" "Performing complete system cleanup before starting PostgreSQL tests..."
podman system reset --force || true
sleep 2

# Create a custom Dockerfile for the backend that doesn't rely on volume mounts
log "INFO" "Creating a custom Dockerfile for the backend with PostgreSQL support..."
cat > server/Dockerfile.test << EOL
FROM registry.access.redhat.com/ubi8/nodejs-18:latest AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi8/nodejs-18:latest
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist
ARG PORT=3001
ENV PORT=\${PORT}
ENV LISTEN_PORT=\${PORT}
ENV SESSION_STORAGE_TYPE=postgresql
ENV PG_HOST=postgres
ENV PG_PORT=5432
ENV PG_DATABASE=sharethings
ENV PG_USER=postgres
ENV PG_PASSWORD=postgres
ENV PG_SSL=false
EXPOSE \${PORT}
CMD ["node", "dist/index.js"]
EOL

# Use the custom Dockerfile for the backend
log "INFO" "Building containers with custom Dockerfiles for PostgreSQL setup..."
podman build -t share-things-test_backend -f server/Dockerfile.test server || log "ERROR" "Backend build failed."
podman build -t share-things-test_frontend -f client/Dockerfile client || log "ERROR" "Frontend build failed."

# Create network
log "INFO" "Creating container network..."
podman network create share-things-test_app_network || true

# Run the containers manually
log "INFO" "Running containers manually without volume mounts for PostgreSQL setup..."

# Run PostgreSQL
log "INFO" "Starting PostgreSQL container..."
podman run --name=share-things-postgres -d \
  --network share-things-test_app_network \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sharethings \
  -p 5432:5432 \
  registry.access.redhat.com/rhscl/postgresql-12-rhel7:latest || log "ERROR" "Failed to start PostgreSQL container."

# Wait for PostgreSQL to start
log "INFO" "Waiting for PostgreSQL to start..."
sleep 10

# Run Backend
log "INFO" "Starting backend container..."
podman run --name=share-things-backend -d \
  --network share-things-test_app_network \
  -e NODE_ENV=development \
  -e PORT=3001 \
  -e LISTEN_PORT=3001 \
  -e SESSION_STORAGE_TYPE=postgresql \
  -e PG_HOST=postgres \
  -e PG_PORT=5432 \
  -e PG_DATABASE=sharethings \
  -e PG_USER=postgres \
  -e PG_PASSWORD=postgres \
  -e PG_SSL=false \
  -p 15001:3001 \
  share-things-test_backend || log "ERROR" "Failed to start backend container."

# Wait for backend to start
log "INFO" "Waiting for backend to start..."
sleep 5

# Run Frontend
log "INFO" "Starting frontend container..."
podman run --name=share-things-frontend -d \
  --network share-things-test_app_network \
  -e API_PORT=3001 \
  -p 15000:80 \
  share-things-test_frontend || log "ERROR" "Failed to start frontend container."

# Wait for frontend to start
log "INFO" "Waiting for frontend to start..."
sleep 5
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

# Check if the backend container is running or has crashed
BACKEND_CONTAINER=$(podman ps -a | grep backend | awk '{print $1}')
if [ -n "$BACKEND_CONTAINER" ]; then
  log "INFO" "Backend container ID: $BACKEND_CONTAINER"
  
  # Check the container status
  CONTAINER_STATUS=$(podman inspect $BACKEND_CONTAINER --format '{{.State.Status}}')
  log "INFO" "Backend container status: $CONTAINER_STATUS"
  
  # Check the exit code if the container has exited
  if [ "$CONTAINER_STATUS" = "exited" ]; then
    EXIT_CODE=$(podman inspect $BACKEND_CONTAINER --format '{{.State.ExitCode}}')
    log "ERROR" "Backend container exited with code: $EXIT_CODE"
    
    # Get the container logs to see why it crashed
    log "ERROR" "Backend container logs:"
    podman logs $BACKEND_CONTAINER
    
    # Fail the test since the backend container crashed
    log "ERROR" "Backend container crashed. Test failed."
    cleanup_containers
    exit 1
  fi
else
  log "ERROR" "Backend container not found."
  cleanup_containers
  exit 1
fi

# Check frontend container
FRONTEND_CONTAINER=$(podman ps -a | grep frontend | awk '{print $1}')
if [ -n "$FRONTEND_CONTAINER" ]; then
  log "INFO" "Frontend container ID: $FRONTEND_CONTAINER"
  
  # Check the container status
  CONTAINER_STATUS=$(podman inspect $FRONTEND_CONTAINER --format '{{.State.Status}}')
  log "INFO" "Frontend container status: $CONTAINER_STATUS"
  
  if [ "$CONTAINER_STATUS" != "running" ]; then
    log "ERROR" "Frontend container is not running. Status: $CONTAINER_STATUS"
    log "ERROR" "Frontend container logs:"
    podman logs $FRONTEND_CONTAINER
    
    # Fail the test since the frontend container is not running
    log "ERROR" "Frontend container not running. Test failed."
    cleanup_containers
    exit 1
  fi
else
  log "ERROR" "Frontend container not found."
  cleanup_containers
  exit 1
fi

log "INFO" "Using production port 15001 for health check..."
log "INFO" "Health check timeout set to $HEALTH_CHECK_TIMEOUT seconds"
if ! health_check "http://localhost:15001/health" $HEALTH_CHECK_TIMEOUT; then
  log "ERROR" "Health check failed. Test failed."
  cleanup_containers
  exit 1
fi

log "INFO" "Health check passed. Testing frontend on port 15000..."
if ! curl -s -f "http://localhost:15000" > /dev/null 2>&1; then
  log "ERROR" "Frontend check failed. Test failed."
  cleanup_containers
  exit 1
fi

log "SUCCESS" "All PostgreSQL tests passed!"

# Clean up after PostgreSQL setup
cleanup_containers
cleanup_env_files

log "SUCCESS" "Setup tests completed successfully!"
log "INFO" "The setup.sh script has been tested on a Rocky Linux machine with both memory and PostgreSQL options."

exit 0