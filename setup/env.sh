#!/bin/bash

# Environment configuration functions for ShareThings

# Setup environment files
setup_env_files() {
  echo -e "${BLUE}=== Environment Files ===${NC}"
  
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
  
  # Configure hostname and ports
  configure_hostname_and_ports
}

# Configure hostname and ports
configure_hostname_and_ports() {
  if [ "$TEST_MODE" = true ]; then
    # In test mode, use default values
    HOSTNAME="auto"
    PROTOCOL="http"
    USE_CUSTOM_PORTS=false
    EXPOSE_PORTS=true
    FRONTEND_PORT=8080
    BACKEND_PORT=3001
    
    echo -e "${YELLOW}Test mode: Using default hostname and port configuration.${NC}"
  else
    # Check if hostname is provided as an argument
    if [ -n "$HOSTNAME_ARG" ]; then
      HOSTNAME="$HOSTNAME_ARG"
      echo -e "${GREEN}Using hostname from argument: ${HOSTNAME}${NC}"
    else
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
    fi
    
    # Check if custom ports are provided as arguments
    if [ -n "$USE_CUSTOM_PORTS_ARG" ]; then
      USE_CUSTOM_PORTS="$USE_CUSTOM_PORTS_ARG"
      if [ "$USE_CUSTOM_PORTS" = true ] || [ "$USE_CUSTOM_PORTS" = "y" ]; then
        USE_CUSTOM_PORTS=true
        CLIENT_PORT="${CLIENT_PORT_ARG:-15000}"
        API_PORT="${API_PORT_ARG:-15001}"
      else
        USE_CUSTOM_PORTS=false
      fi
    else
      # Ask if using custom ports
      read -p "Are you using custom ports for HAProxy? (y/n): " USE_CUSTOM_PORTS_INPUT
      if [[ $USE_CUSTOM_PORTS_INPUT =~ ^[Yy]$ ]]; then
        USE_CUSTOM_PORTS=true
        read -p "Enter the client app port (default: 15000): " CLIENT_PORT
        CLIENT_PORT=${CLIENT_PORT:-15000}
        
        read -p "Enter the API port (default: 15001): " API_PORT
        API_PORT=${API_PORT:-15001}
      else
        USE_CUSTOM_PORTS=false
      fi
    fi
    
    # Check if HTTPS is provided as an argument
    if [ -n "$USE_HTTPS_ARG" ]; then
      if [ "$USE_HTTPS_ARG" = true ] || [ "$USE_HTTPS_ARG" = "y" ]; then
        PROTOCOL="https"
      else
        PROTOCOL="http"
      fi
    else
      # Ask if using HTTPS
      read -p "Are you using HTTPS? (y/n): " USE_HTTPS
      if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        PROTOCOL="https"
      else
        PROTOCOL="http"
      fi
    fi
    
    # Check if expose ports is provided as an argument
    if [ -n "$EXPOSE_PORTS_ARG" ]; then
      if [ "$EXPOSE_PORTS_ARG" = true ] || [ "$EXPOSE_PORTS_ARG" = "y" ]; then
        EXPOSE_PORTS=true
        
        # If custom HAProxy ports were configured, use those directly
        if [ "$USE_CUSTOM_PORTS" = true ]; then
          FRONTEND_PORT=${CLIENT_PORT:-15000}
          BACKEND_PORT=${API_PORT:-15001}
          echo -e "${GREEN}Using custom ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}${NC}"
        else
          # Use provided port arguments if available
          FRONTEND_PORT="${FRONTEND_PORT_ARG:-8080}"
          BACKEND_PORT="${BACKEND_PORT_ARG:-3001}"
        fi
      else
        EXPOSE_PORTS=false
      fi
    else
      # Ask if want to expose ports to host
      read -p "Do you want to expose container ports to the host? (y/n): " EXPOSE_PORTS_INPUT
      if [[ $EXPOSE_PORTS_INPUT =~ ^[Yy]$ ]]; then
        EXPOSE_PORTS=true
        
        # If custom HAProxy ports were configured, use those directly
        if [ "$USE_CUSTOM_PORTS" = true ]; then
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
      else
        EXPOSE_PORTS=false
      fi
    fi
  fi
  
  # Update .env file
  update_env_files
}

# Update environment files with hostname and port configuration
update_env_files() {
  # Update .env file
  if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|API_URL=http://localhost|API_URL=auto|g" .env
    $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=auto|g" .env
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" .env
    
    if [ "$USE_CUSTOM_PORTS" = true ]; then
      # Add API_PORT to .env
      if ! grep -q "API_PORT" .env; then
        echo "API_PORT=${API_PORT}" >> .env
      else
        $SED_CMD "s|API_PORT=.*|API_PORT=${API_PORT}|g" .env
      fi
    fi
  else
    if [ "$USE_CUSTOM_PORTS" = true ]; then
      $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
      $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
      $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" .env
    else
      $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}|g" .env
      $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" .env
      $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" .env
    fi
  fi
  
  # Update client/.env file
  if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=auto|g" client/.env
    $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=auto|g" client/.env
    
    if [ "$USE_CUSTOM_PORTS" = true ]; then
      # Add VITE_API_PORT to client/.env
      if ! grep -q "VITE_API_PORT" client/.env; then
        echo "VITE_API_PORT=${API_PORT}" >> client/.env
      else
        $SED_CMD "s|VITE_API_PORT=.*|VITE_API_PORT=${API_PORT}|g" client/.env
      fi
    fi
  else
    if [ "$USE_CUSTOM_PORTS" = true ]; then
      $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
      $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
    else
      $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
      $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
    fi
  fi
  
  # Update server/.env file
  if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" server/.env
  else
    if [ "$USE_CUSTOM_PORTS" = true ]; then
      $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" server/.env
    else
      $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" server/.env
    fi
  fi
  
  # Update port configuration in .env
  if [ "$EXPOSE_PORTS" = true ]; then
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
    
    # Export variables for Docker Compose
    export FRONTEND_PORT="${FRONTEND_PORT}"
    export BACKEND_PORT="${BACKEND_PORT}"
    
    # Print the current port configuration for verification
    echo -e "${GREEN}Port configuration in .env file:${NC}"
    grep -E "^FRONTEND_PORT=|^BACKEND_PORT=" .env || echo "Port variables not found in .env file"
    
    # Update nginx.conf to use the custom backend port
    if [ "$USE_CUSTOM_PORTS" = true ]; then
      echo -e "${YELLOW}Updating nginx.conf to use custom backend port...${NC}"
      # Create a backup of the nginx.conf file
      cp client/nginx.conf client/nginx.conf.bak
      # Update the proxy_pass directives to use the custom port
      $SED_CMD "s|http://backend:3001|http://backend:${API_PORT}|g" client/nginx.conf
      echo -e "${GREEN}Updated nginx.conf with custom backend port.${NC}"
    fi
  fi
  
  echo -e "${GREEN}Updated configuration files.${NC}"
}