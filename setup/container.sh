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
  
  # Directly update Dockerfiles with custom registry URL if provided
  if [ -n "$DOCKER_REGISTRY_URL" ]; then
    echo -e "${YELLOW}Custom Docker registry URL provided: $DOCKER_REGISTRY_URL${NC}"
    echo -e "${YELLOW}Directly updating Dockerfiles with custom registry URL...${NC}"
    
    # Update server/Dockerfile
    if [ -f "./server/Dockerfile" ]; then
      echo -e "${YELLOW}Updating server/Dockerfile...${NC}"
      echo -e "${YELLOW}Before update:${NC}"
      head -10 ./server/Dockerfile
      
      # Create a temporary file for the modified Dockerfile
      TEMP_FILE=$(mktemp)
      
      # Read the Dockerfile line by line and replace all FROM statements
      while IFS= read -r line; do
        if [[ $line =~ ^FROM ]]; then
          # Extract the image name and tag
          if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
            image="${BASH_REMATCH[1]}"
            rest="${BASH_REMATCH[2]}"
            
            # Remove docker.io prefix if present
            image_without_prefix="${image#docker.io/}"
            
            # Construct the new image reference with the custom registry
            # Remove trailing slash from registry URL if present
            registry_url="${DOCKER_REGISTRY_URL%/}"
            
            # Construct the new image reference
            new_image="${registry_url}/${image_without_prefix}"
            
            # Replace the line
            echo -e "${YELLOW}Replacing FROM statement: $line${NC}"
            echo -e "${YELLOW}With: FROM $new_image$rest${NC}"
            echo "FROM $new_image$rest" >> "$TEMP_FILE"
          else
            # If we couldn't parse the FROM statement, keep it as is
            echo "$line" >> "$TEMP_FILE"
          fi
        else
          # Not a FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      done < "./server/Dockerfile"
      
      # Replace the original file with the modified one
      mv "$TEMP_FILE" "./server/Dockerfile"
      
      echo -e "${YELLOW}After update:${NC}"
      head -10 ./server/Dockerfile
      
      # Verify the update
      if ! grep -q "$DOCKER_REGISTRY_URL" ./server/Dockerfile; then
        echo -e "${RED}ERROR: Failed to update server/Dockerfile${NC}"
        echo -e "${RED}Custom Docker registry URL not found in the file after update.${NC}"
        echo -e "${RED}Aborting container build.${NC}"
        exit 1
      else
        echo -e "${GREEN}Successfully updated server/Dockerfile${NC}"
      fi
    fi
    
    # Update client/Dockerfile
    if [ -f "./client/Dockerfile" ]; then
      echo -e "${YELLOW}Updating client/Dockerfile...${NC}"
      echo -e "${YELLOW}Before update:${NC}"
      head -10 ./client/Dockerfile
      
      # Create a temporary file for the modified Dockerfile
      TEMP_FILE=$(mktemp)
      
      # Read the Dockerfile line by line and replace all FROM statements
      while IFS= read -r line; do
        if [[ $line =~ ^FROM ]]; then
          # Extract the image name and tag
          if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
            image="${BASH_REMATCH[1]}"
            rest="${BASH_REMATCH[2]}"
            
            # Remove docker.io prefix if present
            image_without_prefix="${image#docker.io/}"
            
            # Construct the new image reference with the custom registry
            # Remove trailing slash from registry URL if present
            registry_url="${DOCKER_REGISTRY_URL%/}"
            
            # Construct the new image reference
            new_image="${registry_url}/${image_without_prefix}"
            
            # Replace the line
            echo -e "${YELLOW}Replacing FROM statement: $line${NC}"
            echo -e "${YELLOW}With: FROM $new_image$rest${NC}"
            echo "FROM $new_image$rest" >> "$TEMP_FILE"
          else
            # If we couldn't parse the FROM statement, keep it as is
            echo "$line" >> "$TEMP_FILE"
          fi
        else
          # Not a FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      done < "./client/Dockerfile"
      
      # Replace the original file with the modified one
      mv "$TEMP_FILE" "./client/Dockerfile"
      
      echo -e "${YELLOW}After update:${NC}"
      head -10 ./client/Dockerfile
      
      # Verify the update
      if ! grep -q "$DOCKER_REGISTRY_URL" ./client/Dockerfile; then
        echo -e "${RED}ERROR: Failed to update client/Dockerfile${NC}"
        echo -e "${RED}Custom Docker registry URL not found in the file after update.${NC}"
        echo -e "${RED}Aborting container build.${NC}"
        exit 1
      else
        echo -e "${GREEN}Successfully updated client/Dockerfile${NC}"
      fi
    fi
  fi
  
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