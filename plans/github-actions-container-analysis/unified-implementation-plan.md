# Unified Implementation Plan: Removing CI-Specific Code Paths

This document provides a step-by-step plan to remove CI-specific code paths and ensure setup.sh behaves the same way in all environments.

## Step 1: Remove CI-Specific Directory Creation

### Action Required
Modify the `test/setup/setup-test-install.sh` script to remove the code that creates empty directories and a minimal health check endpoint in CI mode.

### Specific Changes
Comment out or remove the following code around line 167-173:

```bash
# REMOVE THESE LINES
mkdir -p client/dist
mkdir -p server/dist
  
# Create health check endpoint for frontend
log_info "Creating health check endpoint for frontend"
mkdir -p client/dist/health
echo '{"status":"ok"}' > client/dist/health/index.json
```

Leave only the necessary environment variables and permission settings:

```bash
# Set environment variables for CI if needed
if [ "$CI" = "true" ]; then
  # Set environment variables for CI
  export PODMAN_USERNS=keep-id
  log_info "Set PODMAN_USERNS=keep-id for CI environment"
  
  # Create necessary directories with proper permissions
  log_info "Creating necessary directories if they don't exist"
  mkdir -p build/config
  mkdir -p data
  
  # Set appropriate permissions
  log_info "Setting appropriate permissions"
  chmod -R 755 build
  chmod -R 777 data 2>/dev/null || true
fi
```

## Step 2: Remove CI-Specific Configuration

### Action Required
Remove the code that copies the CI-specific podman-compose file in `test/setup/setup-test-install.sh`.

### Specific Changes
Comment out or remove the following code around line 183-195:

```bash
# REMOVE THESE LINES
# Copy the CI-specific podman-compose file if it exists
if [ -f "$REPO_ROOT/build/config/podman-compose.test.ci.yml" ]; then
  log_info "Using CI-specific podman-compose configuration"
  cp "$REPO_ROOT/build/config/podman-compose.test.ci.yml" "$REPO_ROOT/build/config/podman-compose.yml"
  # Make sure the file is copied successfully
  if [ -f "$REPO_ROOT/build/config/podman-compose.yml" ]; then
    log_info "CI-specific podman-compose configuration copied successfully"
    log_info "Contents of podman-compose.yml:"
    cat "$REPO_ROOT/build/config/podman-compose.yml"
  else
    log_error "Failed to copy CI-specific podman-compose configuration"
    exit 1
  fi
fi
```

## Step 3: Remove Read-Only Flags from Volume Mounts

### Action Required
Edit the standard podman-compose file to remove the `:ro` flags from volume mounts.

### Specific Changes
Identify which podman-compose file is being used in development (likely `build/config/podman-compose.yml`) and modify it:

From:
```yaml
volumes:
  - ./client/dist:/app/public:ro
  - ./client/static-server.js:/app/static-server.js:ro
```

To:
```yaml
volumes:
  - ./client/dist:/app/public
  - ./client/static-server.js:/app/static-server.js
```

## Step 4: Add Better Error Logging for Debugging

### Action Required
Add better error logging to help diagnose any remaining issues.

### Specific Changes
Add the following step to the GitHub Actions workflow file (`.github/workflows/share-things-ci-cd.yml`) after the "Run setup installation test script" step:

```yaml
- name: Capture logs on failure
  if: failure()
  run: |
    echo "Capturing logs after failure..."
    mkdir -p debug-logs
    
    # Capture setup.sh logs
    if [ -f "setup-debug.log" ]; then
      cp setup-debug.log debug-logs/
    fi
    
    # Capture container status
    echo "Container status:" > debug-logs/container-status.txt
    podman ps -a >> debug-logs/container-status.txt
    
    # Capture container logs
    for container in $(podman ps -a --format "{{.Names}}"); do
      echo "Capturing logs for $container"
      podman logs $container > debug-logs/$container.log 2>&1 || echo "Failed to capture logs for $container"
    done
    
    # Capture directory structure
    echo "Directory structure:" > debug-logs/directory-structure.txt
    find . -type d -not -path "*/node_modules/*" -not -path "*/\.*" | sort >> debug-logs/directory-structure.txt
    
    # Capture build/config contents
    echo "build/config contents:" > debug-logs/build-config-contents.txt
    ls -la build/config/ >> debug-logs/build-config-contents.txt
    
    # Capture client/dist contents if it exists
    if [ -d "client/dist" ]; then
      echo "client/dist contents:" > debug-logs/client-dist-contents.txt
      find client/dist -type f | sort >> debug-logs/client-dist-contents.txt
    fi

- name: Upload debug logs
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: debug-logs
    path: debug-logs/
```

## Step 5: Test the Changes

### Action Required
Commit and push the changes to trigger the GitHub Actions workflow.

### Verification Steps
1. Monitor the GitHub Actions workflow execution
2. Check if setup.sh creates the necessary directories and builds the frontend
3. Verify that the containers remain running after startup
4. Confirm that the health checks pass

## Expected Outcome

By removing all CI-specific code paths, setup.sh will behave the same way in all environments:

1. It will create directories and build the frontend as part of the normal build process
2. It will use the same configuration in all environments
3. Containers will have access to the necessary files and be able to write to mounted directories if needed

This unified approach ensures consistent behavior between CI and development environments, making it easier to diagnose and fix issues.

## Fallback Plan

If issues persist after implementing these changes, consider:

1. **Examining Debug Logs**: Use the captured logs to identify any remaining issues
2. **Checking for Other Environment Differences**: Look for other differences between CI and development environments
3. **Addressing Security Limitations**: If there are security limitations in the CI environment, address them without creating separate code paths

Remember, the goal is to have setup.sh behave exactly the same way in all environments, with no special treatment for CI mode.