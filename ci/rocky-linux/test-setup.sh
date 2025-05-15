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
  local actual_count=$(podman ps --filter label=io.podman.compose.project=share-things | grep -c "share-things" || echo "0")
  
  if [ "$actual_count" -ge "$expected_count" ]; then
    log "SUCCESS" "Containers are running successfully! ($actual_count/$expected_count)"
    return 0
  else
    log "ERROR" "Not all containers are running. Expected $expected_count, but found $actual_count."
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

# Create expect script for memory test
log "INFO" "Creating expect script for memory test..."
cat > memory-test.exp << 'EOL'
#!/usr/bin/expect -f

# Expect script for memory test
set timeout 300
spawn ./setup.sh --memory --test

# Handle hostname prompt
expect "Enter hostname (or leave blank for auto-detection):"
send "\r"

# Handle any other prompts
expect {
    "Enter" { send "\r"; exp_continue }
    eof
}

# Check exit status
set wait_result [wait]
set exit_code [lindex $wait_result 3]
exit $exit_code
EOL
chmod +x memory-test.exp

# Test setup.sh with memory option
log "INFO" "Testing setup.sh with memory option..."
./memory-test.exp
if [ $? -ne 0 ]; then
  log "ERROR" "Memory test failed."
  cleanup_containers
  exit 1
fi

# Clean up after memory test
cleanup_containers

# Create expect script for PostgreSQL test
log "INFO" "Creating expect script for PostgreSQL test..."
cat > postgres-test.exp << 'EOL'
#!/usr/bin/expect -f

# Expect script for PostgreSQL test
set timeout 300
spawn ./setup.sh --postgres --test

# Handle hostname prompt
expect "Enter hostname (or leave blank for auto-detection):"
send "\r"

# Handle any other prompts
expect {
    "Enter" { send "\r"; exp_continue }
    eof
}

# Check exit status
set wait_result [wait]
set exit_code [lindex $wait_result 3]
exit $exit_code
EOL
chmod +x postgres-test.exp

# Test setup.sh with PostgreSQL option
log "INFO" "Testing setup.sh with PostgreSQL option..."
./postgres-test.exp
if [ $? -ne 0 ]; then
  log "ERROR" "PostgreSQL test failed."
  cleanup_containers
  exit 1
fi

# Clean up after PostgreSQL test
cleanup_containers

# Create expect script for memory start
log "INFO" "Creating expect script for memory start..."
cat > memory-start.exp << 'EOL'
#!/usr/bin/expect -f

# Expect script for memory start
set timeout 300
spawn ./setup.sh --memory --start

# Handle hostname prompt
expect "Enter hostname (or leave blank for auto-detection):"
send "\r"

# Handle any other prompts
expect {
    "Enter" { send "\r"; exp_continue }
    eof
}

# Check exit status
set wait_result [wait]
set exit_code [lindex $wait_result 3]
exit $exit_code
EOL
chmod +x memory-start.exp

# Test setup.sh with memory option and start containers
log "INFO" "Testing setup.sh with memory option and starting containers..."
./memory-start.exp
if [ $? -ne 0 ]; then
  log "ERROR" "Memory start test failed."
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
curl -s http://localhost:3001/health | grep -q "OK"
if [ $? -ne 0 ]; then
  log "ERROR" "Health check failed."
  cleanup_containers
  exit 1
fi

# Clean up after memory start test
cleanup_containers

# Clean up expect scripts
log "INFO" "Cleaning up expect scripts..."
rm -f memory-test.exp postgres-test.exp memory-start.exp

log "SUCCESS" "Setup tests completed successfully!"
log "INFO" "The setup.sh script has been tested on a Rocky Linux machine with both memory and PostgreSQL options."

exit 0