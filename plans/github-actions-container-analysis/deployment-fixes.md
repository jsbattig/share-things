# GitHub Actions Production Deployment Fixes

## Issues Identified

We identified and fixed two critical issues with the GitHub Actions production deployment:

1. **Git Pull Failures**: Local changes on the production server were preventing the git pull from working correctly, which meant our networking standardization changes weren't being applied.

2. **Missing Configuration Directory**: The `build/config/` directory was missing on the production server, causing the deployment to fail when trying to access compose files.

3. **Container Log Command Errors**: The container log fetching commands had the `--tail` parameter in the wrong position, causing errors.

## Solutions Implemented

### 1. Git Pull Fix

We modified the `pull_latest_code` function in `setup/config.sh` to automatically reset local changes before pulling:

```bash
pull_latest_code() {
    if [ -d .git ]; then
        log_info "Pulling latest code from git repository..."
        
        # Check for local changes
        if git status --porcelain | grep -q .; then
            log_warning "Local changes detected. Resetting to match remote..."
            git fetch origin
            git reset --hard origin/master  # Adjust branch name if needed
            RESET_EXIT_CODE=$?
            
            if [ $RESET_EXIT_CODE -ne 0 ]; then
                log_error "Failed to reset local changes. Manual intervention required."
                log_warning "Continuing with update anyway in autonomous mode..."
            else
                log_info "Local repository reset to match remote."
            fi
        fi
        
        # Pull latest code
        git pull
        GIT_EXIT_CODE=$?
        
        if [ $GIT_EXIT_CODE -ne 0 ]; then
            log_error "Failed to pull latest code even after reset. Manual intervention required."
            log_warning "Continuing with update anyway in autonomous mode..."
        else
            log_success "Latest code pulled successfully."
        fi
    else
        log_warning "Not a git repository. Skipping code update."
        log_warning "Continuing with container rebuild in autonomous mode..."
    fi
}
```

This ensures that any local changes on the production server are reset before pulling the latest code, allowing our networking standardization changes to be applied.

### 2. Configuration Directory Fix

We modified the GitHub Actions workflow to ensure the `build/config/` directory exists and contains the necessary compose files:

```yaml
# Ensure build/config directory exists
echo "Ensuring build/config directory exists on production server..."
sshpass -p "${{ secrets.GHRUserPassword }}" ssh -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd ~/share-things && mkdir -p build/config"

# Create a local compose file
echo "Creating local compose file..."
cat > podman-compose-host.yml << EOF
# Standard configuration for ShareThings with host networking
version: '3'
services:
  frontend:
    image: localhost/share-things_frontend:latest
    network_mode: "host"  # Use host networking instead of bridge
    restart: always
    environment:
      - PORT=15000
      - STATIC_DIR=/app/public
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:15000/health"]
      interval: 5s
      timeout: 3s
      retries: 3
  
  backend:
    image: localhost/share-things_backend:latest
    network_mode: "host"  # Use host networking instead of bridge
    environment:
      - PORT=15001
    restart: always
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:15001/health"]
      interval: 5s
      timeout: 3s
      retries: 3
EOF

# Copy the compose file to the production server
echo "Copying compose file to production server..."
sshpass -p "${{ secrets.GHRUserPassword }}" scp -o StrictHostKeyChecking=no podman-compose-host.yml ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }}:~/share-things/build/config/podman-compose.yml
```

This ensures that the `build/config/` directory exists and contains a valid `podman-compose.yml` file with our host networking configuration.

### 3. Container Log Command Fix

We fixed the container log fetching commands in the GitHub Actions workflow:

```yaml
# Get container logs
echo "Fetching container logs..."
sshpass -p "${{ secrets.GHRUserPassword }}" ssh -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd ~/share-things && podman logs --tail 50 share-things-frontend" | tee -a deployment-logs/deploy-$(date +%Y%m%d-%H%M%S)-frontend.log
sshpass -p "${{ secrets.GHRUserPassword }}" ssh -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd ~/share-things && podman logs --tail 50 share-things-backend" | tee -a deployment-logs/deploy-$(date +%Y%m%d-%H%M%S)-backend.log
```

The `--tail` parameter now comes before the container name, which is the correct syntax for the `podman logs` command.

## Benefits

1. **Reliable Deployments**: The deployment process now handles local changes on the production server automatically.
2. **Consistent Configuration**: The `build/config/` directory is created and populated with the necessary compose files.
3. **Proper Logging**: Container logs are now correctly fetched and included in the deployment logs.
4. **Host Networking**: All environments now use host networking consistently, which resolves the networking issues in GitHub Actions.

## Testing

These changes should be tested by running the GitHub Actions workflow again and verifying that:

1. The git pull succeeds
2. The `build/config/` directory is created and contains the necessary compose files
3. The containers are started with host networking
4. The container logs are correctly fetched

## Future Improvements

1. **Add More Robust Error Handling**: Enhance the GitHub Actions workflow to better handle and report errors.
2. **Implement Backup and Restore**: Add a mechanism to backup and restore critical configuration files.
3. **Add Validation Steps**: Verify that required directories and files exist before proceeding with the update.
4. **Improve Logging**: Add more detailed logging to help diagnose issues.