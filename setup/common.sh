#!/bin/bash

# Common functions for ShareThings setup

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS uses BSD sed which requires an extension argument for -i
  SED_CMD="sed -i.bak"
  # macOS typically uses Docker
  DEFAULT_ENGINE="docker"
else
  # Linux and others use GNU sed
  SED_CMD="sed -i"
  
  # Check if this is Rocky Linux
  if [ -f /etc/rocky-release ]; then
    # Rocky Linux typically uses Podman
    DEFAULT_ENGINE="podman"
  else
    # Default to Docker for other Linux distributions
    DEFAULT_ENGINE="docker"
  fi
fi

# Global variables
TEST_MODE=false
TEST_CASE=""
START_CONTAINERS=false
CONTAINER_ENGINE=""
COMPOSE_CMD=""
USE_POSTGRES=false
HOSTNAME=""
PROTOCOL="http"
USE_CUSTOM_PORTS=false
CLIENT_PORT=""
API_PORT=""
EXPOSE_PORTS=false
FRONTEND_PORT=""
BACKEND_PORT=""
PRODUCTION_MODE=false
COMPOSE_FILE=""

# Parse command line arguments
parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --test)
        TEST_MODE=true
        shift
        if [[ $# -gt 0 && ! $1 =~ ^-- ]]; then
          TEST_CASE="$1"
          shift
        fi
        ;;
      --start)
        START_CONTAINERS=true
        shift
        ;;
      --postgres)
        USE_POSTGRES=true
        shift
        ;;
      --memory)
        USE_POSTGRES=false
        shift
        ;;
      --help)
        show_help
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        show_help
        exit 1
        ;;
    esac
  done
}

# Show help message
show_help() {
  echo "Usage: ./setup.sh [options]"
  echo ""
  echo "Options:"
  echo "  --test [case]    Run in test mode, optionally specifying a test case"
  echo "                   Available cases: memory, postgres, all"
  echo "  --start          Build and start containers after setup"
  echo "  --postgres       Use PostgreSQL for session storage"
  echo "  --memory         Use in-memory session storage (default)"
  echo "  --help           Show this help message"
}

# Show welcome message
show_welcome() {
  echo -e "${BLUE}=== ShareThings Setup ===${NC}"
  echo "This script will help you configure the ShareThings application."
  echo ""
}

# Show completion message
show_completion() {
  echo ""
  echo -e "${GREEN}Setup complete!${NC}"
  
  if [ "$START_CONTAINERS" = true ]; then
    echo "Containers are now running."
    echo "You can access the application at:"
    echo "- Frontend: http://localhost:${FRONTEND_PORT:-8080}"
    echo "- Backend: http://localhost:${BACKEND_PORT:-3001}"
  else
    echo "To start the containers, run:"
    echo "  $COMPOSE_CMD up -d"
  fi
}

# Clean up backup files
cleanup_backups() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
  fi
}

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
    
    echo -e "${GREEN}Podman-specific configuration applied.${NC}"
    echo ""
  fi
}

# Build and start containers
build_and_start_containers() {
  echo -e "${BLUE}=== Building and Starting Containers ===${NC}"
  
  # Check if running in production mode
  if [ "$TEST_MODE" = false ]; then
    read -p "Do you want to run in production mode (no volume mounts)? (y/n): " PRODUCTION_MODE_INPUT
    if [[ $PRODUCTION_MODE_INPUT =~ ^[Yy]$ ]]; then
      PRODUCTION_MODE=true
    else
      PRODUCTION_MODE=false
    fi
  else
    # In test mode, always use production mode
    PRODUCTION_MODE=true
    echo -e "${YELLOW}Test mode: Using production mode (no volume mounts).${NC}"
  fi
  
  if [ "$PRODUCTION_MODE" = true ]; then
    echo -e "${YELLOW}Creating temporary production docker-compose file...${NC}"
    
    # Create a temporary docker-compose file for production
    create_production_compose_file
    
    echo -e "${YELLOW}Building containers in production mode...${NC}"
    $COMPOSE_CMD -f docker-compose.prod.temp.yml build --no-cache
    
    echo -e "${YELLOW}Starting containers in production mode...${NC}"
    $COMPOSE_CMD -f docker-compose.prod.temp.yml up -d
    
    # Store the compose file name for later use
    COMPOSE_FILE="docker-compose.prod.temp.yml"
  else
    echo -e "${YELLOW}Building containers in development mode...${NC}"
    $COMPOSE_CMD build --no-cache
    
    echo -e "${YELLOW}Starting containers in development mode...${NC}"
    $COMPOSE_CMD up -d
    
    # Store the compose file name for later use
    COMPOSE_FILE="docker-compose.yml"
  fi
  
  # Check if containers are running
  echo -e "${YELLOW}Checking container status...${NC}"
  if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    podman ps --filter label=io.podman.compose.project=share-things
  else
    docker ps --filter label=com.docker.compose.project=share-things
  fi
}

# Create production compose file
create_production_compose_file() {
  cat > docker-compose.prod.temp.yml << EOL
# Temporary production configuration for ShareThings Docker Compose

services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
      args:
        - PORT=${API_PORT:-3001}
    container_name: share-things-backend
    hostname: backend
    environment:
      - NODE_ENV=production
      - PORT=${API_PORT:-3001}
      # Session storage configuration
      - SESSION_STORAGE_TYPE=${SESSION_STORAGE_TYPE:-memory}
      # PostgreSQL configuration (used if SESSION_STORAGE_TYPE=postgresql)
      - PG_HOST=${PG_HOST:-postgres}
      - PG_PORT=${PG_PORT:-5432}
      - PG_DATABASE=${PG_DATABASE:-sharethings}
      - PG_USER=${PG_USER:-postgres}
      - PG_PASSWORD=${PG_PASSWORD:-postgres}
      - PG_SSL=${PG_SSL:-false}
    ports:
      - "\${BACKEND_PORT:-3001}:${API_PORT:-3001}"
    restart: always
    networks:
      app_network:
        aliases:
          - backend
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    depends_on:
      - postgres

  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT:-3001}
        - VITE_API_PORT=${API_PORT:-3001}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT:-3001}
    ports:
      - "\${FRONTEND_PORT:-8080}:80"
    restart: always
    depends_on:
      - backend
    networks:
      app_network:
        aliases:
          - frontend
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: share-things-postgres
    environment:
      - POSTGRES_USER=${PG_USER:-postgres}
      - POSTGRES_PASSWORD=${PG_PASSWORD:-postgres}
      - POSTGRES_DB=${PG_DATABASE:-sharethings}
    ports:
      - "\${PG_HOST_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      app_network:
        aliases:
          - postgres
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    # Only start PostgreSQL if using postgresql storage
    profiles:
      - ${SESSION_STORAGE_TYPE:-memory}
      - all

# Explicit network configuration
networks:
  app_network:
    driver: bridge

# Volumes for data persistence
volumes:
  postgres-data:
EOL
}