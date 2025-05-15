#!/bin/bash

# Container engine functions for ShareThings

# Configure container engine
configure_container_engine() {
  echo -e "${BLUE}=== Container Engine Configuration ===${NC}"
  
  if [ "$TEST_MODE" = false ]; then
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
}

# Build and start containers
build_and_start_containers() {
  echo -e "${BLUE}=== Building and Starting Containers ===${NC}"
  
  if [ "$PRODUCTION_MODE" = true ] || [ "$TEST_MODE" = true ]; then
    echo -e "${YELLOW}Test mode: Using production mode (no volume mounts).${NC}"
    create_production_compose_file
    COMPOSE_FILE="docker-compose.prod.temp.yml"
  else
    COMPOSE_FILE="docker-compose.yml"
  fi
  
  echo -e "${YELLOW}Building containers...${NC}"
  if [ "$CONTAINER_ENGINE" = "podman" ]; then
    podman-compose -f "$COMPOSE_FILE" build || exit 1
  else
    docker-compose -f "$COMPOSE_FILE" build || exit 1
  fi
  
  if [ "$START_CONTAINERS" = true ]; then
    echo -e "${YELLOW}Starting containers...${NC}"
    if [ "$CONTAINER_ENGINE" = "podman" ]; then
      podman-compose -f "$COMPOSE_FILE" up -d || exit 1
    else
      docker-compose -f "$COMPOSE_FILE" up -d || exit 1
    fi
  fi
}

# Create production compose file
create_production_compose_file() {
  echo -e "${YELLOW}Creating production compose file...${NC}"
  
  # Create a temporary production compose file
  if [ "$USE_POSTGRES" = true ]; then
    cp docker-compose.prod.yml docker-compose.prod.temp.yml
  else
    # Remove the postgres service from the production compose file
    grep -v -A 20 "postgres:" docker-compose.prod.yml > docker-compose.prod.temp.yml
  fi
  
  echo -e "${GREEN}Production compose file created.${NC}"
}