#!/bin/bash

# ShareThings Build and Test Script
# This script sets up, builds, and tests the ShareThings application using Docker

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses BSD sed which requires an extension argument for -i
    # Use a temporary file approach instead of creating backup files with ''
    SED_CMD="sed -i.bak"
else
    # Linux and others use GNU sed
    SED_CMD="sed -i"
fi

echo -e "${BLUE}=== ShareThings Build and Test ===${NC}"
echo "This script will build and test the ShareThings application using Docker."
echo ""

# Check if Docker is installed
if ! command -v podman &> /dev/null; then
    echo -e "${RED}Error: Podman is not installed.${NC}"
    echo "Please install Podman before running this script."
    exit 1
fi

# Check if Docker Compose is installed (either standalone or as part of Docker CLI)
DOCKER_COMPOSE_CMD=""
if command -v podman-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="podman-compose"
else
    echo -e "${RED}Error: Podman Compose is not installed.${NC}"
    echo "Please install Podman Compose before running this script."
    exit 1
fi
echo -e "${GREEN}Using Docker Compose command: ${DOCKER_COMPOSE_CMD}${NC}"

# Check if Docker daemon is running
if ! podman info &> /dev/null; then
    echo -e "${RED}Error: Podman is not running.${NC}"
    echo "Please start Podman before running this script."
    exit 1
fi

# Create test environment files
echo -e "${YELLOW}Creating test environment files...${NC}"

# Create .env file for Docker Compose
cat > .env << EOL
# Docker Compose Environment Variables for Testing
API_URL=http://localhost
SOCKET_URL=http://localhost
CORS_ORIGIN=http://localhost
SESSION_TIMEOUT=600000
SESSION_EXPIRY=86400000
LOG_LEVEL=debug
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
FRONTEND_PORT=8080
BACKEND_PORT=3001
EOL

# Create client/.env file
mkdir -p client
cat > client/.env << EOL
# Client Environment Variables for Testing
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_LOGGING=true
VITE_MAX_FILE_SIZE=104857600
VITE_DEFAULT_CHUNK_SIZE=65536
EOL

# Create server/.env file
mkdir -p server
cat > server/.env << EOL
# Server Environment Variables for Testing
PORT=3001
NODE_ENV=test
CORS_ORIGIN=http://localhost:8080
SESSION_TIMEOUT=600000
SESSION_EXPIRY=86400000
LOG_LEVEL=debug
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
EOL

echo -e "${GREEN}Environment files created.${NC}"

# Create docker-compose.test.yml
cat > $(dirname "$0")/../config/docker-compose.test.yml << EOL
# Test configuration for ShareThings Docker Compose

services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile.test
    container_name: share-things-backend-test
    network_mode: "host"  # Use host networking instead of bridge
    environment:
      - NODE_ENV=test
      - PORT=3001
    command: npm test

  # Use a simple Node.js container for the frontend instead of a multi-stage build
  frontend:
    image: node:18-alpine
    container_name: share-things-frontend-test
    network_mode: "host"  # Use host networking instead of bridge
    working_dir: /app
    volumes:
      - ./client:/app
    environment:
      - VITE_API_URL=http://localhost:3001
      - VITE_SOCKET_URL=http://localhost:3001
      - VITE_ENABLE_ANALYTICS=false
      - VITE_ENABLE_LOGGING=true
    command: sh -c "npm install && npm run preview -- --host 0.0.0.0 --port 3000"

# No networks needed with host networking
EOL

echo -e "${GREEN}Docker Compose test configuration created.${NC}"


# Clean up any existing containers
echo -e "${YELLOW}Cleaning up existing containers...${NC}"
# Change to the root directory
cd $(dirname "$0")/../..
# Use absolute path for docker-compose.test.yml
SCRIPT_DIR=$(dirname "$0")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
CONFIG_FILE="$PROJECT_ROOT/build/config/docker-compose.test.yml"
$DOCKER_COMPOSE_CMD -f "$CONFIG_FILE" down
echo -e "${GREEN}Cleanup complete.${NC}"

# Build the containers
echo -e "${YELLOW}Building containers...${NC}"
# Add environment variable for rootless Podman
export PODMAN_USERNS=keep-id

# Build the backend container directly with podman
echo -e "${YELLOW}Building backend container...${NC}"
podman build --no-cache -t localhost/share-things-backend-test:latest -f server/Dockerfile.test .

# We'll use the node:18-alpine image for the frontend as specified in the docker-compose file
echo -e "${YELLOW}Pulling frontend image...${NC}"
podman pull linner.ddns.net:4443/docker.io.proxy/node:18-alpine
podman tag linner.ddns.net:4443/docker.io.proxy/node:18-alpine localhost/share-things-frontend-test:latest
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Build failed. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}Build complete.${NC}"

# Create test results directory
mkdir -p test-results

# Run server unit tests
echo -e "${YELLOW}Running server unit tests...${NC}"
# Create a temporary file to capture test output
TEMP_OUTPUT=$(mktemp)
echo "Capturing test output to: $TEMP_OUTPUT"

# Run server unit tests directly with podman and capture output
echo -e "${YELLOW}Starting server unit tests...${NC}"
echo -e "${YELLOW}Temp output file: $TEMP_OUTPUT${NC}"

# Run tests and capture both output and exit code more reliably
set +e  # Don't exit on error
podman run --rm --name share-things-backend-test --network host -e NODE_ENV=test -e PORT=3001 localhost/share-things-backend-test:latest npm test > "$TEMP_OUTPUT" 2>&1
SERVER_TEST_EXIT_CODE=$?
set -e  # Re-enable exit on error

echo -e "${YELLOW}Server test exit code: $SERVER_TEST_EXIT_CODE${NC}"
echo -e "${YELLOW}Temp output file size: $(wc -l < "$TEMP_OUTPUT" 2>/dev/null || echo "0") lines${NC}"

# Always show the test output immediately
echo -e "${YELLOW}=== IMMEDIATE TEST OUTPUT ===${NC}"
cat "$TEMP_OUTPUT" 2>/dev/null || echo "Could not read temp output file"
echo -e "${YELLOW}=== END IMMEDIATE OUTPUT ===${NC}"

# Ensure client has crypto-js installed
echo -e "${YELLOW}Ensuring client has crypto-js installed...${NC}"
# Ensure client has crypto-js installed directly with podman
echo -e "${YELLOW}Ensuring client has crypto-js installed...${NC}"
podman run --rm --name share-things-frontend-test -v ./client:/app:Z -v ./shared:/app/shared:Z -w /app localhost/share-things-frontend-test:latest npm install crypto-js @types/crypto-js

if [ $SERVER_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Server unit tests passed.${NC}"
else
    echo -e "${RED}Server unit tests failed with exit code: $SERVER_TEST_EXIT_CODE${NC}"
    echo -e "${YELLOW}=== DEBUGGING TEST FAILURE ===${NC}"
    echo "TEMP_OUTPUT file: $TEMP_OUTPUT"
    echo "TEMP_OUTPUT exists: $(test -f "$TEMP_OUTPUT" && echo "YES" || echo "NO")"
    echo "TEMP_OUTPUT size: $(wc -c < "$TEMP_OUTPUT" 2>/dev/null || echo "0") bytes"
    
    if [ -f "$TEMP_OUTPUT" ]; then
        echo -e "${YELLOW}=== FULL TEST OUTPUT START ===${NC}"
        cat "$TEMP_OUTPUT"
        echo -e "${YELLOW}=== FULL TEST OUTPUT END ===${NC}"
        
        echo -e "${YELLOW}=== LAST 20 LINES ===${NC}"
        tail -20 "$TEMP_OUTPUT"
        echo -e "${YELLOW}=== END LAST 20 LINES ===${NC}"
    else
        echo -e "${RED}TEMP_OUTPUT file not found!${NC}"
    fi
    
    echo -e "${YELLOW}=== RUNNING TEST AGAIN FOR DEBUGGING ===${NC}"
    podman run --rm --name share-things-backend-test-debug --network host -e NODE_ENV=test -e PORT=3001 localhost/share-things-backend-test:latest npm test
    echo -e "${YELLOW}=== DEBUG TEST COMPLETE ===${NC}"
fi

# Clean up temp file
rm -f "$TEMP_OUTPUT"

# Run client unit tests
echo -e "${YELLOW}Running client unit tests...${NC}"
podman run --rm --name share-things-frontend-test -v ./client:/app:Z -v ./shared:/app/shared:Z -w /app localhost/share-things-frontend-test:latest sh -c "npm install && npm test"
CLIENT_TEST_EXIT_CODE=$?

if [ $CLIENT_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Client unit tests passed.${NC}"
else
    echo -e "${RED}Client unit tests failed.${NC}"
fi

# Build functional test container with canvas dependencies
echo -e "${YELLOW}Building functional test container...${NC}"
podman build -t share-things-functional-test -f test/e2e/functional/Dockerfile.test .

# Run functional tests
echo -e "${YELLOW}Running functional tests...${NC}"
podman run --rm --name share-things-functional-tests \
  --network host \
  -e VITE_API_URL=http://localhost:3001 \
  -e VITE_SOCKET_URL=http://localhost:3001 \
  share-things-functional-test \
  sh -c "NODE_OPTIONS=--experimental-vm-modules npx jest --config=jest.config.js simple-test.test.ts"

FUNCTIONAL_TEST_EXIT_CODE=$?

if [ $FUNCTIONAL_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Functional tests passed.${NC}"
else
    echo -e "${RED}Functional tests failed.${NC}"
fi


# Clean up
echo -e "${YELLOW}Cleaning up containers...${NC}"
# Clean up containers
echo -e "${YELLOW}Cleaning up containers...${NC}"
podman rm -f share-things-backend-test share-things-frontend-test 2>/dev/null || true
echo -e "${GREEN}Cleanup complete.${NC}"

# Report results
echo -e "${BLUE}=== Test Results ===${NC}"
if [ $SERVER_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Server unit tests: PASSED${NC}"
else
    echo -e "${RED}Server unit tests: FAILED${NC}"
fi

if [ $CLIENT_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Client unit tests: PASSED${NC}"
else
    echo -e "${RED}Client unit tests: FAILED${NC}"
fi

if [ $FUNCTIONAL_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Functional tests: PASSED${NC}"
else
    echo -e "${RED}Functional tests: FAILED${NC}"
fi


# Clean up any backup files created by sed
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi

# Overall result
if [ $SERVER_TEST_EXIT_CODE -eq 0 ] && [ $CLIENT_TEST_EXIT_CODE -eq 0 ] && [ $FUNCTIONAL_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi