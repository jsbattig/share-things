#!/bin/bash

# Docker/Podman setup functions for ShareThings

# Configure Docker/Podman
configure_container_engine() {
  echo -e "${BLUE}=== Container Engine Configuration ===${NC}"
  
  # Check if container engine is provided as an argument
  if [ -n "$CONTAINER_ENGINE_ARG" ]; then
    CONTAINER_ENGINE="$CONTAINER_ENGINE_ARG"
    echo -e "${GREEN}Using container engine from argument: ${CONTAINER_ENGINE}${NC}"
  elif [ "$TEST_MODE" = false ]; then
    read -p "Which container engine do you want to use? (docker/podman) [${DEFAULT_ENGINE}]: " CONTAINER_ENGINE
    CONTAINER_ENGINE=${CONTAINER_ENGINE:-$DEFAULT_ENGINE}
  else
    # In test mode, use the default engine
    CONTAINER_ENGINE=$DEFAULT_ENGINE
    echo -e "${YELLOW}Test mode: Using ${CONTAINER_ENGINE} as container engine.${NC}"
  fi
  
  # Set compose command based on container engine
  if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    COMPOSE_CMD="podman-compose"
    CONTAINER_CMD="podman"
  else
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
  fi
  
  echo -e "${GREEN}Using ${CONTAINER_ENGINE} for container operations${NC}"
  
  # Check if the selected container engine is installed
  if ! command -v $CONTAINER_CMD &> /dev/null; then
    echo -e "${RED}Error: ${CONTAINER_ENGINE} is not installed.${NC}"
    echo "Please install ${CONTAINER_ENGINE} before running this script."
    exit 1
  fi
  
  # Check if the appropriate compose tool is installed
  if ! command -v $COMPOSE_CMD &> /dev/null; then
    echo -e "${RED}Error: ${COMPOSE_CMD} is not installed.${NC}"
    echo "Please install ${COMPOSE_CMD} before running this script."
    exit 1
  fi
  
  # Apply Podman-specific configuration if needed
  if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo -e "${YELLOW}Detected Podman. Applying Podman-specific configuration...${NC}"
    
    # Make the docker-entrypoint.sh script executable
    if [ -f "client/docker-entrypoint.sh" ]; then
      chmod +x client/docker-entrypoint.sh
      echo -e "${GREEN}Made client/docker-entrypoint.sh executable.${NC}"
    else
      echo -e "${YELLOW}Warning: client/docker-entrypoint.sh not found. Container networking might have issues.${NC}"
    fi
    
    # Configure Podman to allow short names on Rocky Linux
    if [ -f "/etc/redhat-release" ] && grep -q "Rocky Linux" /etc/redhat-release; then
      echo -e "${YELLOW}Detected Rocky Linux. Configuring Podman to allow short names...${NC}"
      
      # Create or update the registries.conf file
      if [ "$TEST_MODE" = false ]; then
        # In normal mode, create the file in the user's home directory instead of using sudo
        echo "Creating registries.conf in user's home directory..."
        mkdir -p ~/.config/containers
        cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["docker.io", "quay.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL
        echo -e "${GREEN}Created ~/.config/containers/registries.conf${NC}"
      else
        # In test mode, just show a warning
        echo -e "${YELLOW}Warning: Podman on Rocky Linux may require configuration to allow short image names.${NC}"
        echo -e "${YELLOW}If you encounter 'short-name resolution enforced' errors, run the following commands:${NC}"
        echo "mkdir -p ~/.config/containers"
        echo "cat > ~/.config/containers/registries.conf << EOL"
        echo "[registries.search]"
        echo "registries = [\"docker.io\", \"quay.io\"]"
        echo ""
        echo "[registries.insecure]"
        echo "registries = []"
        echo ""
        echo "[registries.block]"
        echo "registries = []"
        echo ""
        echo "[engine]"
        echo "short-name-mode=\"permissive\""
        echo "EOL"
      fi
    fi
    
    echo -e "${GREEN}Podman-specific configuration applied.${NC}"
    echo ""
  fi
}