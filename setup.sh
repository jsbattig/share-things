#!/bin/bash

# ShareThings Docker Setup Script
# This script helps configure the ShareThings application for Docker deployment

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect OS for sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses BSD sed which requires an extension argument for -i
    # Use a temporary file approach instead of creating backup files with ''
    SED_CMD="sed -i.bak"
else
    # Linux and others use GNU sed
    SED_CMD="sed -i"
fi

echo -e "${BLUE}=== ShareThings Docker Setup ===${NC}"
echo "This script will help you configure the ShareThings application for Docker deployment."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker before running this script."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    echo "Please install Docker Compose before running this script."
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

# Ask for hostname
read -p "Enter your hostname (e.g., example.com or localhost): " HOSTNAME
HOSTNAME=${HOSTNAME:-localhost}

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
    $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
    $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" .env
    
    # Update client/.env file
    $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
    $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
    
    # Update server/.env file
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" server/.env
    
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
    $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}|g" .env
    $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" .env
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" .env
    
    # Update client/.env file
    $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
    $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
    
    # Update server/.env file
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" server/.env
    
    echo -e "${GREEN}Updated configuration files with standard ports.${NC}"
fi

# Ask if want to expose ports to host
read -p "Do you want to expose container ports to the host? (y/n): " EXPOSE_PORTS
if [[ $EXPOSE_PORTS =~ ^[Yy]$ ]]; then
    read -p "Enter the frontend port to expose (default: 8080): " FRONTEND_PORT
    FRONTEND_PORT=${FRONTEND_PORT:-8080}
    
    read -p "Enter the backend port to expose (default: 3001): " BACKEND_PORT
    BACKEND_PORT=${BACKEND_PORT:-3001}
    
    # Uncomment and update port mappings in .env
    $SED_CMD "s|# FRONTEND_PORT=8080|FRONTEND_PORT=${FRONTEND_PORT}|g" .env
    $SED_CMD "s|# BACKEND_PORT=3001|BACKEND_PORT=${BACKEND_PORT}|g" .env
    
    # Update docker-compose.yml to include port mappings
    if ! grep -q "ports:" docker-compose.yml; then
        # Add port mappings to backend service
        $SED_CMD "/healthcheck:/i \ \ \ \ ports:\n      - \"\${BACKEND_PORT}:3001\"" docker-compose.yml
        
        # Add port mappings to frontend service
        $SED_CMD "/frontend:/,/healthcheck:/ s/healthcheck:/ports:\n      - \"\${FRONTEND_PORT}:80\"\n    healthcheck:/" docker-compose.yml
    fi
    
    echo -e "${GREEN}Updated docker-compose.yml with port mappings.${NC}"
fi

echo ""
echo -e "${BLUE}=== HAProxy Configuration ===${NC}"
echo "A template HAProxy configuration file (haproxy.cfg.template) has been provided."
echo "You'll need to update it with your specific settings:"

if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
    echo "1. Replace 'docker-host' with your Docker host IP or hostname"
    echo "2. Ensure the ports match your configuration (client: ${CLIENT_PORT}, API: ${API_PORT})"
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        echo "3. Uncomment the SSL configuration lines"
        echo "4. Update the SSL certificate path"
    fi
else
    echo "1. Replace 'docker-host' with your Docker host IP or hostname"
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        echo "2. Uncomment the SSL configuration lines"
        echo "3. Update the SSL certificate path"
    fi
fi

echo ""
echo -e "${BLUE}=== Build and Start Containers ===${NC}"
read -p "Do you want to build and start the containers now? (y/n): " START_CONTAINERS
if [[ $START_CONTAINERS =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Building containers...${NC}"
    docker-compose build
    
    echo -e "${YELLOW}Starting containers...${NC}"
    docker-compose up -d
    
    echo -e "${GREEN}Containers are now running!${NC}"
    echo ""
    echo -e "${BLUE}=== Next Steps ===${NC}"
    
    if [[ $EXPOSE_PORTS =~ ^[Yy]$ ]]; then
        echo "You can access the application at:"
        echo "- Frontend: ${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT}"
        echo "- Backend: ${PROTOCOL}://${HOSTNAME}:${BACKEND_PORT}"
    else
        echo "The containers are running, but ports are not exposed to the host."
        echo "Make sure your HAProxy is properly configured to route traffic to the containers."
    fi
else
    echo -e "${BLUE}=== Next Steps ===${NC}"
    echo "When you're ready, build and start the containers with:"
    echo "  docker-compose build"
    echo "  docker-compose up -d"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"

# Clean up any backup files created by sed
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi