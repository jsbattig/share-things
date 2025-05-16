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

# Configure Podman for Rocky Linux in CI/CD environments
configure_podman_rocky() {
  echo -e "${YELLOW}Detected Rocky Linux in CI/CD environment. Applying special Podman configuration...${NC}"
  
  # Create containers.conf with host networking configuration
  mkdir -p ~/.config/containers
  cat > ~/.config/containers/containers.conf << EOL
[engine]
cgroup_manager = "cgroupfs"
events_logger = "file"
network_backend = "netavark"

[network]
network_backend = "netavark"
default_rootless_network_cmd = "host"
EOL
  echo -e "${GREEN}Created ~/.config/containers/containers.conf with host networking${NC}"
  
  # Create registries.conf with permissive short name mode
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
  
  # Display Podman configuration for debugging
  echo -e "${YELLOW}Podman configuration:${NC}"
  cat ~/.config/containers/containers.conf
  cat ~/.config/containers/registries.conf
  
  # Modify docker-compose.yml to use host networking if it exists
  if [ -f "docker-compose.yml" ]; then
    echo -e "${YELLOW}Modifying docker-compose.yml to use host networking...${NC}"
    
    # Create a backup of the original file
    cp docker-compose.yml docker-compose.yml.bak
    
    # Update network configuration for all services
    $SED_CMD 's/networks:/# networks:/g' docker-compose.yml
    $SED_CMD 's/  app_network:/  # app_network:/g' docker-compose.yml
    $SED_CMD 's/    aliases:/    # aliases:/g' docker-compose.yml
    $SED_CMD 's/      - backend/      # - backend/g' docker-compose.yml
    $SED_CMD 's/      - frontend/      # - frontend/g' docker-compose.yml
    $SED_CMD 's/      - postgres/      # - postgres/g' docker-compose.yml
    
    # Add network_mode: host to all services
    $SED_CMD '/container_name: share-things-backend/a\    network_mode: host' docker-compose.yml
    $SED_CMD '/container_name: share-things-frontend/a\    network_mode: host' docker-compose.yml
    $SED_CMD '/container_name: share-things-postgres/a\    network_mode: host' docker-compose.yml
    
    # Update PostgreSQL host references to use localhost
    if grep -q "PG_HOST=postgres" server/.env 2>/dev/null; then
      echo -e "${YELLOW}Updating PostgreSQL host to localhost in server/.env...${NC}"
      $SED_CMD 's/PG_HOST=postgres/PG_HOST=localhost/g' server/.env
    fi
    
    echo -e "${GREEN}Modified docker-compose.yml to use host networking${NC}"
  fi
  
  # Modify docker-compose.prod.yml if it exists
  if [ -f "docker-compose.prod.yml" ]; then
    echo -e "${YELLOW}Modifying docker-compose.prod.yml to use host networking...${NC}"
    
    # Create a backup of the original file
    cp docker-compose.prod.yml docker-compose.prod.yml.bak
    
    # Update network configuration for all services
    $SED_CMD 's/networks:/# networks:/g' docker-compose.prod.yml
    $SED_CMD 's/  app_network:/  # app_network:/g' docker-compose.prod.yml
    $SED_CMD 's/    aliases:/    # aliases:/g' docker-compose.prod.yml
    $SED_CMD 's/      - backend/      # - backend/g' docker-compose.prod.yml
    $SED_CMD 's/      - frontend/      # - frontend/g' docker-compose.prod.yml
    $SED_CMD 's/      - postgres/      # - postgres/g' docker-compose.prod.yml
    
    # Add network_mode: host to all services
    $SED_CMD '/container_name: share-things-backend/a\    network_mode: host' docker-compose.prod.yml
    $SED_CMD '/container_name: share-things-frontend/a\    network_mode: host' docker-compose.prod.yml
    $SED_CMD '/container_name: share-things-postgres/a\    network_mode: host' docker-compose.prod.yml
    
    echo -e "${GREEN}Modified docker-compose.prod.yml to use host networking${NC}"
  fi
  
  # Modify docker-compose.test.yml if it exists
  if [ -f "docker-compose.test.yml" ]; then
    echo -e "${YELLOW}Modifying docker-compose.test.yml to use host networking...${NC}"
    
    # Create a backup of the original file
    cp docker-compose.test.yml docker-compose.test.yml.bak
    
    # Update network configuration for all services
    $SED_CMD 's/networks:/# networks:/g' docker-compose.test.yml
    $SED_CMD 's/  app_network:/  # app_network:/g' docker-compose.test.yml
    $SED_CMD 's/    aliases:/    # aliases:/g' docker-compose.test.yml
    $SED_CMD 's/      - backend/      # - backend/g' docker-compose.test.yml
    $SED_CMD 's/      - frontend/      # - frontend/g' docker-compose.test.yml
    $SED_CMD 's/      - postgres/      # - postgres/g' docker-compose.test.yml
    
    # Add network_mode: host to all services
    $SED_CMD '/container_name: share-things-backend/a\    network_mode: host' docker-compose.test.yml
    $SED_CMD '/container_name: share-things-frontend/a\    network_mode: host' docker-compose.test.yml
    $SED_CMD '/container_name: share-things-postgres/a\    network_mode: host' docker-compose.test.yml
    
    echo -e "${GREEN}Modified docker-compose.test.yml to use host networking${NC}"
  fi
  
  # Increase container startup wait times in docker-compose files
  echo -e "${YELLOW}Adding container dependency health checks...${NC}"
  
  # Add healthcheck to PostgreSQL service in docker-compose.yml
  if [ -f "docker-compose.yml" ]; then
    if ! grep -q "healthcheck:" docker-compose.yml; then
      $SED_CMD '/container_name: share-things-postgres/a\    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\n      timeout: 5s\n      retries: 5\n      start_period: 10s' docker-compose.yml
    fi
  fi
  
  # Add healthcheck to PostgreSQL service in docker-compose.prod.yml
  if [ -f "docker-compose.prod.yml" ]; then
    if ! grep -q "healthcheck:" docker-compose.prod.yml; then
      $SED_CMD '/container_name: share-things-postgres/a\    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\n      timeout: 5s\n      retries: 5\n      start_period: 10s' docker-compose.prod.yml
    fi
  fi
  
  # Add healthcheck to PostgreSQL service in docker-compose.test.yml
  if [ -f "docker-compose.test.yml" ]; then
    if ! grep -q "healthcheck:" docker-compose.test.yml; then
      $SED_CMD '/container_name: share-things-postgres/a\    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\n      timeout: 5s\n      retries: 5\n      start_period: 10s' docker-compose.test.yml
    fi
  fi
  
  # Update backend dependency on postgres to wait for health check
  if [ -f "docker-compose.yml" ]; then
    $SED_CMD 's/      - postgres/      postgres:\n        condition: service_healthy/g' docker-compose.yml
  fi
  
  if [ -f "docker-compose.prod.yml" ]; then
    $SED_CMD 's/      - postgres/      postgres:\n        condition: service_healthy/g' docker-compose.prod.yml
  fi
  
  if [ -f "docker-compose.test.yml" ]; then
    $SED_CMD 's/      - postgres/      postgres:\n        condition: service_healthy/g' docker-compose.test.yml
  fi
  
  echo -e "${GREEN}Added health checks to PostgreSQL service${NC}"
  
  # Display Podman system info for debugging
  echo -e "${YELLOW}Podman system info:${NC}"
  podman info || true
  
  # Display Podman network info
  echo -e "${YELLOW}Podman network info:${NC}"
  podman network ls || true
  
  echo -e "${GREEN}Podman configuration for Rocky Linux complete.${NC}"
}