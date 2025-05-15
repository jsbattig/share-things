#!/bin/bash

# Docker/Podman setup functions for ShareThings

# Update Docker Compose configuration
update_docker_compose() {
  echo -e "${YELLOW}Updating Docker Compose configuration...${NC}"
  
  # Check if PostgreSQL is enabled
  if [[ $USE_POSTGRES =~ ^[Yy]$ ]] || [ "$SESSION_STORAGE_TYPE" = "postgresql" ]; then
    # Get PostgreSQL configuration
    if [ -f server/.env ]; then
      PG_DATABASE=$(grep "PG_DATABASE=" server/.env | cut -d= -f2)
      PG_USER=$(grep "PG_USER=" server/.env | cut -d= -f2)
      PG_PASSWORD=$(grep "PG_PASSWORD=" server/.env | cut -d= -f2)
    else
      PG_DATABASE=${PG_DATABASE:-sharethings}
      PG_USER=${PG_USER:-postgres}
      PG_PASSWORD=${PG_PASSWORD:-postgres}
    fi
    
    # Update docker-compose.yml to include PostgreSQL
    if [ -f docker-compose.yml ]; then
      # Check if postgres service already exists in the file
      if ! grep -q "postgres:" docker-compose.yml; then
        # Append postgres service to docker-compose.yml
        cat >> docker-compose.yml << EOL

  postgres:
    image: postgres:17-alpine
    container_name: share-things-postgres
    environment:
      - POSTGRES_USER=${PG_USER}
      - POSTGRES_PASSWORD=${PG_PASSWORD}
      - POSTGRES_DB=${PG_DATABASE}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      app_network:
        aliases:
          - postgres

volumes:
  postgres-data:
EOL
        echo -e "${GREEN}Added PostgreSQL service to docker-compose.yml${NC}"
      fi
      
      # Update backend service to depend on postgres
      $SED_CMD '/backend:/,/networks:/s/depends_on:/depends_on:\n      - postgres/' docker-compose.yml
      
      # Add PostgreSQL environment variables to backend service
      $SED_CMD '/backend:/,/networks:/s/environment:/environment:\n      - SESSION_STORAGE_TYPE=postgresql\n      - PG_HOST=postgres\n      - PG_PORT=5432\n      - PG_DATABASE='${PG_DATABASE}'\n      - PG_USER='${PG_USER}'\n      - PG_PASSWORD='${PG_PASSWORD}'\n      - PG_SSL=false/' docker-compose.yml
    fi
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
EOL

  # Add PostgreSQL environment variables if using PostgreSQL
  if [[ $USE_POSTGRES =~ ^[Yy]$ ]] || [ "$SESSION_STORAGE_TYPE" = "postgresql" ]; then
    cat >> docker-compose.prod.temp.yml << EOL
      # PostgreSQL configuration
      - PG_HOST=${PG_HOST:-postgres}
      - PG_PORT=${PG_PORT:-5432}
      - PG_DATABASE=${PG_DATABASE:-sharethings}
      - PG_USER=${PG_USER:-postgres}
      - PG_PASSWORD=${PG_PASSWORD:-postgres}
      - PG_SSL=${PG_SSL:-false}
EOL
  fi

  # Continue with the rest of the file
  cat >> docker-compose.prod.temp.yml << EOL
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
EOL

  # Add depends_on if using PostgreSQL
  if [[ $USE_POSTGRES =~ ^[Yy]$ ]] || [ "$SESSION_STORAGE_TYPE" = "postgresql" ]; then
    cat >> docker-compose.prod.temp.yml << EOL
    depends_on:
      - postgres
EOL
  fi

  # Continue with frontend service
  cat >> docker-compose.prod.temp.yml << EOL

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
EOL

  # Add PostgreSQL service if using PostgreSQL
  if [[ $USE_POSTGRES =~ ^[Yy]$ ]] || [ "$SESSION_STORAGE_TYPE" = "postgresql" ]; then
    cat >> docker-compose.prod.temp.yml << EOL

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
EOL
  fi

  # Add network and volume configuration
  cat >> docker-compose.prod.temp.yml << EOL

# Explicit network configuration
networks:
  app_network:
    driver: bridge
EOL

  # Add volumes if using PostgreSQL
  if [[ $USE_POSTGRES =~ ^[Yy]$ ]] || [ "$SESSION_STORAGE_TYPE" = "postgresql" ]; then
    cat >> docker-compose.prod.temp.yml << EOL

# Volumes for data persistence
volumes:
  postgres-data:
EOL
  fi
}

# Make scripts executable
make_scripts_executable() {
  echo -e "${YELLOW}Making scripts executable...${NC}"
  
  # Make setup scripts executable
  chmod +x setup/*.sh
  
  # Make docker-entrypoint.sh executable if it exists
  if [ -f client/docker-entrypoint.sh ]; then
    chmod +x client/docker-entrypoint.sh
  fi
  
  echo -e "${GREEN}Scripts are now executable.${NC}"
}