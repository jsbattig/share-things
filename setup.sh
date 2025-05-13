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
    echo "  ${COMPOSE_CMD} build"
    echo "  ${COMPOSE_CMD} up -d"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"

# Clean up any backup files created by sed
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Cleaning up backup files...${NC}"
    find . -name "*.bak" -type f -delete
    echo -e "${GREEN}Backup files removed.${NC}"
fi