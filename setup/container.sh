#!/bin/bash

# Container engine functions for ShareThings

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
    # First attempt with default configuration
    echo -e "${YELLOW}Attempting to build containers with default configuration...${NC}"
    podman-compose -f "$COMPOSE_FILE" build
    
    # Check if build was successful
    if [ $? -ne 0 ]; then
      echo -e "${YELLOW}Default build failed. Trying alternative build approach...${NC}"
      
      # Try building images directly with podman
      echo -e "${YELLOW}Building backend image directly...${NC}"
      podman build -f ./server/Dockerfile -t share-things_backend --build-arg PORT=${API_PORT:-3001} ./server
      
      echo -e "${YELLOW}Building frontend image directly...${NC}"
      podman build -f ./client/Dockerfile -t share-things_frontend --build-arg API_URL=auto --build-arg SOCKET_URL=auto --build-arg VITE_API_PORT=${API_PORT:-3001} ./client
      
      # Check if direct build was successful
      if [ $? -ne 0 ]; then
        echo -e "${RED}All build attempts failed. Exiting.${NC}"
        exit 1
      fi
    fi
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