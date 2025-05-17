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
CONTAINER_ENGINE_ARG=""
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
      --container-engine)
        CONTAINER_ENGINE_ARG="$2"
        shift 2
        ;;
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
  echo "  --test [case]              Run in test mode, optionally specifying a test case"
  echo "                             Available cases: memory, postgres, all"
  echo "  --start                    Build and start containers after setup"
  echo "  --postgres                 Use PostgreSQL for session storage"
  echo "  --memory                   Use in-memory session storage (default)"
  echo "  --container-engine ENGINE  Specify container engine (docker or podman)"
  echo "  --hostname HOSTNAME        Specify hostname (or 'auto' for auto-detection)"
  echo "  --use-custom-ports y/n     Use custom ports for HAProxy"
  echo "  --client-port PORT         Specify client port for HAProxy"
  echo "  --api-port PORT            Specify API port for HAProxy"
  echo "  --use-https y/n            Use HTTPS"
  echo "  --expose-ports y/n         Expose container ports to host"
  echo "  --frontend-port PORT       Specify frontend port to expose"
  echo "  --backend-port PORT        Specify backend port to expose"
  echo "  --session-storage-type TYPE Specify session storage type (memory or postgresql)"
  echo "  --pg-location e/l          Use external (e) or local (l) PostgreSQL"
  echo "  --pg-host HOST             Specify PostgreSQL host"
  echo "  --pg-port PORT             Specify PostgreSQL port"
  echo "  --pg-database DB           Specify PostgreSQL database name"
  echo "  --pg-user USER             Specify PostgreSQL username"
  echo "  --pg-password PASS         Specify PostgreSQL password"
  echo "  --pg-ssl y/n               Use SSL for PostgreSQL connection"
  echo "  --pg-docker y/n            Run PostgreSQL in Docker"
  echo "  --docker-registry-url URL  Specify Docker registry URL"
  echo "  --docker-username USER     Specify Docker registry username"
  echo "  --docker-password PASS     Specify Docker registry password"
  echo "  --help                     Show this help message"
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
    image: docker.io/library/postgres:17-alpine
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