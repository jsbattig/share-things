# CI/CD Implementation Plan for ShareThings

This document outlines a comprehensive plan for implementing continuous integration and continuous deployment (CI/CD) for the ShareThings application. It includes a build-and-test script for local development and GitHub Actions workflows for automated testing and deployment.

## Table of Contents

1. [Build and Test Script](#build-and-test-script)
2. [GitHub Actions Workflows](#github-actions-workflows)
3. [README Badge Integration](#readme-badge-integration)
4. [Implementation Steps](#implementation-steps)

## Build and Test Script

### Overview

The `build-and-test.sh` script will automate the process of setting up, building, and testing the ShareThings application using Docker. It will:

1. Set up the Docker environment
2. Build the containers
3. Run unit tests
4. Run functional tests
5. Run end-to-end tests
6. Report results

### Script Content

```bash
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
    SED_CMD="sed -i ''"
else
    # Linux and others use GNU sed
    SED_CMD="sed -i"
fi

echo -e "${BLUE}=== ShareThings Build and Test ===${NC}"
echo "This script will build and test the ShareThings application using Docker."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker before running this script."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    echo "Please install Docker Compose before running this script."
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
cat > docker-compose.test.yml << EOL
# Test configuration for ShareThings Docker Compose

services:
  backend:
    environment:
      - NODE_ENV=test
    ports:
      - "\${BACKEND_PORT}:3001"
    command: npm run test

  frontend:
    ports:
      - "\${FRONTEND_PORT}:80"
    command: npm run test

  e2e-tests:
    build:
      context: ./test/e2e/browser
      dockerfile: Dockerfile
    depends_on:
      - frontend
      - backend
    environment:
      - FRONTEND_URL=http://frontend
      - BACKEND_URL=http://backend:3001
    volumes:
      - ./test-results:/app/test-results
EOL

echo -e "${GREEN}Docker Compose test configuration created.${NC}"

# Clean up any existing containers
echo -e "${YELLOW}Cleaning up existing containers...${NC}"
docker-compose down
echo -e "${GREEN}Cleanup complete.${NC}"

# Build the containers
echo -e "${YELLOW}Building containers...${NC}"
docker-compose build
echo -e "${GREEN}Build complete.${NC}"

# Run unit tests
echo -e "${YELLOW}Running server unit tests...${NC}"
docker-compose run --rm backend npm test
SERVER_TEST_EXIT_CODE=$?

echo -e "${YELLOW}Running client unit tests...${NC}"
docker-compose run --rm frontend npm test
CLIENT_TEST_EXIT_CODE=$?

# Run functional tests
echo -e "${YELLOW}Running functional tests...${NC}"
docker-compose run --rm backend npm run test:e2e
FUNCTIONAL_TEST_EXIT_CODE=$?

# Run end-to-end tests
echo -e "${YELLOW}Running end-to-end tests...${NC}"
docker-compose -f docker-compose.yml -f docker-compose.test.yml up e2e-tests
E2E_TEST_EXIT_CODE=$?

# Clean up
echo -e "${YELLOW}Cleaning up containers...${NC}"
docker-compose down
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

if [ $E2E_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}End-to-end tests: PASSED${NC}"
else
    echo -e "${RED}End-to-end tests: FAILED${NC}"
fi

# Overall result
if [ $SERVER_TEST_EXIT_CODE -eq 0 ] && [ $CLIENT_TEST_EXIT_CODE -eq 0 ] && [ $FUNCTIONAL_TEST_EXIT_CODE -eq 0 ] && [ $E2E_TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
```

### Usage

```bash
# Make the script executable
chmod +x build-and-test.sh

# Run the script
./build-and-test.sh
```

## GitHub Actions Workflow

### Overview

We'll create a combined GitHub Actions workflow with sequential jobs:

1. **Lint**: Runs linting checks on the codebase
2. **Build**: Builds the application and runs unit tests
3. **Integration**: Runs tests in Docker containers
4. **Build Production**: Builds the production Docker configuration
5. **Deploy Production**: Deploys to the production server

### Workflow File

The workflow is defined in a single file: `.github/workflows/share-things-ci-cd.yml`

This approach ensures that jobs run in sequence and that later jobs only run if earlier jobs succeed. For the complete workflow file content, see the [GitHub Actions Sequence Plan](./github-actions-sequence-plan.md).

Key features of this approach:

1. **Sequential Execution**: Jobs run in the specified sequence (Lint → Build → Integration → Build Production → Deploy to Production)
2. **Dependency Chain**: Each job has a `needs` parameter that specifies which job(s) must complete successfully before it can run
3. **Conditional Deployment**: The deployment job only runs on pushes to the master branch, not on pull requests
4. **Badge Status**: Job-specific badges accurately reflect the status of each step in the pipeline
5. **Failure Handling**: If any job fails, all subsequent jobs will be skipped automatically

## README Badge Integration

Add the following job-specific badges to the top of your README.md file:

```markdown
# ShareThings

[![Lint](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=lint)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build and Test](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Integration Tests](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=integration)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Deploy to Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=deploy-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)

A real-time content sharing application with end-to-end encryption.
```

The `job=jobname` parameter in each badge URL is crucial as it shows the status of a specific job rather than the overall workflow status.

## Implementation Steps

1. **Create the Build and Test Script**:
   - Switch to Code mode
   - Create the `build-and-test.sh` script
   - Make it executable with `chmod +x build-and-test.sh`
   - Test it locally to ensure it works correctly

2. **Set Up GitHub Actions**:
   - Create the `.github/workflows` directory
   - Create the combined workflow file: `share-things-ci-cd.yml`
   - Customize the workflow as needed for your specific repository

3. **Update the README**:
   - Add the badges to the top of the README.md file
   - Update the badge URLs to match your GitHub username and repository name

4. **Test the CI/CD Pipeline**:
   - Push the changes to GitHub
   - Verify that the GitHub Actions workflows run correctly
   - Check that the badges appear in the README

5. **Refine as Needed**:
   - Monitor the CI/CD pipeline for any issues
   - Adjust the workflows and scripts as needed to improve reliability and performance