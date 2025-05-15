# Rocky Linux Testing Scripts

This directory contains scripts for testing the ShareThings application on Rocky Linux as part of the CI/CD pipeline.

## Overview

These scripts are designed to test the setup and update processes on Rocky Linux before deploying to production. They ensure that:

1. The application can be installed cleanly using the `setup.sh` script
2. The application can be updated using the `update-server.sh` script

## Scripts

### `test-setup.sh`

This script tests the `setup.sh` script with both memory and PostgreSQL options. It:

- Configures Podman to allow short names
- Updates docker-compose files to use fully qualified image names
- Tests `setup.sh` with memory option in test mode
- Tests `setup.sh` with PostgreSQL option in test mode
- Tests `setup.sh` with memory option and starts containers
- Verifies that the containers are running
- Tests the application's health endpoint

### `test-update.sh`

This script tests the `update-server.sh` script by making a minimal change to the login screen and verifying that the change is present after the update. It:

- Starts the application with memory storage
- Makes a minimal change to the login screen
- Runs the `update-server.sh` script
- Verifies that the change is present in the response

## Usage

These scripts are designed to be run on a Rocky Linux machine. They do not contain any secrets and can be safely committed to the repository.

### Manual Testing

To run these scripts manually on a Rocky Linux machine:

```bash
# Clone the repository
git clone https://github.com/jsbattig/share-things.git
cd share-things

# Make the scripts executable
chmod +x ci/rocky-linux/*.sh

# Run the setup test
./ci/rocky-linux/test-setup.sh

# Run the update test
./ci/rocky-linux/test-update.sh
```

### CI/CD Integration

These scripts are integrated into the CI/CD pipeline using GitHub Actions. The workflow is defined in `.github/workflows/rocky-linux-tests.yml`.

The workflow:

1. Runs on push to main and feature/postgresql-session-management branches
2. Runs on pull requests to main
3. Can be triggered manually
4. Creates a wrapper script that contains the secrets needed to connect to the Rocky Linux machine
5. Runs the tests on the Rocky Linux machine
6. Fails if any of the tests fail

## Secrets

The GitHub Actions workflow requires the following secrets:

- `ROCKY_LINUX_HOST`: The hostname or IP address of the Rocky Linux machine
- `ROCKY_LINUX_USER`: The username to use for SSH
- `ROCKY_LINUX_PASSWORD`: The password to use for SSH
- `ROCKY_LINUX_SSH_KEY`: The SSH private key to use for SSH (optional)

## Notes

- The wrapper script (`rocky-linux-wrapper.sh`) contains secrets and should NOT be committed to the repository.
- The test scripts do not contain any secrets and can be safely committed to the repository.
- The test scripts are designed to clean up after themselves, so they can be run multiple times without issues.