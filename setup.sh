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

# Docker registry parameters
DOCKER_REGISTRY_URL_ARG=""
DOCKER_USERNAME_ARG=""
DOCKER_PASSWORD_ARG=""

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
      --docker-registry-url)
        DOCKER_REGISTRY_URL_ARG="$2"
        echo -e "${YELLOW}Docker registry URL: $DOCKER_REGISTRY_URL_ARG${NC}"
        export DOCKER_REGISTRY_URL="$DOCKER_REGISTRY_URL_ARG"
        shift 2
        ;;
      --docker-username)
        DOCKER_USERNAME_ARG="$2"
        echo -e "${YELLOW}Docker username: $DOCKER_USERNAME_ARG${NC}"
        export DOCKER_USERNAME="$DOCKER_USERNAME_ARG"
        shift 2
        ;;
      --docker-password)
        DOCKER_PASSWORD_ARG="$2"
        echo -e "${YELLOW}Docker password: [masked]${NC}"
        export DOCKER_PASSWORD="$DOCKER_PASSWORD_ARG"
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

# Debug: Print all arguments
echo -e "${YELLOW}All arguments: $@${NC}"

# Debug: Print all environment variables
echo -e "${YELLOW}All environment variables:${NC}"
env | grep -E 'DOCKER_|docker' || echo "No Docker-related environment variables found"

# Export Docker registry parameters as environment variables
if [ -n "$DOCKER_REGISTRY_URL_ARG" ]; then
  export DOCKER_REGISTRY_URL="$DOCKER_REGISTRY_URL_ARG"
  echo -e "${YELLOW}Exported DOCKER_REGISTRY_URL=$DOCKER_REGISTRY_URL${NC}"
  
  # Directly update Dockerfiles with custom registry URL
  echo -e "${YELLOW}Directly updating Dockerfiles with custom registry URL...${NC}"
  
  # Update server/Dockerfile
  if [ -f "./server/Dockerfile" ]; then
    echo -e "${YELLOW}Updating server/Dockerfile...${NC}"
    echo -e "${YELLOW}Before update:${NC}"
    head -10 ./server/Dockerfile
    
    # Remove trailing slash from registry URL if present
    registry_url="${DOCKER_REGISTRY_URL%/}"
    
    # Use sed to replace all FROM statements
    sed -i "s|FROM docker.io/library/|FROM ${registry_url}/library/|g" ./server/Dockerfile
    
    echo -e "${YELLOW}After update:${NC}"
    head -10 ./server/Dockerfile
    
    # Verify the update
    if ! grep -q "$DOCKER_REGISTRY_URL" ./server/Dockerfile; then
      echo -e "${RED}ERROR: Failed to update server/Dockerfile${NC}"
      echo -e "${RED}Custom Docker registry URL not found in the file after update.${NC}"
    else
      echo -e "${GREEN}Successfully updated server/Dockerfile${NC}"
    fi
  fi
  
  # Update client/Dockerfile
  if [ -f "./client/Dockerfile" ]; then
    echo -e "${YELLOW}Updating client/Dockerfile...${NC}"
    echo -e "${YELLOW}Before update:${NC}"
    head -10 ./client/Dockerfile
    
    # Remove trailing slash from registry URL if present
    registry_url="${DOCKER_REGISTRY_URL%/}"
    
    # Use sed to replace all FROM statements
    sed -i "s|FROM docker.io/library/|FROM ${registry_url}/library/|g" ./client/Dockerfile
    
    echo -e "${YELLOW}After update:${NC}"
    head -10 ./client/Dockerfile
    
    # Verify the update
    if ! grep -q "$DOCKER_REGISTRY_URL" ./client/Dockerfile; then
      echo -e "${RED}ERROR: Failed to update client/Dockerfile${NC}"
      echo -e "${RED}Custom Docker registry URL not found in the file after update.${NC}"
    else
      echo -e "${GREEN}Successfully updated client/Dockerfile${NC}"
    fi
  fi
fi

if [ -n "$DOCKER_USERNAME_ARG" ]; then
  export DOCKER_USERNAME="$DOCKER_USERNAME_ARG"
  echo -e "${YELLOW}Exported DOCKER_USERNAME=$DOCKER_USERNAME${NC}"
fi
if [ -n "$DOCKER_PASSWORD_ARG" ]; then
  export DOCKER_PASSWORD="$DOCKER_PASSWORD_ARG"
  echo -e "${YELLOW}Exported DOCKER_PASSWORD=[masked]${NC}"
fi

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

# Configure Docker registry if parameters are provided
if [ -n "$DOCKER_REGISTRY_URL_ARG" ]; then
  echo -e "${YELLOW}Docker registry parameters detected: $DOCKER_REGISTRY_URL_ARG${NC}"
  echo -e "${YELLOW}Configuring Docker registry...${NC}"
  
  # Check if docker-auth.sh exists in the ci/rocky-linux directory
  if [ -f "ci/rocky-linux/docker-auth.sh" ]; then
    echo -e "${YELLOW}Using ci/rocky-linux/docker-auth.sh for Docker registry configuration...${NC}"
    chmod +x ci/rocky-linux/docker-auth.sh
    
    # Build the command with any provided arguments
    DOCKER_AUTH_CMD="ci/rocky-linux/docker-auth.sh"
    if [ -n "$DOCKER_REGISTRY_URL_ARG" ]; then
      DOCKER_AUTH_CMD="$DOCKER_AUTH_CMD --registry-url $DOCKER_REGISTRY_URL_ARG"
    fi
    if [ -n "$DOCKER_USERNAME_ARG" ]; then
      DOCKER_AUTH_CMD="$DOCKER_AUTH_CMD --username $DOCKER_USERNAME_ARG"
    fi
    if [ -n "$DOCKER_PASSWORD_ARG" ]; then
      DOCKER_AUTH_CMD="$DOCKER_AUTH_CMD --password $DOCKER_PASSWORD_ARG"
    fi
    
    # Run the Docker registry configuration script
    eval "$DOCKER_AUTH_CMD"
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}Docker registry configuration successful.${NC}"
      
      # Source the generated setup script if it exists
      if [ -f "./docker-registry-setup.sh" ]; then
        echo -e "${YELLOW}Sourcing docker-registry-setup.sh...${NC}"
        source ./docker-registry-setup.sh
      fi
      
      # Verify that the Dockerfiles have been updated with the custom registry URL
      echo -e "${YELLOW}Verifying Dockerfiles have been updated with custom registry URL...${NC}"
      
      # Check server/Dockerfile
      if [ -f "./server/Dockerfile" ]; then
        echo -e "${YELLOW}Checking server/Dockerfile for custom registry URL...${NC}"
        if ! grep -q "$DOCKER_REGISTRY_URL_ARG" ./server/Dockerfile; then
          echo -e "${RED}ERROR: Custom Docker registry URL '$DOCKER_REGISTRY_URL_ARG' not found in server/Dockerfile.${NC}"
          echo -e "${RED}The Dockerfile was not properly updated. Aborting setup.${NC}"
          exit 1
        else
          echo -e "${GREEN}Custom Docker registry URL found in server/Dockerfile.${NC}"
        fi
      fi
      
      # Check client/Dockerfile
      if [ -f "./client/Dockerfile" ]; then
        echo -e "${YELLOW}Checking client/Dockerfile for custom registry URL...${NC}"
        if ! grep -q "$DOCKER_REGISTRY_URL_ARG" ./client/Dockerfile; then
          echo -e "${RED}ERROR: Custom Docker registry URL '$DOCKER_REGISTRY_URL_ARG' not found in client/Dockerfile.${NC}"
          echo -e "${RED}The Dockerfile was not properly updated. Aborting setup.${NC}"
          exit 1
        else
          echo -e "${GREEN}Custom Docker registry URL found in client/Dockerfile.${NC}"
        fi
      fi
    else
      echo -e "${RED}Docker registry configuration failed.${NC}"
    fi
  else
    echo -e "${YELLOW}docker-auth.sh not found. Creating basic Docker registry configuration...${NC}"
    
    # Create basic Docker registry configuration
    if command -v podman &> /dev/null; then
      echo -e "${YELLOW}Configuring Podman for Docker registry...${NC}"
      
      # Create registries.conf
      mkdir -p ~/.config/containers
      cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["${DOCKER_REGISTRY_URL_ARG}", "docker.io", "quay.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL
      
      # Set up authentication if username and password are provided
      if [ -n "$DOCKER_USERNAME_ARG" ] && [ -n "$DOCKER_PASSWORD_ARG" ]; then
        echo -e "${YELLOW}Setting up Docker registry authentication...${NC}"
        
        # Create auth.json
        mkdir -p ~/.config/containers/auth.json.d
        cat > ~/.config/containers/auth.json << EOL
{
  "auths": {
    "${DOCKER_REGISTRY_URL_ARG}": {
      "auth": "$(echo -n "${DOCKER_USERNAME_ARG}:${DOCKER_PASSWORD_ARG}" | base64)"
    }
  }
}
EOL
        
        # Set permissions
        chmod 600 ~/.config/containers/auth.json
        
        # Login to registry
        podman login --username "$DOCKER_USERNAME_ARG" --password "$DOCKER_PASSWORD_ARG" "$DOCKER_REGISTRY_URL_ARG"
      fi
    elif command -v docker &> /dev/null; then
      echo -e "${YELLOW}Configuring Docker for Docker registry...${NC}"
      
      # Set up authentication if username and password are provided
      if [ -n "$DOCKER_USERNAME_ARG" ] && [ -n "$DOCKER_PASSWORD_ARG" ]; then
        echo -e "${YELLOW}Setting up Docker registry authentication...${NC}"
        
        # Login to registry
        docker login --username "$DOCKER_USERNAME_ARG" --password "$DOCKER_PASSWORD_ARG" "$DOCKER_REGISTRY_URL_ARG"
      fi
    fi
    
    # Update docker-compose files to use custom registry
    if [ -n "$DOCKER_REGISTRY_URL_ARG" ]; then
      echo -e "${YELLOW}Updating docker-compose files to use custom registry...${NC}"
      
      # Update docker-compose files
      for compose_file in docker-compose.yml docker-compose.prod.yml docker-compose.test.yml; do
        if [ -f "./$compose_file" ]; then
          echo -e "${YELLOW}Updating $compose_file...${NC}"
          sed -i.bak "s|image: docker.io/library/|image: ${DOCKER_REGISTRY_URL_ARG}/library/|g" ./$compose_file
        fi
      done
      
      # Update Dockerfiles
      if [ -f "./server/Dockerfile" ]; then
        echo -e "${YELLOW}Updating server/Dockerfile...${NC}"
        sed -i.bak "s|FROM docker.io/library/|FROM ${DOCKER_REGISTRY_URL_ARG}/library/|g" ./server/Dockerfile
      fi
      
      if [ -f "./client/Dockerfile" ]; then
        echo -e "${YELLOW}Updating client/Dockerfile...${NC}"
        sed -i.bak "s|FROM docker.io/library/|FROM ${DOCKER_REGISTRY_URL_ARG}/library/|g" ./client/Dockerfile
      fi
      
      # Clean up backup files
      find . -name "*.bak" -type f -delete 2>/dev/null || true
    fi
  fi
fi

# Configure Docker/Podman
# This function is a wrapper for the main function in setup/docker.sh
configure_container_engine() {
  # Source the docker.sh script to get access to its functions
  source setup/docker.sh
  
  # Call the main function from docker.sh
  main
}

# Call the function
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