# CI Build Issue Analysis: Missing Frontend Files

## Root Cause Identified

After careful examination of the setup scripts and CI configuration, I've identified the root cause of the container crashing issue in GitHub Actions:

1. **Missing Frontend Build Files**: The frontend is not being built in CI mode, but the container expects the built files to be present.

2. **Empty Directory Mount**: An empty `client/dist` directory with only a health check endpoint is being mounted as a volume, preventing the container from accessing the built frontend files.

## Detailed Analysis

In the `test/setup/setup-test-install.sh` script, when running in CI mode:

```bash
# Create necessary directories with proper permissions
log_info "Creating necessary directories if they don't exist"
mkdir -p build/config
mkdir -p data
mkdir -p client/dist
mkdir -p server/dist

# Create health check endpoint for frontend
log_info "Creating health check endpoint for frontend"
mkdir -p client/dist/health
echo '{"status":"ok"}' > client/dist/health/index.json
```

This creates an empty `client/dist` directory with just a health check endpoint, but **does not build the frontend**.

Then, the CI-specific `podman-compose.test.ci.yml` file is used:

```yaml
volumes:
  - ./client/dist:/app/public:ro
  - ./client/static-server.js:/app/static-server.js:ro
```

This mounts the empty `client/dist` directory as a volume to `/app/public` with the `:ro` (read-only) flag.

When the container starts, it tries to serve files from `/app/public`, but those files don't exist because the frontend was never built. The container then crashes because it can't find the required files.

## Solution Approach

There are two potential solutions:

### Option 1: Build the Frontend Before Running setup.sh (Recommended)

Add a step to build the frontend before running setup.sh in CI mode:

```bash
# Add after line 180 in test/setup/setup-test-install.sh
if [ "$CI" = "true" ]; then
  log_info "Building frontend for CI environment"
  if [ -d "client" ] && [ -f "client/package.json" ]; then
    (cd client && npm install && npm run build)
    BUILD_EXIT_CODE=$?
    
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
      log_warning "Frontend build failed with exit code $BUILD_EXIT_CODE"
    else
      log_success "Frontend build completed successfully"
      log_info "Contents of client/dist directory:"
      find client/dist -type f | sort
    fi
  else
    log_warning "Cannot build frontend: client directory or package.json not found"
  fi
fi
```

### Option 2: Remove the Volume Mount and Let the Container Build the Frontend

Modify the `podman-compose.test.ci.yml` file to remove the volume mount for `client/dist`:

```yaml
# Remove this line
- ./client/dist:/app/public:ro
```

And modify the container command to build the frontend at startup.

## Recommendation

**Option 1 is recommended** because:

1. It follows the normal build process
2. It ensures the frontend is built before the container starts
3. It doesn't require modifying the container command
4. It's more consistent with how the application would be deployed in production

Additionally, removing the `:ro` flag from the volume mounts is still recommended to allow the container to write to these directories if needed during runtime.

## Implementation Steps

1. Modify `test/setup/setup-test-install.sh` to build the frontend before running setup.sh in CI mode
2. Remove the `:ro` flags from volume mounts in `podman-compose.test.ci.yml`
3. Test the changes by triggering the GitHub Actions workflow

This approach addresses the root cause of the container crashing issue while maintaining the integrity of the build process.