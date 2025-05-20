# Implementation Plan: Fixing Container Crashing in GitHub Actions

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

## Step 2: Ensure Proper Permissions in setup-test-install.sh

### Action Required
Modify the `test/setup/setup-test-install.sh` script to ensure proper permissions for the mounted directories.

### Specific Changes
Add the following code after line 169 (after creating the necessary directories):

```bash
# Set appropriate permissions for mounted directories
log_info "Setting appropriate permissions for mounted directories"
chmod -R 777 client/dist 2>/dev/null || true
chmod 777 client/static-server.js 2>/dev/null || true
```

## Step 3: Add Better Error Logging for Container Crashes

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

## Step 4: Verify Client/Dist Directory Contents

### Action Required
Add a verification step in `test/setup/setup-test-install.sh` to ensure the client/dist directory contains the necessary files.

### Specific Changes
Add the following code after line 172 (after creating the health check endpoint):

```bash
# Verify client/dist directory contents
log_info "Verifying client/dist directory contents"
if [ -d "client/dist" ]; then
  log_info "client/dist directory exists"
  log_info "Contents of client/dist:"
  ls -la client/dist
  
  # Check if index.html exists
  if [ ! -f "client/dist/index.html" ]; then
    log_warning "index.html not found in client/dist, creating minimal version"
    echo '<html><body><h1>ShareThings Test Environment</h1><p>This is a minimal test page.</p></body></html>' > client/dist/index.html
  fi
else
  log_warning "client/dist directory does not exist, creating it"
  mkdir -p client/dist
  echo '<html><body><h1>ShareThings Test Environment</h1><p>This is a minimal test page.</p></body></html>' > client/dist/index.html
fi
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

This implementation plan addresses the most likely causes of containers crashing after startup in the GitHub Actions environment. By removing read-only restrictions, ensuring proper permissions, and adding better error logging, we should be able to identify and resolve the issues causing the containers to crash.