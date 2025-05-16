# Rocky Linux Wrapper Script

## Overview

The Rocky Linux wrapper script (`ci/rocky-linux/rocky-linux-wrapper.sh`) is a local development tool designed to facilitate testing of the ShareThings setup and update scripts on a remote Rocky Linux machine. This allows developers to test changes to these scripts in a Rocky Linux environment without having to manually SSH into the machine and run the tests.

## Purpose

The primary purpose of the wrapper script is to:

1. Connect to a remote Rocky Linux machine via SSH
2. Clone or update the ShareThings repository on the remote machine
3. Run the test-setup.sh and test-update.sh scripts on the remote machine (see [Rocky Linux Test Scripts](./rocky-linux-test-scripts.md) for details)
4. Return the console output to the local machine for debugging

This workflow enables rapid iteration on the setup and update scripts, allowing developers to:
- Make changes locally
- Commit and push to the current branch
- Run the wrapper script to test the changes on a Rocky Linux machine
- Debug any issues based on the console output
- Repeat as necessary

## Environment Variables

The wrapper script requires the following environment variables to be set:

- `ROCKY_LINUX_HOST`: The hostname or IP address of the Rocky Linux machine
- `ROCKY_LINUX_USER`: The username to use for SSH
- `ROCKY_LINUX_PASSWORD`: The password to use for SSH

These variables are stored as session variables because they contain sensitive information that should not be committed to the repository.

## Setup Environment Script

To simplify the process of setting up the environment variables, a setup-env.sh script (`ci/rocky-linux/setup-env.sh`) is provided. This script:

1. Prompts the user for the Rocky Linux host, username, and password
2. Sets these values as persistent session variables
3. Ensures the wrapper script can access these variables in subsequent terminal sessions

## Workflow

The typical workflow for using the Rocky Linux wrapper script is:

1. Make changes to the setup.sh, update-server.sh, or related scripts
2. Commit and push the changes to the current branch
3. Run the setup-env.sh script if the environment variables are not already set:
   ```bash
   ./ci/rocky-linux/setup-env.sh
   ```
4. Run the wrapper script to test the changes:
   ```bash
   ./ci/rocky-linux/rocky-linux-wrapper.sh
   ```
5. Review the console output to identify any issues
6. Make additional changes as needed and repeat the process

## Key Decisions

1. **SSH-based Remote Execution**: The wrapper script uses SSH to execute commands on the remote machine, allowing for testing in a real Rocky Linux environment without requiring direct access to the machine.

2. **Environment Variables for Credentials**: Sensitive information like the SSH password is stored in environment variables rather than hardcoded in the script, enhancing security.

3. **Persistent Session Variables**: The setup-env.sh script creates persistent session variables to ensure the wrapper script can be run in subsequent terminal sessions without having to re-enter the credentials.

4. **Automatic Repository Management**: The wrapper script automatically clones or updates the repository on the remote machine, ensuring the latest changes are tested.

## Troubleshooting

If the wrapper script fails to connect to the remote machine, ensure that:

1. The environment variables are correctly set:
   ```bash
   echo $ROCKY_LINUX_HOST
   echo $ROCKY_LINUX_USER
   # Don't echo the password for security reasons
   ```

2. The SSH connection is working:
   ```bash
   ssh $ROCKY_LINUX_USER@$ROCKY_LINUX_HOST
   ```

3. The remote machine has the necessary dependencies installed:
   ```bash
   ssh $ROCKY_LINUX_USER@$ROCKY_LINUX_HOST "command -v podman podman-compose curl"
   ```

If the environment variables are not persisting between terminal sessions, run the setup-env.sh script again and check that it's correctly modifying your shell profile.