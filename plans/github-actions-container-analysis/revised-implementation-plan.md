# Revised Implementation Plan: Fixing GitHub Actions Container Issues

Based on our investigation of the test results, we've identified several issues that need to be addressed to fix the container crashing issues in GitHub Actions. This revised plan includes the newly discovered container logs directory naming issue and the need to move log files to a logs directory.

## Identified Issues

1. **File Renaming Issue**: In setup/operations.sh, the podman-compose.update.yml file is renamed to podman-compose.update.yml.bak at the end of the update process, but it's needed again later in setup-test-update.sh.

2. **Read-Only Volume Mounts**: The `:ro` flags on volume mounts in podman-compose.test.ci.yml prevent containers from writing to these directories.

3. **CI-Specific Code Paths**: The setup-test-install.sh script contains CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

4. **Container Logs Directory Naming Issue**: There's a problem with command substitution in shell scripts, resulting in malformed directory names like `container-logs-++ date +%Y%m%d-%H%M%S`.

5. **Log Files in Root Directory**: Log files are being created directly in the root directory instead of in a logs subfolder.

## Implementation Steps

### 1. Create logs Directory Structure

#### Action Required
Create a logs directory and subdirectories in the root folder.

#### Specific Changes
```bash
# Create logs directory and subdirectories
mkdir -p logs/container-logs
mkdir -p logs/test
```

### 2. Fix the File Renaming Issue

#### Action Required
Modify the `setup/operations.sh` script to keep a copy of the file instead of renaming it.

#### Specific Changes
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

### 3. Fix the Container Logs Directory Naming Issue and Move to logs Directory

#### Action Required
Modify the `setup/containers.sh` script to use a more robust approach for command substitution and move logs to the logs directory.

#### Specific Changes
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

### 4. Move Debug Log to logs Directory

#### Action Required
Modify the `setup.sh` script to move the debug log to the logs directory.

#### Specific Changes
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

### 5. Move Temporary Log File to logs Directory

#### Action Required
Modify the `test/setup/setup-test-install.sh` script to move the temporary log file to the logs directory.

#### Specific Changes
```diff
# Create a temporary log file for cleanup output
- TEMP_LOG_FILE="setup-cleanup-output.log"
+ # Create logs directory if it doesn't exist
+ mkdir -p "logs/test"
+ TEMP_LOG_FILE="logs/test/setup-cleanup-output.log"
./setup.sh --uninstall --non-interactive > "$TEMP_LOG_FILE" 2>&1
```

### 6. Update .gitignore

#### Action Required
Update the `.gitignore` file to ignore the logs directory.

#### Specific Changes
```diff
- test-logs-*
- container-logs-*
+ logs/
```

### 7. Remove Read-Only Flags from Volume Mounts

#### Action Required
Edit the `build/config/podman-compose.test.ci.yml` file to remove the `:ro` flags from volume mounts.

#### Specific Changes

```diff
volumes:
-  - ./client/dist:/app/public:ro
-  - ./client/static-server.js:/app/static-server.js:ro
+  - ./client/dist:/app/public
+  - ./client/static-server.js:/app/static-server.js
```

### 8. Remove CI-Specific Code Paths

#### Action Required
Modify the `test/setup/setup-test-install.sh` script to remove CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

#### Specific Changes

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

### 9. Enhance Restoration Logic in setup-test-update.sh

#### Action Required
Add better error handling and logging to the restoration logic in `test/setup/setup-test-update.sh`.

#### Specific Changes

```diff
# First, check if we have the update compose file
if [ -f "build/config/podman-compose.update.yml.bak" ]; then
  log_info "Found backup compose file, restoring it..."
  cp "build/config/podman-compose.update.yml.bak" "build/config/podman-compose.update.yml"
+ log_info "Verified restored file exists: $(ls -la build/config/podman-compose.update.yml || echo 'File not found after restore')"
fi
```

### 10. Add Debugging Information to GitHub Actions Workflow

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
    
    echo "Checking for podman-compose.update.yml and its backup..."
    find . -name "podman-compose.update.yml*" || echo "No podman-compose.update.yml files found"
    
    echo "Checking file permissions..."
    ls -la build/config/podman-compose* || echo "No podman-compose files found"
    
    echo "Checking for log directories..."
    find logs -type d || echo "No logs directory found"
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

1. The podman-compose.update.yml file to remain available when needed
2. Containers to have write access to mounted directories
3. No CI-specific code paths that create different behavior between environments
4. Properly formatted container log directory names
5. All log files organized under the logs directory
6. Better debugging information to help diagnose any remaining issues

These changes should ensure consistent behavior between local development and CI environments, resolving the container crashing issues in GitHub Actions.