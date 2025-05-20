# Final Testing Approach: Installation and Update Sequence

After analyzing the codebase and the test scripts, I've developed a comprehensive testing approach that will help identify the root cause of the container crashing issues in GitHub Actions.

## Understanding the Test Scripts

The project has two test scripts that work together to test the full lifecycle of the application:

1. **setup-test-install.sh**: Tests the installation process by running setup.sh with --force-install
2. **setup-test-update.sh**: Tests the update process by modifying code and running setup.sh with --update

These scripts are designed to be run in sequence, with the first script leaving containers running for the second script to update.

## Testing Sequence

The correct testing sequence is:

```bash
# Step 1: Run installation test with skip-cleanup flag
./test/setup/setup-test-install.sh --skip-cleanup

# Step 2: Run update test
./test/setup/setup-test-update.sh
```

This sequence will:
1. Install the application using the standard process
2. Keep the containers running after installation (due to `--skip-cleanup`)
3. Modify the health endpoint in the server code
4. Perform an update on the existing installation
5. Verify that the update was successful
6. Clean up the containers

## Key Insights from Script Analysis

After analyzing the scripts, I've identified several important insights:

1. **CI-Specific Code Paths**: The `setup-test-install.sh` script contains CI-specific code that creates empty directories and uses a CI-specific podman-compose file. This creates different behavior between CI and development environments.

2. **Empty Directory Creation**: In CI mode, the script creates an empty `client/dist` directory with just a health check endpoint, preventing the normal build process.

3. **Read-Only Volume Mounts**: The CI-specific podman-compose file mounts directories with the `:ro` flag, preventing the container from writing to them.

4. **Update Verification**: The `setup-test-update.sh` script expects containers to be running from a previous test, which won't happen if the containers crash after starting.

## Unified Testing Approach

Based on these insights, I recommend a unified testing approach that:

1. **Removes CI-Specific Code Paths**: Modify `setup-test-install.sh` to remove CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

2. **Removes Read-Only Flags**: Modify the podman-compose files to remove the `:ro` flags from volume mounts.

3. **Runs Tests in Sequence**: Run `setup-test-install.sh` with `--skip-cleanup` followed by `setup-test-update.sh` to test the full lifecycle.

4. **Adds Better Logging**: Add better logging to capture the exact state of the system at each step.

## Implementation in GitHub Actions

To implement this testing approach in GitHub Actions, modify the workflow file to:

1. Run `setup-test-install.sh` with `--skip-cleanup`
2. Check container status after installation
3. Run `setup-test-update.sh`
4. Check container status after update
5. Capture logs and artifacts

See [github-actions-testing-workflow.md](github-actions-testing-workflow.md) for detailed implementation steps.

## Expected Outcome

By implementing this unified testing approach, we expect to:

1. Identify the exact point of failure in the container lifecycle
2. Understand how the installation and update processes interact
3. Develop a more targeted solution to the container crashing issues

## Next Steps

1. Implement the unified testing approach in GitHub Actions
2. Analyze the results to identify the root cause
3. Implement the necessary changes to ensure consistent behavior across all environments

This approach will provide a comprehensive understanding of the issue and lead to a more effective solution.