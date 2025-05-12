# GitHub Action for Production Build

This document outlines the implementation plan for a GitHub Action that builds and loads the Docker Compose production configuration to ensure it builds and loads without errors.

## Overview

We will create a new GitHub Action workflow that:
1. Builds the ShareThings application using the production Docker Compose configuration
2. Verifies that the containers start correctly without errors
3. Adds a badge to the README file for this action

## Implementation Components

### 1. Build Production Script (build-production.sh)

We'll create a `build-production.sh` script in the root directory with the following functionality:

```bash
#!/bin/bash

# ShareThings Production Build Script
# This script builds and verifies the ShareThings application using Docker in production mode

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses BSD sed which requires an extension argument for -i
    SED_CMD="sed -i.bak"
else
    # Linux and others use GNU sed
    SED_CMD="sed -i"
fi

echo -e "${BLUE}=== ShareThings Production Build ===${NC}"
echo "This script will build and verify the ShareThings application in production mode using Docker."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker before running this script."
    exit 1
fi

# Check if Docker Compose is installed (either standalone or as part of Docker CLI)
DOCKER_COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    echo "Please install Docker Compose before running this script."
    exit 1
fi

echo -e "${GREEN}Using Docker Compose command: ${DOCKER_COMPOSE_CMD}${NC}"

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running.${NC}"
    echo "Please start Docker before running this script."
    exit 1
fi

# Create production environment files
echo -e "${YELLOW}Creating production environment files...${NC}"

# Create .env file for Docker Compose
cat > .env << EOL
# Docker Compose Environment Variables for Production
API_URL=http://localhost
SOCKET_URL=http://localhost
CORS_ORIGIN=http://localhost
SESSION_TIMEOUT=600000
SESSION_EXPIRY=86400000
LOG_LEVEL=info
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
FRONTEND_PORT=8080
BACKEND_PORT=3001
EOL

# Create client/.env file
mkdir -p client
cat > client/.env << EOL
# Client Environment Variables for Production
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_LOGGING=false
VITE_MAX_FILE_SIZE=104857600
VITE_DEFAULT_CHUNK_SIZE=65536
EOL

# Create server/.env file
mkdir -p server
cat > server/.env << EOL
# Server Environment Variables for Production
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:8080
SESSION_TIMEOUT=600000
SESSION_EXPIRY=86400000
LOG_LEVEL=info
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
EOL

echo -e "${GREEN}Environment files created.${NC}"

# Clean up any existing containers
echo -e "${YELLOW}Cleaning up existing containers...${NC}"
$DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml down
echo -e "${GREEN}Cleanup complete.${NC}"

# Build the containers
echo -e "${YELLOW}Building production containers...${NC}"
$DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml build
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Production build failed. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}Production build complete.${NC}"

# Start the containers to verify they work
echo -e "${YELLOW}Starting production containers to verify configuration...${NC}"
$DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml up -d
START_EXIT_CODE=$?

if [ $START_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Failed to start production containers. Exiting.${NC}"
    $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml down
    exit 1
fi

# Wait for containers to be healthy
echo -e "${YELLOW}Waiting for containers to be ready...${NC}"
sleep 10

# Check if containers are running
BACKEND_RUNNING=$($DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml ps backend | grep -c "Up")
FRONTEND_RUNNING=$($DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml ps frontend | grep -c "Up")

if [ $BACKEND_RUNNING -eq 0 ] || [ $FRONTEND_RUNNING -eq 0 ]; then
    echo -e "${RED}Production containers failed to start properly.${NC}"
    $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml logs
    $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml down
    exit 1
fi

echo -e "${GREEN}Production containers started successfully.${NC}"

# Clean up
echo -e "${YELLOW}Cleaning up containers...${NC}"
$DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml down
echo -e "${GREEN}Cleanup complete.${NC}"

# Clean up any backup files created by sed
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi

echo -e "${GREEN}Production build verification completed successfully!${NC}"
exit 0
```

### 2. GitHub Actions Workflow (.github/workflows/build-production.yml)

We'll create a new GitHub Actions workflow file with the following content:

```yaml
name: Build Production

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  build-production:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Cache Docker layers
      uses: actions/cache@v3
      with:
        path: /tmp/.buildx-cache
        key: ${{ runner.os }}-buildx-${{ github.sha }}
        restore-keys: |
          ${{ runner.os }}-buildx-
    
    - name: Make build-production script executable
      run: |
        chmod +x build-production.sh
    
    - name: Debug environment
      run: |
        echo "GitHub Actions environment:"
        echo "Working directory: $(pwd)"
        ls -la
        echo "Docker version:"
        docker --version
        echo "Docker Compose version:"
        docker-compose --version || docker compose version
        echo "Docker info:"
        docker info
    
    - name: Build production containers
      run: ./build-production.sh
      env:
        CI: true
        DOCKER_BUILDKIT: 1
    
    - name: Upload build artifacts
      uses: actions/upload-artifact@v4
      with:
        name: production-build-artifacts
        path: |
          server/dist
          client/dist
```

### 3. README Badge Updates

We'll update the README.md file to:
1. Rename the "Build" badge to "Build and Test"
2. Add a new "Build Production" badge

Current badges in README.md:
```markdown
[![Lint](https://github.com/jsbattig/share-things/actions/workflows/lint.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/lint.yml)
[![Build](https://github.com/jsbattig/share-things/actions/workflows/build.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/build.yml)
[![Dockered Build and Tests](https://github.com/jsbattig/share-things/actions/workflows/integration.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/integration.yml)
```

Updated badges:
```markdown
[![Lint](https://github.com/jsbattig/share-things/actions/workflows/lint.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/lint.yml)
[![Build and Test](https://github.com/jsbattig/share-things/actions/workflows/build.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/build.yml)
[![Build Production](https://github.com/jsbattig/share-things/actions/workflows/build-production.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/build-production.yml)
[![Dockered Build and Tests](https://github.com/jsbattig/share-things/actions/workflows/integration.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/integration.yml)
```

We'll also update the CI/CD section in the README to include the new workflow:

```markdown
## Continuous Integration and Deployment

ShareThings uses GitHub Actions for continuous integration and deployment:

- **Lint**: Runs linting checks on the codebase
- **Build and Test**: Builds the application and runs unit tests
- **Build Production**: Builds and verifies the production Docker configuration
- **Dockered Build and Tests**: Runs tests in Docker containers
```

## Implementation Steps

1. Switch to Code mode to implement the actual files
2. Create the `build-production.sh` script in the root directory
3. Make it executable with `chmod +x build-production.sh`
4. Create the `.github/workflows/build-production.yml` file
5. Update the README.md file to include the new badge and rename the existing one
6. Commit and push the changes to GitHub
7. Verify that the new GitHub Action runs correctly