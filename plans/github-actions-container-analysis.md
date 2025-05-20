# GitHub Actions Container Crashing Analysis

## Problem Statement

Containers are starting successfully but then crashing in the GitHub Actions environment, while the same containers work correctly in the `build-and-test.sh` script. This issue is specific to the `setup-test-install.sh` script when running in GitHub Actions.

## Key Findings

After analyzing the codebase, we've identified several potential issues that could be causing containers to crash after starting:

### 1. Read-Only Volume Mounts

In `build/config/podman-compose.test.ci.yml`, volume mounts are configured with the `:ro` (read-only) flag:

```yaml
volumes:
  - ./client/dist:/app/public:ro
  - ./client/static-server.js:/app/static-server.js:ro
```

This prevents the container from writing to these directories, which might be necessary for some operations during runtime.

### 2. Working Script vs. Failing Script Differences

The working `build/scripts/build-and-test.sh` script differs from the failing `test/setup/setup-test-install.sh` script in several key ways:

- **Direct Container Creation**: The working script uses direct `podman` commands to build and run containers
- **Simplified Container Config**: Uses minimal container configuration with inline environment variables
- **No Volume Mounts for Code**: Doesn't mount source code as volumes
- **Simple Commands**: Uses simple commands to start containers

### 3. Registry URL Considerations

The registry URL `linner.ddns.net:4443/docker.io.proxy` is intentionally used for caching Docker Hub requests to avoid rate limiting and should be maintained.

### 4. Container Paths

Several hard-coded paths are used inside the containers:
- `/app/public`
- `/app/static-server.js`
- `/app/package.json`

These paths depend on the volume mounts working correctly.

## Primary Recommendation

**Remove the `:ro` (read-only) flags from volume mounts** in the `podman-compose.test.ci.yml` file to allow the container to write to these directories if needed during runtime.

### Current Configuration

```yaml
volumes:
  - ./client/dist:/app/public:ro
  - ./client/static-server.js:/app/static-server.js:ro
```

### Modified Configuration

```yaml
volumes:
  - ./client/dist:/app/public
  - ./client/static-server.js:/app/static-server.js
```

## Additional Recommendations

If removing the read-only flags doesn't resolve the issue, consider these additional approaches:

### 1. Improve Error Logging

Enhance container logging to capture the exact reason for crashes:
- Modify entrypoint scripts to redirect both stdout and stderr to files
- Set more verbose logging levels in the applications
- Add explicit commands to examine container exit codes and reasons

### 2. Address Permission Issues

Ensure proper permissions for mounted volumes:
- Add explicit permission setting in the setup script
- Use the `Z` or `z` volume mount option for SELinux contexts if needed

### 3. Ensure Build Artifacts Exist

Verify that the `client/dist` directory exists and contains the necessary files:
- Add checks in the setup script to verify directory contents
- Ensure the build process completes before starting containers

### 4. Simplify Container Startup

Consider simplifying the container startup process:
- Replace the complex multi-line shell command with a simpler approach
- Move directory and file creation from runtime commands to the setup phase

## Testing the Solution

After implementing the changes:

1. Run the setup-test-install.sh script again
2. Monitor container logs for any errors
3. Check container status to see if they remain running
4. Verify that the health checks pass

## Conclusion

The most likely cause of containers crashing after startup in GitHub Actions is the read-only volume mounts preventing necessary file operations. Removing the `:ro` flags should allow the containers to function properly in the GitHub Actions environment.