# Rocky Linux Test Scripts

## Overview

The Rocky Linux test scripts (`test-setup.sh` and `test-update.sh`) are designed to test the ShareThings setup and update scripts on a Rocky Linux environment. These scripts are typically run by the Rocky Linux wrapper script (`rocky-linux-wrapper.sh`), but can also be run directly on a Rocky Linux machine.

## test-setup.sh

### Purpose

The `test-setup.sh` script tests the `setup.sh` script with both memory and PostgreSQL storage options. It verifies that the containers are built and run correctly in a Rocky Linux environment.

### Implementation Details

The script follows a two-phase approach:

1. **Standard Setup Test**:
   - First attempts to run the standard `setup.sh` script with memory storage
   - Uses command-line arguments to configure the setup
   - Checks if containers are running correctly

2. **Manual Container Deployment**:
   - If the standard setup fails or after testing it, the script performs a thorough cleanup
   - Creates a custom Dockerfile.test for the backend
   - Builds containers directly using podman (bypassing podman-compose)
   - Creates a custom network
   - Runs containers manually with specific network settings

This two-phase approach ensures robust testing even if there are issues with the standard setup process. The manual container deployment phase serves as both a verification method and a fallback mechanism.

### Usage

```bash
./ci/rocky-linux/test-setup.sh [branch] [work_dir]
```

Parameters:
- `branch`: The git branch to test (default: "feature/postgresql-session-management")
- `work_dir`: The working directory (default: current directory)

## test-update.sh

### Purpose

The `test-update.sh` script tests the `update-server.sh` script on a Rocky Linux machine. It verifies that the update process works correctly.

### Implementation Details

The script:
1. Sets up the application using `setup.sh`
2. Runs `update-server.sh`
3. Verifies that the update was successful
4. Cleans up

### Usage

```bash
./ci/rocky-linux/test-update.sh [branch] [work_dir] [port]
```

Parameters:
- `branch`: The git branch to test (default: "feature/postgresql-session-management")
- `work_dir`: The working directory (default: current directory)
- `port`: The port to use for testing (default: 3000)

## Key Decisions

1. **Two-Phase Testing Approach**: The `test-setup.sh` script uses a two-phase approach to ensure thorough testing, even if the standard setup process encounters issues.

2. **Manual Container Deployment**: By building and running containers manually, the script can verify that the application works correctly even if there are issues with the container orchestration tools.

3. **Thorough Cleanup**: The script performs a thorough cleanup before and after testing to ensure a clean environment for each test.

4. **Detailed Logging**: The scripts provide detailed logging to help diagnose any issues that may arise during testing.

## Troubleshooting

If the tests fail, check:

1. The logs for specific error messages
2. That podman and podman-compose are installed and working correctly
3. That the network configuration is appropriate for the Rocky Linux environment
4. That the container images can be built and run correctly