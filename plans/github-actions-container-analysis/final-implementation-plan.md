# Final Implementation Plan: Fixing GitHub Actions Container Issues

Based on the test results and analysis, this plan outlines specific steps to address the container crashing issues in GitHub Actions.

## Identified Issues

1. **Missing podman-compose.update.yml File**: During the update process, the script tries to use a file that doesn't exist, falling back to direct podman commands.

2. **Read-Only Volume Mounts**: The `:ro` flags on volume mounts in podman-compose.test.ci.yml prevent containers from writing to these directories.

3. **CI-Specific Code Paths**: The setup-test-install.sh script contains CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

## Implementation Steps

### 1. Fix the Missing podman-compose.update.yml File

#### Action Required
Modify the `setup/operations.sh` script to ensure the `podman-compose.update.yml` file is properly created and accessible.

#### Specific Changes
In `setup/operations.sh`, around line 237, modify the code that creates the update compose file:

```bash
# Create the directory if it doesn't exist
mkdir -p "./build/config"

# Create the update compose file with absolute paths
COMPOSE_UPDATE_PATH="$REPO_ROOT/build/config/podman-compose.update.yml"

# Create the update compose file
cat > "$COMPOSE_UPDATE_PATH" << EOF
# Update configuration for ShareThings Podman Compose
version: '3'

services:
  backend:
    build:
      context: $REPO_ROOT/server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=development
      - PORT=${API_PORT}
    ports:
      - "${BACKEND_PORT}:${API_PORT}"
    restart: always
    networks:
      app_network:
        aliases:
          - backend

  frontend:
    build:
      context: $REPO_ROOT/client
      dockerfile: Dockerfile
      args:
        - API_URL=${PROTOCOL}://${HOSTNAME}
        - SOCKET_URL=${PROTOCOL}://${HOSTNAME}
        - API_PORT=${API_PORT}
        - VITE_API_PORT=${API_PORT}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT}
    ports:
      - "${FRONTEND_PORT}:15000"
    restart: always
    depends_on:
      - backend
    networks:
      app_network:
        aliases:
          - frontend

networks:
  app_network:
    driver: bridge
EOF
```

### 2. Remove Read-Only Flags from Volume Mounts

#### Action Required
Edit the `build/config/podman-compose.test.ci.yml` file to remove the `:ro` flags from volume mounts.

#### Specific Changes
Modify the volume mounts in `build/config/podman-compose.test.ci.yml`:

```yaml
volumes:
  - ./client/dist:/app/public
  - ./client/static-server.js:/app/static-server.js
```

### 3. Remove CI-Specific Code Paths

#### Action Required
Modify the `test/setup/setup-test-install.sh` script to remove CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

#### Specific Changes
Comment out or remove the following code around line 167-195:

```bash
# REMOVE THESE LINES
mkdir -p client/dist
mkdir -p server/dist
  
# Create health check endpoint for frontend
log_info "Creating health check endpoint for frontend"
mkdir -p client/dist/health
echo '{"status":"ok"}' > client/dist/health/index.json

# Copy the CI-specific podman-compose file if it exists
if [ -f "$REPO_ROOT/build/config/podman-compose.test.ci.yml" ]; then
  log_info "Using CI-specific podman-compose configuration"
  cp "$REPO_ROOT/build/config/podman-compose.test.ci.yml" "$REPO_ROOT/build/config/podman-compose.yml"
  # ...
fi
```

### 4. Add Better Error Handling for Missing Files

#### Action Required
Add better error handling in the update process to handle missing files and provide more detailed error messages.

#### Specific Changes
Add the following code to `setup/operations.sh` around line 325 (after trying to use podman-compose):

```bash
# Check if the compose file exists
if [ ! -f "$COMPOSE_UPDATE_PATH" ]; then
  log_warning "Compose file not found at $COMPOSE_UPDATE_PATH"
  log_info "Creating compose file at $COMPOSE_UPDATE_PATH"
  
  # Create the directory if it doesn't exist
  mkdir -p "$(dirname "$COMPOSE_UPDATE_PATH")"
  
  # Create the compose file (same content as above)
  cat > "$COMPOSE_UPDATE_PATH" << EOF
# Update configuration for ShareThings Podman Compose
version: '3'

services:
  backend:
    build:
      context: $REPO_ROOT/server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=development
      - PORT=${API_PORT}
    ports:
      - "${BACKEND_PORT}:${API_PORT}"
    restart: always
    networks:
      app_network:
        aliases:
          - backend

  frontend:
    build:
      context: $REPO_ROOT/client
      dockerfile: Dockerfile
      args:
        - API_URL=${PROTOCOL}://${HOSTNAME}
        - SOCKET_URL=${PROTOCOL}://${HOSTNAME}
        - API_PORT=${API_PORT}
        - VITE_API_PORT=${API_PORT}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT}
    ports:
      - "${FRONTEND_PORT}:15000"
    restart: always
    depends_on:
      - backend
    networks:
      app_network:
        aliases:
          - frontend

networks:
  app_network:
    driver: bridge
EOF
  
  log_success "Created compose file at $COMPOSE_UPDATE_PATH"
fi
```

### 5. Add Debugging Information to GitHub Actions Workflow

#### Action Required
Add more debugging information to the GitHub Actions workflow to help diagnose issues.

#### Specific Changes
Add the following step to the GitHub Actions workflow file (`.github/workflows/share-things-ci-cd.yml`) after the "Run setup installation test script" step:

```yaml
- name: Debug container and file state
  if: always()
  run: |
    echo "Checking container status..."
    podman ps -a
    
    echo "Checking build/config directory contents..."
    ls -la build/config/
    
    echo "Checking client/dist directory contents..."
    ls -la client/dist/ || echo "client/dist directory does not exist"
    
    echo "Checking for podman-compose.update.yml..."
    find . -name "podman-compose.update.yml" || echo "podman-compose.update.yml not found"
    
    echo "Checking for podman-compose.yml..."
    find . -name "podman-compose.yml" || echo "podman-compose.yml not found"
```

## Testing the Changes

After implementing these changes, test them by:

1. Running the test sequence locally:
   ```bash
   ./test/setup/setup-test-install.sh --skip-cleanup
   ./test/setup/setup-test-update.sh
   ```

2. Pushing the changes to trigger the GitHub Actions workflow

3. Monitoring the GitHub Actions workflow execution to see if the containers remain running

## Expected Outcome

By implementing these changes, we expect:

1. The `podman-compose.update.yml` file to be properly created and accessible during the update process
2. Containers to have write access to mounted directories
3. No CI-specific code paths that create different behavior between environments
4. Better error handling and debugging information to help diagnose any remaining issues

These changes should ensure consistent behavior between local development and CI environments, resolving the container crashing issues in GitHub Actions.