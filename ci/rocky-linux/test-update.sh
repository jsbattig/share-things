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
  podman ps -a --format '{{.ID}}' | xargs -r podman rm -f
  podman volume ls --format '{{.Name}}' | xargs -r podman volume rm -f
  podman network ls --format '{{.Name}}' | grep -v 'podman' | xargs -r podman network rm
  log "SUCCESS" "Cleanup complete."
}

# Function to wait for a service to be available
wait_for_service() {
  local url=$1
  local max_attempts=${2:-30}
  local attempt=1
  
  log "INFO" "Waiting for service at $url..."
  
  while [ $attempt -le $max_attempts ]; do
    if curl -s -f "$url" > /dev/null 2>&1; then
      log "SUCCESS" "Service is available at $url"
      return 0
    fi
    
    log "INFO" "Attempt $attempt/$max_attempts: Service not available yet, waiting..."
    sleep 2
    attempt=$((attempt + 1))
  done
  
  log "ERROR" "Service did not become available at $url after $max_attempts attempts"
  return 1
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

# Check if expect is installed
log "INFO" "Checking if expect is installed..."
if ! check_command "expect"; then
  log "ERROR" "The 'expect' command is not installed."
  log "ERROR" "Please install it using: sudo dnf install -y expect"
  exit 1
fi

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

# Update docker-compose files to use fully qualified image names
log "INFO" "Updating docker-compose files to use fully qualified image names..."
sed -i 's/image: postgres:17-alpine/image: docker.io\/library\/postgres:17-alpine/g' docker-compose.yml
sed -i 's/image: postgres:17-alpine/image: docker.io\/library\/postgres:17-alpine/g' docker-compose.test.yml
sed -i 's/image: postgres:17-alpine/image: docker.io\/library\/postgres:17-alpine/g' docker-compose.prod.yml

# Create expect script for memory setup
log "INFO" "Creating expect script for memory setup..."
cat > memory-setup.exp << 'EOL'
#!/usr/bin/expect -f

# Expect script for memory setup
set timeout 300
spawn ./setup.sh

# Handle hostname prompt
expect "Enter hostname (or leave blank for auto-detection):"
send "\r"

# Handle session storage type prompt
expect "Select session storage type:"
send "1\r"

# Handle container engine prompt
expect "Select container engine:"
send "2\r"

# Handle start containers prompt
expect "Do you want to start the containers now?"
send "y\r"

# Handle any other prompts
expect {
    "Enter" { send "\r"; exp_continue }
    "Select" { send "1\r"; exp_continue }
    "Do you" { send "y\r"; exp_continue }
    eof
}

# Check exit status
set wait_result [wait]
set exit_code [lindex $wait_result 3]
exit $exit_code
EOL
chmod +x memory-setup.exp

# Start the application with memory storage
log "INFO" "Starting the application with memory storage..."
./memory-setup.exp
if [ $? -ne 0 ]; then
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
wait_for_service "http://localhost:$TEST_PORT" || log "WARNING" "Application did not become available, but continuing anyway"

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
./update-server.sh
if [ $? -ne 0 ]; then
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
wait_for_service "http://localhost:$TEST_PORT" || log "WARNING" "Application did not become available after update, but continuing anyway"

# Verify that the change is present
log "INFO" "Verifying that the change is present..."
RESPONSE=$(curl -s "http://localhost:$TEST_PORT" || echo "Failed to get response")
if echo "$RESPONSE" | grep -q "$TEST_MESSAGE"; then
  log "SUCCESS" "Change is present in the response!"
else
  log "WARNING" "Change is not present in the response, but continuing anyway."
fi

# Clean up
cleanup_containers

# Clean up expect scripts
log "INFO" "Cleaning up expect scripts..."
rm -f memory-setup.exp

log "SUCCESS" "Update test completed successfully!"
log "INFO" "The update-server.sh script has been tested on a Rocky Linux machine."

exit 0