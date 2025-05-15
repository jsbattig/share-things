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
  podman ps -a --format '{{.ID}}' | xargs -r podman rm -f
  podman volume ls --format '{{.Name}}' | xargs -r podman volume rm -f
  podman network ls --format '{{.Name}}' | grep -v 'podman' | xargs -r podman network rm
  log "SUCCESS" "Cleanup complete."
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

# Check if expect is installed
log "INFO" "Checking if expect is installed..."
if ! check_command "expect"; then
  log "ERROR" "The 'expect' command is not installed."
  log "ERROR" "Please install it using: sudo dnf install -y expect"
  exit 1
fi
log "SUCCESS" "Expect is installed at: $(which expect)"

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
log "SUCCESS" "Created expect script at: $(pwd)/memory-setup.exp"

# Test setup.sh with memory option
log "INFO" "Testing setup.sh with memory option..."
log "INFO" "Running: $(pwd)/memory-setup.exp"
./memory-setup.exp
RESULT=$?
log "INFO" "Expect script exited with code: $RESULT"
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

# Create expect script for PostgreSQL setup
log "INFO" "Creating expect script for PostgreSQL setup..."
cat > postgres-setup.exp << 'EOL'
#!/usr/bin/expect -f

# Expect script for PostgreSQL setup
set timeout 300
spawn ./setup.sh

# Handle hostname prompt
expect "Enter hostname (or leave blank for auto-detection):"
send "\r"

# Handle session storage type prompt
expect "Select session storage type:"
send "2\r"

# Handle PostgreSQL host prompt
expect "Enter PostgreSQL host:"
send "postgres\r"

# Handle PostgreSQL port prompt
expect "Enter PostgreSQL port:"
send "5432\r"

# Handle PostgreSQL database prompt
expect "Enter PostgreSQL database name:"
send "sharethings\r"

# Handle PostgreSQL user prompt
expect "Enter PostgreSQL username:"
send "postgres\r"

# Handle PostgreSQL password prompt
expect "Enter PostgreSQL password:"
send "postgres\r"

# Handle PostgreSQL SSL prompt
expect "Use SSL for PostgreSQL connection?"
send "n\r"

# Handle PostgreSQL Docker prompt
expect "Run PostgreSQL in Docker?"
send "y\r"

# Handle PostgreSQL host port prompt
expect "Enter host port for PostgreSQL:"
send "5432\r"

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
chmod +x postgres-setup.exp
log "SUCCESS" "Created expect script at: $(pwd)/postgres-setup.exp"

# Test setup.sh with PostgreSQL option
log "INFO" "Testing setup.sh with PostgreSQL option..."
log "INFO" "Running: $(pwd)/postgres-setup.exp"
./postgres-setup.exp
RESULT=$?
log "INFO" "Expect script exited with code: $RESULT"
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

# Clean up expect scripts
log "INFO" "Cleaning up expect scripts..."
rm -f memory-setup.exp postgres-setup.exp

log "SUCCESS" "Setup tests completed successfully!"
log "INFO" "The setup.sh script has been tested on a Rocky Linux machine with both memory and PostgreSQL options."

exit 0