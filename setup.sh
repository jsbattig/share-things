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
    # If custom HAProxy ports were configured, use those as defaults
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        DEFAULT_FRONTEND_PORT=${CLIENT_PORT:-8080}
        DEFAULT_BACKEND_PORT=${API_PORT:-3001}
    else
        DEFAULT_FRONTEND_PORT=8080
        DEFAULT_BACKEND_PORT=3001
    fi
    
    read -p "Enter the frontend port to expose (default: ${DEFAULT_FRONTEND_PORT}): " FRONTEND_PORT
    FRONTEND_PORT=${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}
    
    read -p "Enter the backend port to expose (default: ${DEFAULT_BACKEND_PORT}): " BACKEND_PORT
    BACKEND_PORT=${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}
    
    # Uncomment and update port mappings in .env
    $SED_CMD "s|# FRONTEND_PORT=8080|FRONTEND_PORT=${FRONTEND_PORT}|g" .env
    $SED_CMD "s|# BACKEND_PORT=3001|BACKEND_PORT=${BACKEND_PORT}|g" .env
    
    # Determine which compose file to use
    COMPOSE_FILE="docker-compose.yml"
    if [[ "$CONTAINER_ENGINE" == "podman" ]] && [ -f "podman-compose.yml" ]; then
        COMPOSE_FILE="podman-compose.yml"
    fi
    
    # Update compose file to include port mappings
    if ! grep -q "ports:" $COMPOSE_FILE; then
        # Add port mappings to backend service
        $SED_CMD "/healthcheck:/i \ \ \ \ ports:\n      - \"\${BACKEND_PORT}:3001\"" $COMPOSE_FILE
        
        # Add port mappings to frontend service
        $SED_CMD "/frontend:/,/healthcheck:/ s/healthcheck:/ports:\n      - \"\${FRONTEND_PORT}:80\"\n    healthcheck:/" $COMPOSE_FILE
    else
        # Update existing port mappings if they exist
        $SED_CMD "s/- \"[^\"]*:3001\"/- \"\${BACKEND_PORT}:3001\"/g" $COMPOSE_FILE
        $SED_CMD "s/- \"[^\"]*:80\"/- \"\${FRONTEND_PORT}:80\"/g" $COMPOSE_FILE
    fi
    
    # For Podman in rootless mode on SELinux systems like Rocky Linux,
    # we need to add the :z suffix to volume mounts
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        # Check for SELinux
        if grep -q "SELinux" /etc/os-release || [ -f /etc/rocky-release ] || command -v getenforce &> /dev/null; then
            # Check if SELinux is enforcing
            SELINUX_ENFORCING=false
            if command -v getenforce &> /dev/null && [ "$(getenforce)" == "Enforcing" ]; then
                SELINUX_ENFORCING=true
            elif [ -f /etc/rocky-release ]; then
                # Rocky Linux typically has SELinux enabled by default
                SELINUX_ENFORCING=true
            fi
            
            if [ "$SELINUX_ENFORCING" = true ]; then
                echo -e "${YELLOW}Detected SELinux system, updating volume mounts for Podman...${NC}"
                # Add :z suffix to volume mounts but NOT to port mappings
                # Look for lines with volume mount patterns (not containing $ for port variables and not in quotes)
                $SED_CMD '/ports:/,/^[^ ]/ {b}; s/\(- [^"$]*:.*\):/\1:z:/g' $COMPOSE_FILE
                echo -e "${GREEN}Updated volume mounts for SELinux compatibility.${NC}"
            fi
        fi
        
        # Add note about Podman networking
        echo -e "${YELLOW}Note: Podman in rootless mode may have different networking behavior than Docker.${NC}"
        echo -e "${YELLOW}If you experience connectivity issues, you may need to configure Podman networking.${NC}"
        
        # Fix any port mappings that might have been incorrectly modified with :z: format
        echo -e "${YELLOW}Checking for and fixing any incorrect port mappings...${NC}"
        # This fixes patterns like "8080:z:80" to "8080:80" in the ports section
        $SED_CMD '/ports:/,/^[^ ]/ s/"\([^:]*\):z:\([^"]*\)"/"\1:\2"/g' $COMPOSE_FILE
        # This fixes patterns like "${PORT}:z:80" to "${PORT}:80" in the ports section
        $SED_CMD '/ports:/,/^[^ ]/ s/"\(\\${[^}]*}\):z:\([^"]*\)"/"\1:\2"/g' $COMPOSE_FILE
        
        # For Podman, we need to ensure the port format is correct (no z suffix)
        # This is a more aggressive fix that ensures the port format is exactly hostPort:containerPort
        $SED_CMD '/ports:/,/^[^ ]/ s/".*\(:[^:"]*\)"/"${BACKEND_PORT}\1"/g' $COMPOSE_FILE
        $SED_CMD '/ports:/,/^[^ ]/ s/".*\(:80\)"/"${FRONTEND_PORT}\1"/g' $COMPOSE_FILE
        
        echo -e "${GREEN}Port mapping format checked and fixed if needed.${NC}"
    fi
    
    echo -e "${GREEN}Updated ${COMPOSE_FILE} with port mappings.${NC}"
    
    # Display the current port mappings in the compose file
    echo ""
    echo -e "${BLUE}=== Current Port Mappings in ${COMPOSE_FILE} ===${NC}"
    echo "Checking current port mappings in the compose file..."
    
    # Extract and display port mappings
    BACKEND_PORTS=$(grep -A 3 "ports:" $COMPOSE_FILE | grep -o '"[^"]*"' | grep ":" || echo "No backend port mappings found")
    FRONTEND_PORTS=$(grep -A 10 "frontend:" $COMPOSE_FILE | grep -A 5 "ports:" | grep -o '"[^"]*"' | grep ":" || echo "No frontend port mappings found")
    
    echo -e "${YELLOW}Backend port mappings:${NC}"
    echo "$BACKEND_PORTS"
    echo -e "${YELLOW}Frontend port mappings:${NC}"
    echo "$FRONTEND_PORTS"
    
    # Warn if port mappings contain 'z'
    if echo "$BACKEND_PORTS$FRONTEND_PORTS" | grep -q "z"; then
        echo -e "${RED}Warning: Port mappings contain 'z' which may cause issues with Podman.${NC}"
        echo "You may need to manually edit the compose file to fix this."
    else
        echo -e "${GREEN}Port mappings format looks correct.${NC}"
    fi
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
    
    # Add direct fix option for the specific error shown in the screenshot
    echo ""
    echo -e "${BLUE}=== Direct Fix for Port Mapping Errors ===${NC}"
    read -p "Are you seeing 'cannot parse \"3001\" as an IP address' errors? (y/n): " FIX_PORT_ERRORS
    if [[ $FIX_PORT_ERRORS =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Applying direct fix to $COMPOSE_FILE...${NC}"
        
        # Create a backup of the compose file
        cp $COMPOSE_FILE "${COMPOSE_FILE}.bak"
        echo "Backup created at ${COMPOSE_FILE}.bak"
        
        # Direct fix for the specific error pattern seen in the screenshot
        $SED_CMD 's/-p [0-9]*:z:[0-9]* /-p \1:\2 /g' $COMPOSE_FILE
        $SED_CMD 's/\(".*\):z:\(.*"\)/\1:\2/g' $COMPOSE_FILE
        
        # More aggressive fix that replaces the entire port mapping lines
        if [[ $EXPOSE_PORTS =~ ^[Yy]$ ]]; then
            # Replace backend port mapping
            $SED_CMD "/backend.*-p/ s/-p [^ ]* /-p ${BACKEND_PORT}:3001 /g" $COMPOSE_FILE
            # Replace frontend port mapping
            $SED_CMD "/frontend.*-p/ s/-p [^ ]* /-p ${FRONTEND_PORT}:80 /g" $COMPOSE_FILE
        fi
        
        echo -e "${GREEN}Direct fix applied. Please try running the containers again.${NC}"
    else
        echo -e "${YELLOW}For Rocky Linux with Podman, you might need to manually edit the compose file:${NC}"
        echo "1. Open $COMPOSE_FILE in a text editor"
        echo "2. Find the port mappings sections (under 'ports:')"
        echo "3. Ensure they look like: - \"\${FRONTEND_PORT}:80\" and - \"\${BACKEND_PORT}:3001\""
        echo "4. Remove any 'z' characters in the port mappings"
    fi
fi

echo ""
echo -e "${BLUE}=== Build and Start Containers ===${NC}"
read -p "Do you want to build and start the containers now? (y/n): " START_CONTAINERS
if [[ $START_CONTAINERS =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Building containers...${NC}"
    $COMPOSE_CMD build
    
    echo -e "${YELLOW}Starting containers...${NC}"
    $COMPOSE_CMD up -d
    
    # Check if containers are actually running
    echo -e "${YELLOW}Checking container status...${NC}"
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        echo "Running: podman ps --filter label=io.podman.compose.project=share-things"
        podman ps --filter label=io.podman.compose.project=share-things
        
        # Count running containers
        RUNNING_COUNT=$(podman ps --filter label=io.podman.compose.project=share-things | grep -c "share-things" || echo "0")
        if [ "$RUNNING_COUNT" -ge "2" ]; then
            echo -e "${GREEN}Containers are running successfully!${NC}"
        else
            echo -e "${RED}Warning: Not all containers appear to be running.${NC}"
            echo "You can check container logs with: podman logs <container_name>"
        fi
    else
        echo "Running: docker ps --filter label=com.docker.compose.project=share-things"
        docker ps --filter label=com.docker.compose.project=share-things
        
        # Count running containers
        RUNNING_COUNT=$(docker ps --filter label=com.docker.compose.project=share-things | grep -c "share-things" || echo "0")
        if [ "$RUNNING_COUNT" -ge "2" ]; then
            echo -e "${GREEN}Containers are running successfully!${NC}"
        else
            echo -e "${RED}Warning: Not all containers appear to be running.${NC}"
            echo "You can check container logs with: docker logs <container_name>"
        fi
    fi
    
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
echo ""
echo -e "${BLUE}=== Troubleshooting Common Issues ===${NC}"
echo "Based on your logs, here are solutions for common issues:"

echo -e "${YELLOW}Issue 1: Frontend error 'host not found in upstream \"backend\"'${NC}"
echo "This is a container networking issue. The frontend container can't resolve the backend service name."
echo "Solution:"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo "1. Get the backend container's IP address:"
    echo "   BACKEND_IP=\$(podman inspect -f '{{.NetworkSettings.IPAddress}}' share-things_backend_1)"
    echo "2. Add an entry to the frontend container's /etc/hosts file:"
    echo "   podman exec share-things_frontend_1 sh -c \"echo \$BACKEND_IP backend >> /etc/hosts\""
    echo "3. Restart nginx in the frontend container:"
    echo "   podman exec share-things_frontend_1 nginx -s reload"
    echo ""
    echo "One-line fix command:"
    echo "   podman exec share-things_frontend_1 sh -c \"echo \$(podman inspect -f '{{.NetworkSettings.IPAddress}}' share-things_backend_1) backend >> /etc/hosts && nginx -s reload\""
else
    echo "1. Get the backend container's IP address:"
    echo "   BACKEND_IP=\$(docker inspect -f '{{.NetworkSettings.IPAddress}}' share-things_backend_1)"
    echo "2. Add an entry to the frontend container's /etc/hosts file:"
    echo "   docker exec share-things_frontend_1 sh -c \"echo \$BACKEND_IP backend >> /etc/hosts\""
    echo "3. Restart nginx in the frontend container:"
    echo "   docker exec share-things_frontend_1 nginx -s reload"
    echo ""
    echo "One-line fix command:"
    echo "   docker exec share-things_frontend_1 sh -c \"echo \$(docker inspect -f '{{.NetworkSettings.IPAddress}}' share-things_backend_1) backend >> /etc/hosts && nginx -s reload\""
fi

echo -e "${YELLOW}Issue 2: Backend error 'Cannot find module '/app/dist/index.js''${NC}"
echo "This means the build process didn't complete correctly in the backend container."
echo "Solution:"
if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
    echo "1. Check if the dist directory exists:"
    echo "   podman exec share-things_backend_1 ls -la /app"
    echo "2. Manually run the build process inside the container:"
    echo "   podman exec -it share-things_backend_1 sh -c 'cd /app && npm run build'"
    echo "3. Restart the backend container:"
    echo "   podman restart share-things_backend_1"
    echo ""
    echo "Alternative: Rebuild the backend container:"
    echo "   podman-compose build backend && podman-compose up -d backend"
else
    echo "1. Check if the dist directory exists:"
    echo "   docker exec share-things_backend_1 ls -la /app"
    echo "2. Manually run the build process inside the container:"
    echo "   docker exec -it share-things_backend_1 sh -c 'cd /app && npm run build'"
    echo "3. Restart the backend container:"
    echo "   docker restart share-things_backend_1"
    echo ""
    echo "Alternative: Rebuild the backend container:"
    echo "   docker-compose build backend && docker-compose up -d backend"
fi

# Add option to run troubleshooting now
echo ""
echo -e "${BLUE}=== Run Troubleshooting Now? ===${NC}"
read -p "Would you like to run troubleshooting for these issues now? (y/n): " RUN_TROUBLESHOOTING
if [[ $RUN_TROUBLESHOOTING =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Running troubleshooting steps...${NC}"
    
    if [[ "$CONTAINER_ENGINE" == "podman" ]]; then
        # Check if containers are running
        echo "Checking container status..."
        podman ps --filter label=io.podman.compose.project=share-things
        
        # Get container IPs
        echo "Getting container IPs..."
        BACKEND_IP=$(podman inspect -f '{{.NetworkSettings.IPAddress}}' share-things_backend_1 2>/dev/null || echo "Container not found")
        FRONTEND_IP=$(podman inspect -f '{{.NetworkSettings.IPAddress}}' share-things_frontend_1 2>/dev/null || echo "Container not found")
        
        echo "Backend IP: $BACKEND_IP"
        echo "Frontend IP: $FRONTEND_IP"
        
        # Fix Issue 1: Frontend nginx configuration
        if [ "$BACKEND_IP" != "Container not found" ]; then
            echo ""
            echo -e "${YELLOW}Fixing Issue 1: Frontend nginx configuration${NC}"
            echo "Adding backend entry to frontend container's /etc/hosts..."
            podman exec share-things_frontend_1 sh -c "echo $BACKEND_IP backend >> /etc/hosts" 2>/dev/null || echo "Failed to update /etc/hosts - container may not be running"
            
            echo "Restarting nginx in frontend container..."
            podman exec share-things_frontend_1 nginx -s reload 2>/dev/null || echo "Failed to reload nginx - container may not be running"
        else
            echo "Cannot fix nginx configuration - backend container not found or not running"
        fi
        
        # Fix Issue 2: Backend build
        echo ""
        echo -e "${YELLOW}Fixing Issue 2: Backend build${NC}"
        echo "Checking if backend container is running..."
        if podman ps | grep -q share-things_backend_1; then
            echo "Manually running build process in backend container..."
            podman exec -it share-things_backend_1 sh -c 'cd /app && npm run build' || echo "Failed to run build - there may be issues with the build process"
            
            echo "Restarting backend container..."
            podman restart share-things_backend_1
        else
            echo "Backend container is not running. Rebuilding and starting it..."
            podman-compose build backend && podman-compose up -d backend
        fi
        
        # Check status after fixes
        echo ""
        echo -e "${YELLOW}Checking container status after fixes...${NC}"
        sleep 5 # Give containers time to start/restart
        podman ps --filter label=io.podman.compose.project=share-things
        
        echo ""
        echo -e "${YELLOW}Frontend logs after fixes:${NC}"
        podman logs share-things_frontend_1 | tail -n 20
        
        echo ""
        echo -e "${YELLOW}Backend logs after fixes:${NC}"
        podman logs share-things_backend_1 | tail -n 20
    else
        # Docker version of the same troubleshooting
        # Check if containers are running
        echo "Checking container status..."
        docker ps --filter label=com.docker.compose.project=share-things
        
        # Get container IPs
        echo "Getting container IPs..."
        BACKEND_IP=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' share-things_backend_1 2>/dev/null || echo "Container not found")
        FRONTEND_IP=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' share-things_frontend_1 2>/dev/null || echo "Container not found")
        
        echo "Backend IP: $BACKEND_IP"
        echo "Frontend IP: $FRONTEND_IP"
        
        # Fix Issue 1: Frontend nginx configuration
        if [ "$BACKEND_IP" != "Container not found" ]; then
            echo ""
            echo -e "${YELLOW}Fixing Issue 1: Frontend nginx configuration${NC}"
            echo "Adding backend entry to frontend container's /etc/hosts..."
            docker exec share-things_frontend_1 sh -c "echo $BACKEND_IP backend >> /etc/hosts" 2>/dev/null || echo "Failed to update /etc/hosts - container may not be running"
            
            echo "Restarting nginx in frontend container..."
            docker exec share-things_frontend_1 nginx -s reload 2>/dev/null || echo "Failed to reload nginx - container may not be running"
        else
            echo "Cannot fix nginx configuration - backend container not found or not running"
        fi
        
        # Fix Issue 2: Backend build
        echo ""
        echo -e "${YELLOW}Fixing Issue 2: Backend build${NC}"
        echo "Checking if backend container is running..."
        if docker ps | grep -q share-things_backend_1; then
            echo "Manually running build process in backend container..."
            docker exec -it share-things_backend_1 sh -c 'cd /app && npm run build' || echo "Failed to run build - there may be issues with the build process"
            
            echo "Restarting backend container..."
            docker restart share-things_backend_1
        else
            echo "Backend container is not running. Rebuilding and starting it..."
            docker-compose build backend && docker-compose up -d backend
        fi
        
        # Check status after fixes
        echo ""
        echo -e "${YELLOW}Checking container status after fixes...${NC}"
        sleep 5 # Give containers time to start/restart
        docker ps --filter label=com.docker.compose.project=share-things
        
        echo ""
        echo -e "${YELLOW}Frontend logs after fixes:${NC}"
        docker logs share-things_frontend_1 | tail -n 20
        
        echo ""
        echo -e "${YELLOW}Backend logs after fixes:${NC}"
        docker logs share-things_backend_1 | tail -n 20
    fi
    
    echo -e "${GREEN}Troubleshooting complete!${NC}"
    echo "If issues persist, you may need to check the application code or container configurations."
fi

# Clean up any backup files created by sed
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi