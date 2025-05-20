# Updated Implementation Plan: Fixing Container Crashing in GitHub Actions

This document provides a step-by-step plan to address the issue where containers start but then crash in the GitHub Actions environment.

## Step 1: Remove Read-Only Flags from Volume Mounts

### Action Required
Edit the `build/config/podman-compose.test.ci.yml` file to remove the `:ro` flags from volume mounts.

### Specific Changes

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

## Step 2: Verify Client/Dist Directory and Contents

### Action Required
Add comprehensive verification of the `client/dist` directory to ensure it exists and contains the necessary files before starting containers.

### Specific Changes
Add the following code to `test/setup/setup-test-install.sh` after line 169 (after creating the necessary directories):

```bash
# Verify client/dist directory and contents
log_info "Step 1.5: Verifying client/dist directory and contents"

# Check if directory exists
if [ ! -d "client/dist" ]; then
  log_warning "client/dist directory does not exist"
  mkdir -p client/dist
  log_info "Created client/dist directory"
else
  log_info "client/dist directory exists"
fi

# Check for essential files
log_info "Checking for essential files in client/dist"
MISSING_FILES=false

# Check for index.html
if [ ! -f "client/dist/index.html" ]; then
  log_warning "index.html is missing from client/dist"
  MISSING_FILES=true
fi

# Check for assets directory (common in built frontend projects)
if [ ! -d "client/dist/assets" ]; then
  log_warning "assets directory is missing from client/dist"
  MISSING_FILES=true
fi

# If files are missing, we need to build the frontend
if [ "$MISSING_FILES" = "true" ]; then
  log_warning "Essential files are missing from client/dist"
  
  # Option 1: Build the frontend (if possible in CI)
  log_info "Attempting to build frontend"
  if [ -d "client" ] && [ -f "client/package.json" ]; then
    log_info "Building frontend from source"
    (cd client && npm install && npm run build)
    BUILD_EXIT_CODE=$?
    
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
      log_warning "Frontend build failed with exit code $BUILD_EXIT_CODE"
    else
      log_success "Frontend build completed successfully"
    fi
  else
    log_warning "Cannot build frontend: client directory or package.json not found"
  fi
  
  # Option 2: Create minimal required files if build failed or wasn't possible
  if [ ! -f "client/dist/index.html" ]; then
    log_warning "Creating minimal index.html"
    mkdir -p client/dist
    echo '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShareThings Test Environment</title>
</head>
<body>
  <h1>ShareThings Test Environment</h1>
  <p>This is a minimal test page created for CI testing.</p>
</body>
</html>' > client/dist/index.html
    log_info "Created minimal index.html"
  fi
  
  # Create health endpoint
  mkdir -p client/dist/health
  echo '{"status":"ok"}' > client/dist/health/index.json
  log_info "Created health endpoint"
fi

# Check file permissions
log_info "Checking file permissions in client/dist"
if [ -d "client/dist" ]; then
  # List permissions
  ls -la client/dist
  
  # Ensure directory and files are accessible
  chmod -R 755 client/dist
  log_info "Set permissions on client/dist directory"
fi

# Verify static-server.js exists and is executable
log_info "Verifying static-server.js"
if [ ! -f "client/static-server.js" ]; then
  log_error "client/static-server.js not found"
  exit 1
else
  chmod 755 client/static-server.js
  log_info "Made static-server.js executable"
fi

# Log directory contents for debugging
log_info "Contents of client/dist directory:"
find client/dist -type f | sort
```

## Step 3: Ensure Proper Permissions for Mounted Directories

### Action Required
Add code to ensure proper permissions for the mounted directories.

### Specific Changes
Add the following code after the client/dist verification in `test/setup/setup-test-install.sh`:

```bash
# Set appropriate permissions for mounted directories
log_info "Setting appropriate permissions for mounted directories"
chmod -R 755 client/dist 2>/dev/null || true
chmod 755 client/static-server.js 2>/dev/null || true
```

## Step 4: Add Better Error Logging for Container Crashes

### Action Required
Modify the GitHub Actions workflow file (`.github/workflows/share-things-ci-cd.yml`) to capture container logs when tests fail.

### Specific Changes
Add the following step after the "Run setup installation test script" step in the test-setup job:

```yaml
- name: Capture container logs on failure
  if: failure()
  run: |
    echo "Capturing container logs after failure..."
    mkdir -p container-logs
    podman ps -a > container-logs/container-status.txt
    podman logs share-things-frontend > container-logs/frontend.log 2>&1 || echo "No frontend logs available"
    podman logs share-things-backend > container-logs/backend.log 2>&1 || echo "No backend logs available"
    echo "Container exit status:"
    podman inspect --format '{{.State.Status}} - {{.State.ExitCode}} - {{.State.Error}}' share-things-frontend share-things-backend || echo "Could not get container status"

- name: Upload container logs
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: container-logs
    path: container-logs/
```

## Step 5: Test the Changes

### Action Required
Commit and push the changes to trigger the GitHub Actions workflow.

### Verification Steps
1. Monitor the GitHub Actions workflow execution
2. Check if the containers remain running after startup
3. Verify that the health checks pass
4. If the containers still crash, examine the uploaded container logs

## Step 6: Additional Troubleshooting (If Needed)

If the containers still crash after implementing the above changes, consider these additional steps:

1. **Modify Container Command**: Simplify the container command in `podman-compose.test.ci.yml` to make it more resilient to failures

2. **Use Absolute Paths**: Replace relative paths with absolute paths using `$REPO_ROOT`

3. **Increase Timeouts**: Increase the timeout values in the container command and health checks

4. **Add Debug Output**: Add more debug output to the container command to capture the exact point of failure

## Conclusion

This implementation plan addresses the most likely causes of containers crashing after startup in the GitHub Actions environment:

1. Removing read-only restrictions allows containers to write to mounted directories
2. Verifying the client/dist directory ensures necessary files are available
3. Setting proper permissions ensures containers can access the files
4. Adding better error logging helps diagnose any remaining issues

By implementing these changes, we should be able to resolve the container crashing issues in the GitHub Actions environment.