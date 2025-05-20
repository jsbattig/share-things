# Specific Code Changes to Fix GitHub Actions Container Issues

This document provides the exact code changes needed to fix the container crashing issues in GitHub Actions, with a focus on the file renaming issue, container logs directory naming issue, and moving log files to the logs directory.

## 1. Fix the File Renaming Issue

### File: setup/operations.sh

```diff
# Clean up any temporary files created during the update
if [ -f build/config/podman-compose.update.yml ]; then
    log_info "Cleaning up temporary files..."
    # Keep the file for reference in case of issues
-   mv build/config/podman-compose.update.yml build/config/podman-compose.update.yml.bak
+   cp build/config/podman-compose.update.yml build/config/podman-compose.update.yml.bak
    log_success "build/config/podman-compose.update.yml saved as build/config/podman-compose.update.yml.bak for reference."
fi
```

## 2. Fix the Container Logs Directory Naming Issue and Move to logs Directory

### File: setup/containers.sh

```diff
if [ "$DEBUG_MODE" = "true" ]; then
-   CONTAINER_LOG_DIR="container-logs-$(date +%Y%m%d-%H%M%S)"
+   # Create logs directory if it doesn't exist
+   mkdir -p "logs/container-logs"
+   # Get the date in a separate step to avoid command substitution issues
+   CURRENT_DATE=$(date +%Y%m%d-%H%M%S)
+   # Add error handling to detect and report when command substitution fails
+   if [[ ! $CURRENT_DATE =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
+       log_warning "Failed to get properly formatted date. Using fallback."
+       CURRENT_DATE="fallback-$(date +%s)"  # Use Unix timestamp as fallback
+   fi
+   # Use the variable to create the directory name under logs/container-logs
+   CONTAINER_LOG_DIR="logs/container-logs/${CURRENT_DATE}"
    mkdir -p "$CONTAINER_LOG_DIR"
    
    echo "Saving container logs to $CONTAINER_LOG_DIR directory..."
    podman logs share-things-frontend > "$CONTAINER_LOG_DIR/frontend.log" 2>&1 || echo "Could not save frontend logs"
    podman logs share-things-backend > "$CONTAINER_LOG_DIR/backend.log" 2>&1 || echo "Could not save backend logs"
    podman ps -a > "$CONTAINER_LOG_DIR/container-list.txt" 2>&1 || echo "Could not save container list"
    podman images > "$CONTAINER_LOG_DIR/images.txt" 2>&1 || echo "Could not save image list"
    
    echo "Container logs saved to $CONTAINER_LOG_DIR directory"
fi
```

## 3. Move Debug Log to logs Directory

### File: setup.sh

```diff
# Create a debug log file with a fixed name to avoid command substitution issues
- DEBUG_LOG_FILE="setup-debug.log"
+ # Create logs directory if it doesn't exist
+ mkdir -p "logs"
+ DEBUG_LOG_FILE="logs/setup-debug.log"
# Remove any existing log file
rm -f "$DEBUG_LOG_FILE"
# Create a new log file with a header
echo "=== Debug Log Started ===" > "$DEBUG_LOG_FILE"
# Redirect output to the log file and console
exec > >(tee -a "$DEBUG_LOG_FILE") 2>&1
```

## 4. Move Temporary Log File to logs Directory

### File: test/setup/setup-test-install.sh

```diff
# Create a temporary log file for cleanup output
- TEMP_LOG_FILE="setup-cleanup-output.log"
+ # Create logs directory if it doesn't exist
+ mkdir -p "logs/test"
+ TEMP_LOG_FILE="logs/test/setup-cleanup-output.log"
./setup.sh --uninstall --non-interactive > "$TEMP_LOG_FILE" 2>&1
```

## 5. Update .gitignore

### File: .gitignore

```diff
- test-logs-*
- container-logs-*
+ logs/
```

## 6. Remove Read-Only Flags from Volume Mounts

### File: build/config/podman-compose.test.ci.yml

```diff
volumes:
-  - ./client/dist:/app/public:ro
-  - ./client/static-server.js:/app/static-server.js:ro
+  - ./client/dist:/app/public
+  - ./client/static-server.js:/app/static-server.js
```

## 7. Remove CI-Specific Code Paths

### File: test/setup/setup-test-install.sh

```diff
# Set environment variables for CI if needed
if [ "$CI" = "true" ]; then
  # Set environment variables for CI
  export PODMAN_USERNS=keep-id
  log_info "Set PODMAN_USERNS=keep-id for CI environment"
  
  # Create necessary directories with proper permissions
  log_info "Creating necessary directories if they don't exist"
  mkdir -p build/config
  mkdir -p data
- mkdir -p client/dist
- mkdir -p server/dist
  
- # Create health check endpoint for frontend
- log_info "Creating health check endpoint for frontend"
- mkdir -p client/dist/health
- echo '{"status":"ok"}' > client/dist/health/index.json
  
  # Set appropriate permissions
  log_info "Setting appropriate permissions"
  chmod -R 755 build
  chmod -R 777 data 2>/dev/null || true
- chmod -R 777 client/dist 2>/dev/null || true
- chmod -R 777 server/dist 2>/dev/null || true
  
- # Copy the CI-specific podman-compose file if it exists
- if [ -f "$REPO_ROOT/build/config/podman-compose.test.ci.yml" ]; then
-   log_info "Using CI-specific podman-compose configuration"
-   cp "$REPO_ROOT/build/config/podman-compose.test.ci.yml" "$REPO_ROOT/build/config/podman-compose.yml"
-   # Make sure the file is copied successfully
-   if [ -f "$REPO_ROOT/build/config/podman-compose.yml" ]; then
-     log_info "CI-specific podman-compose configuration copied successfully"
-     log_info "Contents of podman-compose.yml:"
-     cat "$REPO_ROOT/build/config/podman-compose.yml"
-   else
-     log_error "Failed to copy CI-specific podman-compose configuration"
-     exit 1
-   fi
- fi
fi
```

## 8. Enhance Restoration Logic in setup-test-update.sh

### File: test/setup/setup-test-update.sh

```diff
# First, check if we have the update compose file
if [ -f "build/config/podman-compose.update.yml.bak" ]; then
  log_info "Found backup compose file, restoring it..."
  cp "build/config/podman-compose.update.yml.bak" "build/config/podman-compose.update.yml"
+ log_info "Verified restored file exists: $(ls -la build/config/podman-compose.update.yml || echo 'File not found after restore')"
fi
```

## 9. Add Debugging Information to GitHub Actions Workflow

### File: .github/workflows/share-things-ci-cd.yml

```diff
- name: Run setup installation test script
  run: |
    # Add more debugging information
    echo "Node.js version: $(node --version)"
    echo "NPM version: $(npm --version)"
    echo "Podman version: $(podman --version)"
    echo "Podman Compose version: $(podman-compose --version)"
    echo "Available memory: $(free -m)"
    echo "Available disk space: $(df -h)"
    
    # Use a longer timeout for the full installation test
    timeout 600 ./test/setup/setup-test-install.sh
  timeout-minutes: 15
  env:
    CI: true
    PODMAN_USERNS: keep-id
    
+ - name: Debug container and file state
+   if: always()
+   run: |
+     echo "Checking container status..."
+     podman ps -a
+     
+     echo "Checking build/config directory contents..."
+     ls -la build/config/
+     
+     echo "Checking for podman-compose.update.yml and its backup..."
+     find . -name "podman-compose.update.yml*" || echo "No podman-compose.update.yml files found"
+     
+     echo "Checking file permissions..."
+     ls -la build/config/podman-compose* || echo "No podman-compose files found"
+     
+     echo "Checking for log directories..."
+     find logs -type d || echo "No logs directory found"
```

## Implementation Steps

1. Create the `logs` directory and subdirectories in the root folder
2. Make the changes to `setup/containers.sh` to fix the container logs directory naming issue and move logs to the logs directory
3. Make the changes to `setup.sh` to move the debug log to the logs directory
4. Make the changes to `test/setup/setup-test-install.sh` to move the temporary log file to the logs directory
5. Update the `.gitignore` file to ignore the logs directory
6. Make the changes to `setup/operations.sh` to keep a copy of the file instead of renaming it
7. Make the changes to `build/config/podman-compose.test.ci.yml` to remove the `:ro` flags
8. Make the changes to `test/setup/setup-test-install.sh` to remove CI-specific code paths
9. Make the changes to `test/setup/setup-test-update.sh` to enhance the restoration logic
10. Make the changes to `.github/workflows/share-things-ci-cd.yml` to add debugging information

## Testing

After making these changes, test them by:

1. Running the test sequence locally:
   ```bash
   ./test/setup/setup-test-install.sh --skip-cleanup
   ./test/setup/setup-test-update.sh
   ```

2. Pushing the changes to trigger the GitHub Actions workflow

3. Monitoring the GitHub Actions workflow execution to see if the containers remain running

These changes should ensure consistent behavior between local development and CI environments, resolving the container crashing issues in GitHub Actions.