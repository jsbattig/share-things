# Docker to Podman Migration Cleanup Plan

This document outlines the specific steps to replace Docker with Podman in the ShareThings project. This plan focuses on immediate, actionable tasks to complete the migration.

## 1. Verify Environment

- [x] Confirm Podman is installed and working
- [ ] Confirm Podman Compose is installed and working
- [ ] Ensure Podman machine is running (macOS)

## 2. Script Updates

### 2.1 Update build-and-test.sh

- [ ] Replace Docker command checks with Podman
  ```bash
  # Replace
  if ! command -v docker &> /dev/null; then
      echo -e "${RED}Error: Docker is not installed.${NC}"
      exit 1
  fi
  
  # With
  if ! command -v podman &> /dev/null; then
      echo -e "${RED}Error: Podman is not installed.${NC}"
      exit 1
  fi
  ```

- [ ] Update Docker Compose command detection
  ```bash
  # Replace
  if command -v docker-compose &> /dev/null; then
      DOCKER_COMPOSE_CMD="docker-compose"
  elif docker compose version &> /dev/null; then
      DOCKER_COMPOSE_CMD="docker compose"
  
  # With
  if command -v podman-compose &> /dev/null; then
      DOCKER_COMPOSE_CMD="podman-compose"
  ```

- [ ] Replace Docker daemon check
  ```bash
  # Replace
  if ! docker info &> /dev/null; then
      echo -e "${RED}Error: Docker daemon is not running.${NC}"
      exit 1
  fi
  
  # With
  if ! podman info &> /dev/null; then
      echo -e "${RED}Error: Podman is not running.${NC}"
      exit 1
  fi
  ```

### 2.2 Update build-production.sh

- [ ] Replace Docker command checks with Podman (similar to build-and-test.sh)
- [ ] Update Docker Compose command detection to use Podman Compose
- [ ] Update container health checks for Podman compatibility
  ```bash
  # Replace
  BACKEND_RUNNING=$($DOCKER_COMPOSE_CMD -f docker-compose.prod.temp.yml ps | grep backend | grep -c "Up")
  
  # With
  BACKEND_RUNNING=$($DOCKER_COMPOSE_CMD -f podman-compose.prod.temp.yml ps | grep backend | grep -c "Up")
  ```

### 2.3 Update setup.sh

- [ ] Set Podman as the default container engine
  ```bash
  # Replace
  DEFAULT_ENGINE="docker"
  
  # With
  DEFAULT_ENGINE="podman"
  ```

- [ ] Update container management commands to use Podman

## 3. Docker Compose File Updates

### 3.0 Update Registry References

- [ ] Replace all references to docker.io with linner.ddns.net:4443/docker.io.proxy in Dockerfiles
  ```bash
  # For client/Dockerfile
  $SED_CMD 's|FROM node:18-alpine|FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine|g' client/Dockerfile
  $SED_CMD 's|FROM nginx:alpine|FROM linner.ddns.net:4443/docker.io.proxy/nginx:alpine|g' client/Dockerfile
  
  # For server/Dockerfile
  $SED_CMD 's|FROM node:18-alpine|FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine|g' server/Dockerfile
  ```

- [ ] Update image references in docker-compose files
  ```bash
  # For docker-compose.test.yml
  $SED_CMD 's|image: node:18-alpine|image: linner.ddns.net:4443/docker.io.proxy/node:18-alpine|g' docker-compose.test.yml
  ```

### 3.1 Create podman-compose.yml

- [ ] Copy docker-compose.yml to podman-compose.yml
- [ ] Update volume mount syntax for Podman compatibility
  ```yaml
  # Replace
  volumes:
    - ./server:/app
    - /app/node_modules
  
  # With
  volumes:
    - ./server:/app:Z
    - volume-backend-node-modules:/app/node_modules:Z
  ```
- [ ] Add named volumes section
  ```yaml
  volumes:
    volume-backend-node-modules:
    volume-frontend-node-modules:
  ```

### 3.2 Create podman-compose.test.yml

- [ ] Copy docker-compose.test.yml to podman-compose.test.yml
- [ ] Update volume mount syntax for Podman compatibility
- [ ] Update test-specific configurations for Podman

### 3.3 Create podman-compose.prod.yml

- [ ] Copy docker-compose.prod.yml to podman-compose.prod.yml
- [ ] Update production-specific configurations for Podman

## 4. Testing

### 4.1 Development Environment

- [ ] Test building and running in development mode
  ```bash
  podman-compose -f podman-compose.yml build
  podman-compose -f podman-compose.yml up -d
  ```
- [ ] Verify frontend and backend containers are running
  ```bash
  podman-compose -f podman-compose.yml ps
  ```
- [ ] Test application functionality in browser

### 4.2 Test Environment

- [ ] Test building and running in test mode
  ```bash
  podman-compose -f podman-compose.test.yml build
  podman-compose -f podman-compose.test.yml up -d
  ```
- [ ] Run tests
  ```bash
  podman-compose -f podman-compose.test.yml run --rm backend npm test
  ```

### 4.3 Production Environment

- [ ] Test building and running in production mode
  ```bash
  podman-compose -f podman-compose.yml -f podman-compose.prod.yml build
  podman-compose -f podman-compose.yml -f podman-compose.prod.yml up -d
  ```
- [ ] Verify production containers are running
  ```bash
  podman-compose -f podman-compose.yml -f podman-compose.prod.yml ps
  ```

## 5. Documentation Updates

- [ ] Update README.md with Podman instructions
- [ ] Rename DOCKER.md to CONTAINERS.md and update content
- [ ] Update any other documentation referencing Docker

## 6. Final Steps

- [ ] Remove Docker-specific files (if no longer needed)
- [ ] Create aliases or shell functions for common commands
  ```bash
  # Add to ~/.bashrc or ~/.zshrc
  alias docker='podman'
  alias docker-compose='podman-compose'
  ```
- [ ] Document any Podman-specific issues or workarounds encountered

## 7. Troubleshooting Guide

### 7.1 Volume Mounting Issues

If you encounter volume mounting issues:
- Ensure SELinux contexts are properly set with `:Z` or `:z` suffix
- Use named volumes for persistent data
- Check Podman machine configuration (on macOS)

### 7.2 Network Issues

If containers can't communicate:
- Verify network configuration in podman-compose.yml
- Check that network aliases are properly set
- Ensure hostname resolution is working between containers

### 7.3 Port Binding Issues

If ports aren't binding correctly:
- Check for port conflicts
- Verify port syntax in podman-compose files
- Ensure Podman has permission to bind to low ports (if using ports < 1024)