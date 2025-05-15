#!/bin/bash

# ShareThings Setup Script
# This script sets up the ShareThings application

# Ensure we're in the project root directory
cd "$(dirname "$0")"

# Source the common functions
source setup/common.sh

# Parse command line arguments
parse_args "$@"

# Display welcome message
show_welcome

# Source other modules
source setup/env.sh
source setup/postgres.sh
source setup/docker.sh

# If running in test mode, source test module
if [ "$TEST_MODE" = true ]; then
  source setup/test.sh
  run_tests
  exit $?
fi

# Setup environment files
setup_env_files

# Configure session storage
configure_session_storage

# Configure Docker/Podman
configure_container_engine

# Build and start containers if requested
if [ "$START_CONTAINERS" = true ]; then
  build_and_start_containers
fi

# Show completion message
show_completion

# Clean up any backup files created by sed
cleanup_backups