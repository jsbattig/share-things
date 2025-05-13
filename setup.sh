#!/bin/bash

# ShareThings Container Setup Script
# This script helps configure the ShareThings application for container deployment
# Compatible with Docker and Podman

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility and container engine
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses BSD sed which requires an extension argument for -i
    # Use a temporary file approach instead of creating backup files with ''
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

# Determine which container engine to use
read -p "Which container engine do you want to use? (docker/podman) [${DEFAULT_ENGINE}]: " CONTAINER_ENGINE
CONTAINER_ENGINE=${CONTAINER_ENGINE:-$DEFAULT_ENGINE}

# Set compose command based on container engine
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    COMPOSE_CMD="podman-compose"
    CONTAINER_CMD="podman"
else
    COMPOSE_CMD="docker-compose"
    CONTAINER_CMD="docker"
fi

echo -e "${BLUE}=== ShareThings ${CONTAINER_ENGINE^} Setup ===${NC}"
echo "This script will help you configure the ShareThings application for ${CONTAINER_ENGINE^} deployment."
echo ""

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

# Check if the selected container engine is installed
if ! command -v $CONTAINER_CMD &> /dev/null; then
    echo -e "${RED}Error: ${CONTAINER_ENGINE^} is not installed.${NC}"
    echo "Please install ${CONTAINER_ENGINE^} before running this script."
    exit 1
fi

# Check if the appropriate compose tool is installed
if ! command -v $COMPOSE_CMD &> /dev/null; then
    echo -e "${RED}Error: ${COMPOSE_CMD} is not installed.${NC}"
    echo "Please install ${COMPOSE_CMD} before running this script."
    exit 1
fi

# Create .env file from template if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}Created .env file.${NC}"
else
    echo -e "${YELLOW}.env file already exists. Skipping...${NC}"
fi

# Create client/.env file from template if it doesn't exist
if [ ! -f client/.env ]; then
    echo -e "${YELLOW}Creating client/.env file from template...${NC}"
    cp client/.env.example client/.env
    echo -e "${GREEN}Created client/.env file.${NC}"
else
    echo -e "${YELLOW}client/.env file already exists. Skipping...${NC}"
fi

# Create server/.env file from template if it doesn't exist
if [ ! -f server/.env ]; then
    echo -e "${YELLOW}Creating server/.env file from template...${NC}"
    cp server/.env.example server/.env
    echo -e "${GREEN}Created server/.env file.${NC}"
else
    echo -e "${YELLOW}server/.env file already exists. Skipping...${NC}"
fi

echo ""
echo -e "${BLUE}=== Configuration ===${NC}"

# Hostname Configuration with explanation
echo -e "${BLUE}=== Hostname Configuration ===${NC}"
echo "The hostname can be provided manually or automatically determined at runtime."
echo ""
echo "1. If you provide a hostname, it will be used for all configurations"
echo "2. If you leave it blank, the application will auto-detect the hostname"
echo ""
echo "Use cases for different hostname values:"
echo "- 'localhost': For local development only"
echo "- IP address: For accessing from other machines on your network"
echo "- Domain name: For production deployments with a real domain"
echo "- Leave blank: For automatic detection (recommended)"
echo ""
read -p "Enter your hostname (or leave blank for auto-detection): " HOSTNAME

if [ -z "$HOSTNAME" ]; then
    echo -e "${GREEN}Using automatic hostname detection${NC}"
    HOSTNAME="auto"
else
    echo -e "${GREEN}Using hostname: ${HOSTNAME}${NC}"
fi

# Ask if using custom ports
read -p "Are you using custom ports for HAProxy? (y/n): " USE_CUSTOM_PORTS
if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
    read -p "Enter the client app port (default: 15000): " CLIENT_PORT
    CLIENT_PORT=${CLIENT_PORT:-15000}
    
    read -p "Enter the API port (default: 15001): " API_PORT
    API_PORT=${API_PORT:-15001}
    
    # Ask if using HTTPS
    read -p "Are you using HTTPS? (y/n): " USE_HTTPS
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        PROTOCOL="https"
    else
        PROTOCOL="http"
    fi
    
    # Update .env file
    # Update .env file
    if [ "$HOSTNAME" = "auto" ]; then
        $SED_CMD "s|API_URL=http://localhost|API_URL=auto|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=auto|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" .env
        
        # Add API_PORT to .env
        if ! grep -q "API_PORT" .env; then
            echo "API_PORT=${API_PORT}" >> .env
        else
            $SED_CMD "s|API_PORT=.*|API_PORT=${API_PORT}|g" .env
        fi
    else
        $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" .env
    fi
    
    # Update client/.env file
    if [ "$HOSTNAME" = "auto" ]; then
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=auto|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=auto|g" client/.env
        
        # Add VITE_API_PORT to client/.env
        if ! grep -q "VITE_API_PORT" client/.env; then
            echo "VITE_API_PORT=${API_PORT}" >> client/.env
        else
            $SED_CMD "s|VITE_API_PORT=.*|VITE_API_PORT=${API_PORT}|g" client/.env
        fi
    else
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
    fi
    
    # Update server/.env file
    if [ "$HOSTNAME" = "auto" ]; then
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" server/.env
    else
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" server/.env
    fi
    
    echo -e "${GREEN}Updated configuration files with custom ports.${NC}"
else
    # Ask if using HTTPS
    read -p "Are you using HTTPS? (y/n): " USE_HTTPS
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        PROTOCOL="https"
    else
        PROTOCOL="http"
    fi
    
    # Update .env file
    if [ "$HOSTNAME" = "auto" ]; then
        $SED_CMD "s|API_URL=http://localhost|API_URL=auto|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=auto|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" .env
    else
        $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" .env
    fi
    
    # Update client/.env file
    if [ "$HOSTNAME" = "auto" ]; then
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=auto|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=auto|g" client/.env
    else
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
    fi
    
    # Update server/.env file
    if [ "$HOSTNAME" = "auto" ]; then
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" server/.env
    else
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" server/.env
    fi
    
    echo -e "${GREEN}Updated configuration files with standard ports.${NC}"
fi

# Ask if want to expose ports to host
read -p "Do you want to expose container ports to the host? (y/n): " EXPOSE_PORTS
if [[ $EXPOSE_PORTS =~ ^[Yy]$ ]]; then
    # If custom HAProxy ports were configured, use those directly
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        FRONTEND_PORT=${CLIENT_PORT:-15000}
        BACKEND_PORT=${API_PORT:-15001}
        echo -e "${GREEN}Using custom ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}${NC}"
    else
        # Only ask for port configuration if custom ports weren't already specified
        DEFAULT_FRONTEND_PORT=8080
        DEFAULT_BACKEND_PORT=3001
        
        read -p "Enter the frontend port to expose (default: ${DEFAULT_FRONTEND_PORT}): " FRONTEND_PORT
        FRONTEND_PORT=${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}
        
        read -p "Enter the backend port to expose (default: ${DEFAULT_BACKEND_PORT}): " BACKEND_PORT
        BACKEND_PORT=${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}
    fi
    
    # Uncomment and update port mappings in .env
    # First check if the variables already exist in the .env file
    if grep -q "^FRONTEND_PORT=" .env; then
        # Update existing variables
        $SED_CMD "s|^FRONTEND_PORT=.*|FRONTEND_PORT=${FRONTEND_PORT}|g" .env
        $SED_CMD "s|^BACKEND_PORT=.*|BACKEND_PORT=${BACKEND_PORT}|g" .env
    elif grep -q "# FRONTEND_PORT=" .env; then
        # Uncomment and update commented variables
        $SED_CMD "s|# FRONTEND_PORT=.*|FRONTEND_PORT=${FRONTEND_PORT}|g" .env
        $SED_CMD "s|# BACKEND_PORT=.*|BACKEND_PORT=${BACKEND_PORT}|g" .env
    else
        # Add the variables if they don't exist
        echo "FRONTEND_PORT=${FRONTEND_PORT}" >> .env
        echo "BACKEND_PORT=${BACKEND_PORT}" >> .env
    fi
    
    # Print the current port configuration for verification
    echo -e "${GREEN}Port configuration in .env file:${NC}"
    grep -E "^FRONTEND_PORT=|^BACKEND_PORT=" .env || echo "Port variables not found in .env file"
    
    # Update nginx.conf to use the custom backend port
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Updating nginx.conf to use custom backend port...${NC}"
        # Create a backup of the nginx.conf file
        cp client/nginx.conf client/nginx.conf.bak
        # Update the proxy_pass directives to use the custom port
        $SED_CMD "s|http://backend:3001|http://backend:${API_PORT}|g" client/nginx.conf
        echo -e "${GREEN}Updated nginx.conf with custom backend port.${NC}"
        
        # Update set-backend-url.js to use the custom port
        echo -e "${YELLOW}Updating set-backend-url.js to use custom backend port...${NC}"
        if [ -f client/set-backend-url.js ]; then
            # Create a backup of the set-backend-url.js file
            cp client/set-backend-url.js client/set-backend-url.js.bak
            # Update the hardcoded port in the script
            $SED_CMD "s|:3001|:${API_PORT}|g" client/set-backend-url.js
            echo -e "${GREEN}Updated set-backend-url.js with custom backend port.${NC}"
            
            # Check if Node.js is installed before running the script
            if command -v node &> /dev/null; then
                # Run the set-backend-url.js script to update the client/.env file
                echo -e "${YELLOW}Running set-backend-url.js to update client/.env...${NC}"
                (cd client && API_PORT=${API_PORT} node set-backend-url.js)
                echo -e "${GREEN}Updated client/.env with custom backend port.${NC}"
            else
                echo -e "${YELLOW}Node.js not found. Manually updating client/.env and client/.env.backend...${NC}"
                # Manually update the client/.env file
                if [ -f client/.env ]; then
                    $SED_CMD "s|:3001|:${API_PORT}|g" client/.env
                    echo -e "${GREEN}Manually updated client/.env with custom backend port.${NC}"
                else
                    echo -e "${RED}client/.env file not found. Cannot update.${NC}"
                fi
                
                # Also manually update the client/.env.backend file
                if [ -f client/.env.backend ]; then
                    $SED_CMD "s|:3001|:${API_PORT}|g" client/.env.backend
                    echo -e "${GREEN}Manually updated client/.env.backend with custom backend port.${NC}"
                else
                    # Create the file if it doesn't exist
                    if command -v hostname &> /dev/null; then
                        HOST_IP=$(hostname -I | awk '{print $1}')
                    else
                        HOST_IP="localhost"
                    fi
                    echo "BACKEND_URL=http://${HOST_IP}:${API_PORT}" > client/.env.backend
                    echo -e "${GREEN}Created client/.env.backend with custom backend port.${NC}"
                fi
            fi
        else
            echo -e "${RED}client/set-backend-url.js file not found. Manually updating files.${NC}"
            # Manually update the client/.env file
            if [ -f client/.env ]; then
                $SED_CMD "s|:3001|:${API_PORT}|g" client/.env
                echo -e "${GREEN}Manually updated client/.env with custom backend port.${NC}"
            else
                echo -e "${RED}client/.env file not found. Cannot update.${NC}"
            fi
            
            # Also manually update the client/.env.backend file
            if [ -f client/.env.backend ]; then
                $SED_CMD "s|:3001|:${API_PORT}|g" client/.env.backend
                echo -e "${GREEN}Manually updated client/.env.backend with custom backend port.${NC}"
            else
                # Create the file if it doesn't exist
                if command -v hostname &> /dev/null; then
                    HOST_IP=$(hostname -I | awk '{print $1}')
                else
                    HOST_IP="localhost"
                fi
                echo "BACKEND_URL=http://${HOST_IP}:${API_PORT}" > client/.env.backend
                echo -e "${GREEN}Created client/.env.backend with custom backend port.${NC}"
            fi
        fi
    fi
    
    # Skip modifying docker-compose.yml directly since we'll be using a temporary file
    # This avoids errors when the file doesn't exist
    echo -e "${GREEN}Port configuration set. Will be applied when creating containers.${NC}"
fi

echo ""
echo -e "${BLUE}=== HAProxy Configuration ===${NC}"
echo "A template HAProxy configuration file (haproxy.cfg.template) has been provided."
echo "You'll need to update it with your specific settings:"

if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
    echo "1. Replace 'docker-host' with your container host IP or hostname"
    echo "2. Ensure the ports match your configuration (client: ${CLIENT_PORT}, API: ${API_PORT})"
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        echo "3. Uncomment the SSL configuration lines"
        echo "4. Update the SSL certificate path"
    fi
else
    echo "1. Replace 'docker-host' with your container host IP or hostname"
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        echo "2. Uncomment the SSL configuration lines"
        echo "3. Update the SSL certificate path"
    fi
fi

# Add specific notes for Podman on Rocky Linux
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo ""
    echo -e "${BLUE}=== Podman Notes ===${NC}"
    echo "1. Make sure podman-compose is installed (on Rocky Linux: 'sudo dnf install podman-compose')"
    echo "2. For port mapping issues, ensure you're using the format 'hostPort:containerPort' without any 'z' suffix"
    echo "3. If using rootless Podman, you may need to configure user namespaces"
    echo "4. For SELinux issues, you can use 'chcon' to set the correct context on volumes"
    echo "5. Consider using 'podman generate systemd' to create service files for auto-start"
    
    # Add specific warning about port mapping format for Podman
    echo ""
    echo -e "${YELLOW}Important Note for Podman Port Mappings:${NC}"
    echo "If you encounter errors like 'cannot parse \"3001\" as an IP address', check your compose file"
    echo "and ensure port mappings are in the format 'hostPort:containerPort' without any 'z' suffix."
    
fi

echo ""
echo -e "${BLUE}=== Build and Start Containers ===${NC}"
read -p "Do you want to build and start the containers now? (y/n): " START_CONTAINERS
if [[ $START_CONTAINERS =~ ^[Yy]$ ]]; then
    # Ask if running in production mode
    read -p "Do you want to run in production mode (no volume mounts)? (y/n): " PRODUCTION_MODE
    
    if [[ $PRODUCTION_MODE =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Creating temporary production docker-compose file without volume mounts...${NC}"
        # Create a temporary docker-compose file for production without volume mounts
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

  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT}
    container_name: share-things-frontend
    environment:
      - API_PORT=${API_PORT:-15001}
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

# Explicit network configuration
networks:
  app_network:
    driver: bridge
EOL
        echo -e "${GREEN}Temporary production docker-compose file created.${NC}"
        
        echo -e "${YELLOW}Building containers in production mode...${NC}"
        $COMPOSE_CMD -f docker-compose.prod.temp.yml build
        
        echo -e "${YELLOW}Starting containers in production mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}${NC}"
        
        # Ensure environment variables are passed to the compose command
        if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
            # For podman-compose, we need to explicitly pass the environment variables
            FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT $COMPOSE_CMD -f docker-compose.prod.temp.yml up -d
        else
            # For docker-compose, the .env file should be automatically loaded
            $COMPOSE_CMD -f docker-compose.prod.temp.yml up -d
        fi
        
        # Store the compose file name for later use
        COMPOSE_FILE="docker-compose.prod.temp.yml"
    else
        echo -e "${YELLOW}Building containers in development mode...${NC}"
        $COMPOSE_CMD build
        
        echo -e "${YELLOW}Starting containers in development mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}${NC}"
        
        # Ensure environment variables are passed to the compose command
        if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
            # For podman-compose, we need to explicitly pass the environment variables
            FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT $COMPOSE_CMD up -d
        else
            # For docker-compose, the .env file should be automatically loaded
            $COMPOSE_CMD up -d
        fi
        
        # Store the compose file name for later use
        COMPOSE_FILE="docker-compose.yml"
    fi
    
    # Check if containers are actually running
    echo -e "${YELLOW}Checking container status...${NC}"
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        echo "Running: podman ps --filter label=io.podman.compose.project=share-things"
        podman ps --filter label=io.podman.compose.project=share-things
        
        # Count running containers
        RUNNING_COUNT=$(podman ps --filter label=io.podman.compose.project=share-things | grep -c "share-things" || echo "0")
        if [ "$RUNNING_COUNT" -ge "2" ]; then
            echo -e "${GREEN}Containers are running successfully!${NC}"
            
            # Check container logs for errors
            echo -e "${YELLOW}Checking container logs for errors...${NC}"
            echo "Backend container logs:"
            podman logs share-things-backend --tail 10
            
            echo "Frontend container logs:"
            podman logs share-things-frontend --tail 10
        else
            echo -e "${RED}Warning: Not all containers appear to be running.${NC}"
            echo "You can check container logs with: podman logs <container_name>"
            
            # Show logs for troubleshooting
            echo -e "${YELLOW}Checking container logs for errors...${NC}"
            echo "Backend container logs:"
            podman logs share-things-backend --tail 20 2>/dev/null || echo "No logs available for backend container"
            
            echo "Frontend container logs:"
            podman logs share-things-frontend --tail 20 2>/dev/null || echo "No logs available for frontend container"
        fi
    else
        echo "Running: docker ps --filter label=com.docker.compose.project=share-things"
        docker ps --filter label=com.docker.compose.project=share-things
        
        # Count running containers
        RUNNING_COUNT=$(docker ps --filter label=com.docker.compose.project=share-things | grep -c "share-things" || echo "0")
        if [ "$RUNNING_COUNT" -ge "2" ]; then
            echo -e "${GREEN}Containers are running successfully!${NC}"
            
            # Check container logs for errors
            echo -e "${YELLOW}Checking container logs for errors...${NC}"
            echo "Backend container logs:"
            docker logs share-things-backend --tail 10
            
            echo "Frontend container logs:"
            docker logs share-things-frontend --tail 10
        else
            echo -e "${RED}Warning: Not all containers appear to be running.${NC}"
            echo "You can check container logs with: docker logs <container_name>"
            
            # Show logs for troubleshooting
            echo -e "${YELLOW}Checking container logs for errors...${NC}"
            echo "Backend container logs:"
            docker logs share-things-backend --tail 20 2>/dev/null || echo "No logs available for backend container"
            
            echo "Frontend container logs:"
            docker logs share-things-frontend --tail 20 2>/dev/null || echo "No logs available for frontend container"
        fi
    fi
    
    echo ""
    echo -e "${BLUE}=== Next Steps ===${NC}"
    
    if [[ $EXPOSE_PORTS =~ ^[Yy]$ ]]; then
        echo "You can access the application at:"
        echo "- Frontend: ${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT} (container port 80)"
        echo "- Backend: ${PROTOCOL}://${HOSTNAME}:${BACKEND_PORT} (container port 3001)"
        
        # For Podman, verify that the correct ports are being used
        if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
            echo ""
            echo -e "${YELLOW}Verifying port mappings:${NC}"
            podman port share-things-frontend
            podman port share-things-backend
        fi
        
        # Display mode information
        if [[ $PRODUCTION_MODE =~ ^[Yy]$ ]]; then
            echo ""
            echo -e "${GREEN}Running in production mode (no volume mounts).${NC}"
            echo "This means the containers are using the built files from the Dockerfile."
            echo "Any changes to the source code will require rebuilding the containers."
        else
            echo ""
            echo -e "${YELLOW}Running in development mode (with volume mounts).${NC}"
            echo "This means the containers are using the local source code."
            echo "Changes to the source code will be reflected in the containers."
            echo ""
            echo -e "${YELLOW}Note for Podman users:${NC}"
            echo "If you encounter errors like 'Cannot find module '/app/dist/index.js'', try:"
            echo "1. Stop the containers: podman-compose down"
            echo "2. Restart in production mode: ./setup.sh"
            echo "   - Answer 'yes' to 'Do you want to run in production mode?'"
        fi
    else
        echo "The containers are running, but ports are not exposed to the host."
        echo "Make sure your HAProxy is properly configured to route traffic to the containers."
    fi
else
    echo -e "${BLUE}=== Next Steps ===${NC}"
    echo "When you're ready, build and start the containers with:"
    echo "  ${COMPOSE_CMD} build"
    echo "  ${COMPOSE_CMD} up -d"
    echo ""
    echo "To check if containers are running:"
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        echo "  podman ps --filter label=io.podman.compose.project=share-things"
    else
        echo "  docker ps --filter label=com.docker.compose.project=share-things"
    fi
    echo ""
    echo "To view container logs:"
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        echo "  podman logs share-things_frontend_1"
        echo "  podman logs share-things_backend_1"
    else
        echo "  docker logs share-things_frontend_1"
        echo "  docker logs share-things_backend_1"
    fi
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"

# Add a function to check container status at any time
echo ""
echo -e "${BLUE}=== Container Status Check ===${NC}"
echo "You can check container status at any time by running:"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo "  podman ps --filter label=io.podman.compose.project=share-things"
    echo ""
    echo "If containers aren't running, you can view error logs with:"
    echo "  podman logs share-things_frontend_1"
    echo "  podman logs share-things_backend_1"
    echo ""
    echo "To restart the containers:"
    echo "  cd $(pwd) && podman-compose down && podman-compose up -d"
else
    echo "  docker ps --filter label=com.docker.compose.project=share-things"
    echo ""
    echo "If containers aren't running, you can view error logs with:"
    echo "  docker logs share-things_frontend_1"
    echo "  docker logs share-things_backend_1"
    echo ""
    echo "To restart the containers:"
    echo "  cd $(pwd) && docker-compose down && docker-compose up -d"
fi

# Add specific troubleshooting for common issues

# Clean up any backup files created by sed
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi