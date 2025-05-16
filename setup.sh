#!/bin/bash

# ShareThings Setup Script
# This script sets up the ShareThings application

# Ensure we're in the project root directory
cd "$(dirname "$0")"

# Source the common functions
source setup/common.sh

# Additional command line arguments for non-interactive mode
HOSTNAME_ARG=""
USE_CUSTOM_PORTS_ARG=""
CLIENT_PORT_ARG=""
API_PORT_ARG=""
USE_HTTPS_ARG=""
EXPOSE_PORTS_ARG=""
FRONTEND_PORT_ARG=""
BACKEND_PORT_ARG=""
SESSION_STORAGE_TYPE_ARG=""
PG_LOCATION_ARG=""
PG_HOST_ARG=""
PG_PORT_ARG=""
PG_DATABASE_ARG=""
PG_USER_ARG=""
PG_PASSWORD_ARG=""
PG_SSL_ARG=""
PG_DOCKER_ARG=""

# Parse additional command line arguments
parse_additional_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --hostname)
        HOSTNAME_ARG="$2"
        shift 2
        ;;
      --use-custom-ports)
        USE_CUSTOM_PORTS_ARG="$2"
        shift 2
        ;;
      --client-port)
        CLIENT_PORT_ARG="$2"
        shift 2
        ;;
      --api-port)
        API_PORT_ARG="$2"
        shift 2
        ;;
      --use-https)
        USE_HTTPS_ARG="$2"
        shift 2
        ;;
      --expose-ports)
        EXPOSE_PORTS_ARG="$2"
        shift 2
        ;;
      --frontend-port)
        FRONTEND_PORT_ARG="$2"
        shift 2
        ;;
      --backend-port)
        BACKEND_PORT_ARG="$2"
        shift 2
        ;;
      --session-storage-type)
        SESSION_STORAGE_TYPE_ARG="$2"
        shift 2
        ;;
      --pg-location)
        PG_LOCATION_ARG="$2"
        shift 2
        ;;
      --pg-host)
        PG_HOST_ARG="$2"
        shift 2
        ;;
      --pg-port)
        PG_PORT_ARG="$2"
        shift 2
        ;;
      --pg-database)
        PG_DATABASE_ARG="$2"
        shift 2
        ;;
      --pg-user)
        PG_USER_ARG="$2"
        shift 2
        ;;
      --pg-password)
        PG_PASSWORD_ARG="$2"
        shift 2
        ;;
      --pg-ssl)
        PG_SSL_ARG="$2"
        shift 2
        ;;
      --pg-docker)
        PG_DOCKER_ARG="$2"
        shift 2
        ;;
      *)
        # Skip unknown arguments
        shift
        ;;
    esac
  done
}

# Parse command line arguments
parse_args "$@"
# Parse additional arguments
parse_additional_args "$@"

# Display welcome message
show_welcome

# Source other modules
source setup/env.sh
source setup/postgres.sh
source setup/docker.sh
source setup/container.sh

# Source Rocky Linux-specific Podman configuration if available
if [ -f "setup/podman-rocky.sh" ]; then
  source setup/podman-rocky.sh
fi

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

# Apply Rocky Linux-specific Podman configuration if needed
if [ "$CONTAINER_ENGINE" = "podman" ] && [ -f "/etc/redhat-release" ] && grep -q "Rocky Linux" /etc/redhat-release; then
  echo -e "${YELLOW}Detected Rocky Linux. Applying special Podman configuration...${NC}"
  configure_podman_rocky
fi

# Build and start containers if requested
if [ "$START_CONTAINERS" = true ]; then
  build_and_start_containers
fi

# Show completion message
show_completion

# Clean up any backup files created by sed
cleanup_backups