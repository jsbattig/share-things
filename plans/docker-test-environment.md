# Docker Test Environment for ShareThings

This document outlines how to set up a Docker-based test environment for the ShareThings application, specifically designed for continuous integration (CI) and local testing.

## Table of Contents

1. [Overview](#overview)
2. [Test Environment Configuration](#test-environment-configuration)
3. [Docker Compose Test Configuration](#docker-compose-test-configuration)
4. [Running Tests in Docker](#running-tests-in-docker)
5. [CI Integration](#ci-integration)

## Overview

The ShareThings test environment uses Docker to create isolated, reproducible test environments for:

1. **Unit Tests**: Testing individual components in isolation
2. **Functional Tests**: Testing API endpoints and services

Using Docker for testing ensures consistent test environments across different development machines and CI systems.

## Test Environment Configuration

### Environment Variables

The test environment uses specific environment variables to configure the application for testing:

#### Client Test Environment (.env)

```
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_LOGGING=true
VITE_MAX_FILE_SIZE=104857600
VITE_DEFAULT_CHUNK_SIZE=65536
```

#### Server Test Environment (.env)

```
PORT=3001
NODE_ENV=test
CORS_ORIGIN=http://localhost:8080
SESSION_TIMEOUT=600000
SESSION_EXPIRY=86400000
LOG_LEVEL=debug
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

### Test-Specific Configuration

For testing, we make several adjustments to the standard configuration:

1. Set `NODE_ENV=test` to enable test mode
2. Enable detailed logging with `LOG_LEVEL=debug`
3. Disable analytics with `VITE_ENABLE_ANALYTICS=false`
4. Enable client-side logging with `VITE_ENABLE_LOGGING=true`

## Docker Compose Test Configuration

Create a `docker-compose.test.yml` file that extends the base configuration for testing:

```yaml
# Test configuration for ShareThings Docker Compose

services:
  backend:
    environment:
      - NODE_ENV=test
    ports:
      - "${BACKEND_PORT:-3001}:3001"
    command: npm run test
    volumes:
      - ./server:/app
      - /app/node_modules

  frontend:
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    command: npm run test
    volumes:
      - ./client:/app
      - /app/node_modules
```


## Running Tests in Docker

### Unit Tests

To run unit tests for the server:

```bash
docker-compose run --rm backend npm test
```

To run unit tests for the client:

```bash
docker-compose run --rm frontend npm test
```

### Functional Tests

To run functional tests:

```bash
docker-compose run --rm backend npm run test:e2e
```


### Running All Tests

The `build-and-test.sh` script automates running all tests:

```bash
./build-and-test.sh
```

## CI Integration

### GitHub Actions Configuration

To use this Docker test environment in GitHub Actions:

```yaml
name: Dockered Build and Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  integration:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Build and run tests
      run: |
        chmod +x build-and-test.sh
        ./build-and-test.sh
    
    - name: Upload test results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: test-results
        path: test-results/
```

### Test Results

Test results are stored in the `test-results` directory, which is mounted as a volume in the Docker containers. This allows the CI system to access the test results even if the tests fail.

Test results are stored in the `test-results` directory, which is mounted as a volume in the Docker containers. This allows the CI system to access the test results even if the tests fail.

### Optimizing for CI

To optimize the Docker test environment for CI:

1. **Use BuildKit caching**:
   ```yaml
   - name: Set up Docker Buildx
     uses: docker/setup-buildx-action@v2
   ```

2. **Cache Docker layers**:
   ```yaml
   - name: Cache Docker layers
     uses: actions/cache@v3
     with:
       path: /tmp/.buildx-cache
       key: ${{ runner.os }}-buildx-${{ github.sha }}
       restore-keys: |
         ${{ runner.os }}-buildx-
   ```

3. **Run tests in parallel** when possible:
   ```yaml
   strategy:
     matrix:
       test-type: [unit, functional, e2e]
   ```

4. **Set timeouts** to prevent hanging tests:
   ```yaml
   timeout-minutes: 10
   ```

By following these guidelines, you can create a robust Docker-based test environment that works consistently across development machines and CI systems.