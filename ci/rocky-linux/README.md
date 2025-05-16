# Rocky Linux CI/CD Scripts

This directory contains scripts for testing ShareThings on Rocky Linux environments.

## Overview

These scripts facilitate testing of the ShareThings setup and update scripts on Rocky Linux machines, both locally and in CI/CD environments.

## Scripts

### rocky-linux-wrapper.sh

A wrapper script that connects to a remote Rocky Linux machine via SSH and runs the test scripts. This allows developers to test changes to the setup and update scripts in a real Rocky Linux environment without having to manually SSH into the machine.

For detailed documentation, see [Rocky Linux Wrapper Documentation](../../memory-bank/technical/rocky-linux-wrapper.md).

### setup-env.sh

Sets up environment variables required by the Rocky Linux wrapper script. This script:

1. Prompts for the Rocky Linux host, username, and password
2. Creates a file (~/.rocky-linux-env.sh) with these variables
3. Adds a source line to your shell profile to ensure the variables are available in future sessions
4. Exports the variables for the current session

Run this script once to configure your environment:

```bash
./ci/rocky-linux/setup-env.sh
```

### test-setup.sh

Tests the setup.sh script on a Rocky Linux machine. This script:

1. Cleans up any existing containers
2. Runs setup.sh with memory storage
3. Verifies that the containers are running correctly
4. Cleans up
5. Runs setup.sh with PostgreSQL storage
6. Verifies that the containers are running correctly
7. Cleans up

This script is typically run by the wrapper script, but can also be run directly on a Rocky Linux machine:

```bash
./ci/rocky-linux/test-setup.sh [branch] [work_dir]
```

### test-update.sh

Tests the update-server.sh script on a Rocky Linux machine. This script:

1. Sets up the application using setup.sh
2. Runs update-server.sh
3. Verifies that the update was successful
4. Cleans up

This script is typically run by the wrapper script, but can also be run directly on a Rocky Linux machine:

```bash
./ci/rocky-linux/test-update.sh [branch] [work_dir] [port]
```

## Workflow

The typical workflow for using these scripts is:

1. Set up environment variables (if not already set):
   ```bash
   ./ci/rocky-linux/setup-env.sh
   ```

2. Make changes to setup.sh or update-server.sh

3. Commit and push changes to the current branch

4. Run the wrapper script:
   ```bash
   ./ci/rocky-linux/rocky-linux-wrapper.sh
   ```

5. Review the output and debug any issues

6. Repeat steps 2-5 as necessary

## Troubleshooting

If the wrapper script fails to connect to the remote machine, ensure that:

1. The environment variables are correctly set:
   ```bash
   echo $ROCKY_LINUX_HOST
   echo $ROCKY_LINUX_USER
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