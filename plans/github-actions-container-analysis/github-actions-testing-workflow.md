# GitHub Actions Testing Workflow

This document outlines how to implement the installation and update testing sequence in the GitHub Actions workflow.

## Workflow Modification

To test the full sequence of installation followed by an update in GitHub Actions, we need to modify the workflow file (`.github/workflows/share-things-ci-cd.yml`) to run both scripts in sequence.

### Current Workflow Structure

Currently, the workflow has a `test-setup` job that runs the `setup-test-install.sh` script:

```yaml
test-setup:
  name: Test Setup Script
  needs: [build]
  runs-on: [self-hosted, Rocky Linux]
  
  steps:
  # ... existing steps ...
  
  - name: Run setup installation test script
    run: |
      # ... existing commands ...
      timeout 600 ./test/setup/setup-test-install.sh
    timeout-minutes: 15
    env:
      CI: true
      PODMAN_USERNS: keep-id
```

### Modified Workflow

We need to modify this job to run both scripts in sequence:

```yaml
test-setup:
  name: Test Setup Script
  needs: [build]
  runs-on: [self-hosted, Rocky Linux]
  
  steps:
  # ... existing steps ...
  
  - name: Run setup installation test script with skip-cleanup
    run: |
      # Add more debugging information
      echo "Node.js version: $(node --version)"
      echo "NPM version: $(npm --version)"
      echo "Podman version: $(podman --version)"
      echo "Podman Compose version: $(podman-compose --version)"
      echo "Available memory: $(free -m)"
      echo "Available disk space: $(df -h)"
      
      # Run installation test with skip-cleanup flag
      timeout 600 ./test/setup/setup-test-install.sh --skip-cleanup
    timeout-minutes: 15
    env:
      CI: true
      PODMAN_USERNS: keep-id
  
  - name: Check container status after installation
    run: |
      echo "Checking container status after installation..."
      podman ps -a
      echo "Container logs:"
      for container in $(podman ps -a --format "{{.Names}}"); do
        echo "=== Logs for $container ==="
        podman logs $container
      done
    
  - name: Run setup update test script
    run: |
      echo "Running setup update test script..."
      timeout 600 ./test/setup/setup-test-update.sh
    timeout-minutes: 15
    env:
      CI: true
      PODMAN_USERNS: keep-id
  
  - name: Check container status after update
    run: |
      echo "Checking container status after update..."
      podman ps -a
      echo "Container logs:"
      for container in $(podman ps -a --format "{{.Names}}"); do
        echo "=== Logs for $container ==="
        podman logs $container
      done
  
  - name: Capture logs and artifacts
    if: always()
    run: |
      echo "Capturing logs and artifacts..."
      mkdir -p test-logs
      
      # Capture container status
      podman ps -a > test-logs/container-status.txt
      
      # Capture container logs
      for container in $(podman ps -a --format "{{.Names}}"); do
        podman logs $container > test-logs/$container.log 2>&1 || echo "Failed to capture logs for $container"
      done
      
      # Capture directory structure
      find . -type d -not -path "*/node_modules/*" -not -path "*/\.*" | sort > test-logs/directory-structure.txt
      
      # Capture build/config contents
      ls -la build/config/ > test-logs/build-config-contents.txt
      
      # Capture client/dist contents if it exists
      if [ -d "client/dist" ]; then
        find client/dist -type f | sort > test-logs/client-dist-contents.txt
      fi
  
  - name: Upload test logs
    if: always()
    uses: actions/upload-artifact@v4
    with:
      name: test-logs
      path: test-logs/
```

## Verifying the Test Setup Script

Before implementing this in GitHub Actions, we should verify that the `test/setup/setup-test-update.sh` script exists and is properly configured to run after `setup-test-install.sh`.

Let's examine the `test/setup/setup-test-update.sh` script to ensure it:

1. Assumes an existing installation
2. Properly updates the containers
3. Verifies that the updated containers are running and healthy

If the script doesn't exist or isn't properly configured, we'll need to create or modify it.

## Expected Outcome

By running these tests in sequence in GitHub Actions, we expect to:

1. Observe how the installation process behaves in the CI environment
2. See if the containers remain running after installation
3. Understand how the update process interacts with existing containers
4. Identify any issues that occur during the update process

This will provide valuable insights into the full lifecycle of the application in the CI environment and help us develop a more effective solution to the container crashing issues.

## Next Steps

After implementing and running this workflow:

1. Analyze the logs and artifacts to identify any issues
2. Compare the behavior in local development vs. CI environments
3. Develop a more targeted implementation plan based on the test results
4. Implement the necessary changes to ensure consistent behavior across all environments

This approach will help us understand the full context of the issue and develop a more effective solution.