# Setup Update Fix for Production Deployment

## Problem

The production deployment was failing to properly update the application because:

1. The existing `perform_update` function in `setup/operations.sh` didn't properly handle rebuilding containers
2. The containers weren't being rebuilt with the latest code and were using cached versions instead
3. Existing images weren't being removed before rebuilding
4. The GitHub Actions workflow wasn't using the right parameters for the setup.sh script

## Solution

I've modified the existing scripts to ensure proper rebuilding of containers without using cached code:

### 1. Updated `perform_update` in `setup/operations.sh`

The `perform_update` function has been enhanced to:

1. Remove existing images before rebuilding:
```bash
# Remove existing images to ensure a clean build
log_info "Removing existing images to ensure a clean build..."
podman rmi localhost/share-things_frontend:latest localhost/share-things_backend:latest 2>/dev/null || log_warning "No existing images to remove or removal failed"
```

2. Fail the update if the build fails (instead of continuing with existing images):
```bash
if [ $BUILD_EXIT_CODE -ne 0 ]; then
    log_error "Container build failed with exit code $BUILD_EXIT_CODE"
    echo "Build logs:"
    podman logs podman-build 2>&1 || echo "No build logs available"
    # This is a critical error - we need to build new images
    log_error "Cannot continue with update. Please fix the build errors and try again."
    exit 1
else
    log_success "Container build completed successfully"
fi
```

3. Stop and remove existing containers before starting new ones:
```bash
# Stop and remove existing containers first to ensure a clean start
log_info "Stopping and removing existing containers..."
podman stop share-things-frontend share-things-backend 2>/dev/null || log_warning "No containers to stop or stop failed"
podman rm share-things-frontend share-things-backend 2>/dev/null || log_warning "No containers to remove or removal failed"
```

4. Fail the update if container startup fails:
```bash
if [ $UP_EXIT_CODE -ne 0 ]; then
    log_error "Container startup failed with exit code $UP_EXIT_CODE"
    echo "Container logs:"
    podman logs share-things-frontend 2>&1 || echo "No frontend logs available"
    podman logs share-things-backend 2>&1 || echo "No backend logs available"
    # This is a critical error
    log_error "Container startup failed. Please check the logs and try again."
    exit 1
else
    log_success "Containers started successfully"
fi
```

### 2. Updated GitHub Actions Workflow

The GitHub Actions workflow has been updated to use the existing setup.sh script with the right parameters:

```yaml
# Run the setup script with update mode, non-interactive, and debug flags
echo "Running setup.sh with update mode for production deployment..."
sshpass -p "${{ secrets.GHRUserPassword }}" ssh -v -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd ~/share-things && bash -x ./setup.sh --update --non-interactive --debug 2>&1" | tee deployment-logs/deploy-$(date +%Y%m%d-%H%M%S).log
```

The key changes are:
1. Using the existing setup.sh script with the appropriate flags
2. Adding the `--non-interactive` flag to run in non-interactive mode
3. Adding the `--debug` flag to enable verbose logging
4. Capturing detailed logs for debugging

Note that the setup.sh script is designed to always force a rebuild, ensure the latest code is built and packaged in a container, with zero reuse of existing or cached containers. This is its default behavior.

## Benefits

1. **Leverages Existing Scripts**: Uses the existing setup.sh script family instead of creating new scripts
2. **Guaranteed Fresh Builds**: By removing existing images and using `--no-cache`, we ensure that each deployment uses the latest code
3. **Improved Error Handling**: The script now fails fast if critical steps fail, making it easier to identify and fix issues
4. **Consistent Deployments**: The deployment process is now consistent and reliable

## Testing

This change should be tested by:

1. Making a small change to the application code
2. Pushing the change to the master branch
3. Verifying that the GitHub Actions workflow successfully deploys the change
4. Checking that the application is running with the updated code

## Future Improvements

1. **Add Rollback Capability**: Implement a mechanism to roll back to the previous version if the deployment fails
2. **Add Health Checks**: Add health checks to verify that the application is running correctly after deployment
3. **Improve Logging**: Add more detailed logging to help diagnose issues
4. **Add Deployment Notifications**: Send notifications when deployments succeed or fail