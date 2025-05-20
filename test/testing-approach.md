# Testing Approach: Installation and Update Sequence

Before implementing any code changes, it's important to test the full sequence of installation followed by an update. This will help us understand how the system behaves in a complete workflow and identify any issues that might not be apparent when looking at individual scripts.

## Testing Sequence

1. Run `test-setup-install.sh` with the `--skip-cleanup` flag
2. Run `test-setup-update.sh` to perform an update on the existing installation

This sequence will:
- Install the application using the standard process
- Keep the containers running after installation (due to `--skip-cleanup`)
- Perform an update on the existing installation
- Provide insights into how the update process interacts with an existing installation

## Implementation Steps

### Step 1: Run test-setup-install.sh with --skip-cleanup

```bash
# Navigate to the test directory
cd test/setup

# Run the installation test with skip-cleanup flag
./setup-test-install.sh --skip-cleanup
```

This will:
- Run the full installation process
- Create and start the containers
- Verify that the containers are running and healthy
- Skip the cleanup step, leaving the containers running

### Step 2: Run test-setup-update.sh

```bash
# After the installation test completes successfully
./setup-test-update.sh
```

This will:
- Run the update process on the existing installation
- Update the containers
- Verify that the updated containers are running and healthy

## Expected Outcome

By running these tests in sequence, we expect to:

1. Observe how the installation process creates and configures the containers
2. See if the containers remain running after installation
3. Understand how the update process interacts with existing containers
4. Identify any issues that occur during the update process

## Logging and Debugging

During this testing sequence, it's important to:

1. Capture detailed logs from both scripts
2. Monitor container status throughout the process
3. Check for any error messages or warnings
4. Verify that the containers are running and healthy after each step

## Next Steps After Testing

After completing this testing sequence, we will:

1. Analyze the results to identify any issues
2. Compare the behavior in local development vs. CI environments
3. Develop a more targeted implementation plan based on the test results
4. Implement the necessary changes to ensure consistent behavior across all environments

This testing approach will provide valuable insights into the full lifecycle of the application and help us develop a more effective solution to the container crashing issues.