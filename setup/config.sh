#!/bin/bash

# Configuration functions for ShareThings setup scripts

# Create environment files from templates
create_env_files() {
    # Create .env file from template if it doesn't exist
    if [ ! -f .env ]; then
        log_info "Creating .env file from template..."
        cp .env.example .env
        log_success "Created .env file."
    else
        log_info ".env file already exists. Skipping..."
    fi
    
    # Create client/.env file from template if it doesn't exist
    if [ ! -f client/.env ]; then
        log_info "Creating client/.env file from template..."
        cp client/.env.example client/.env
        log_success "Created client/.env file."
    else
        log_info "client/.env file already exists. Skipping..."
    fi
    
    # Create server/.env file from template if it doesn't exist
    if [ ! -f server/.env ]; then
        log_info "Creating server/.env file from template..."
        cp server/.env.example server/.env
        log_success "Created server/.env file."
    else
        log_info "server/.env file already exists. Skipping..."
    fi
}

# Configure hostname
configure_hostname() {
    # Use command line argument if provided
    if [ -n "$HOSTNAME_ARG" ]; then
        HOSTNAME="$HOSTNAME_ARG"
    elif [ "$NON_INTERACTIVE" != "true" ]; then
        # Interactive mode
        echo ""
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
    else
        # Non-interactive mode with no argument - use auto-detection
        HOSTNAME=""
    fi
    
    if [ -z "$HOSTNAME" ]; then
        log_success "Using automatic hostname detection"
        HOSTNAME="auto"
    else
        log_success "Using hostname: ${HOSTNAME}"
    fi
}

# Configure ports
configure_ports() {
    # Use command line arguments if provided
    if [ -n "$FRONTEND_PORT_ARG" ]; then
        FRONTEND_PORT="$FRONTEND_PORT_ARG"
    fi
    
    if [ -n "$BACKEND_PORT_ARG" ]; then
        BACKEND_PORT="$BACKEND_PORT_ARG"
    fi
    
    if [ -n "$API_PORT_ARG" ]; then
        API_PORT="$API_PORT_ARG"
    fi
    
    # If in non-interactive mode and ports not provided, use defaults
    if [ "$NON_INTERACTIVE" == "true" ]; then
        FRONTEND_PORT=${FRONTEND_PORT:-15000}
        BACKEND_PORT=${BACKEND_PORT:-15001}
        API_PORT=${API_PORT:-15001}
        EXPOSE_PORTS=${EXPOSE_PORTS:-"true"}
        return
    fi
    
    # Interactive mode
    read -p "Are you using custom ports for HAProxy? (y/n): " USE_CUSTOM_PORTS
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        read -p "Enter the client app port (default: 15000): " CLIENT_PORT
        CLIENT_PORT=${CLIENT_PORT:-15000}
        FRONTEND_PORT=$CLIENT_PORT
        
        read -p "Enter the API port (default: 15001): " API_PORT_INPUT
        API_PORT=${API_PORT_INPUT:-15001}
        BACKEND_PORT=$API_PORT
    else
        # Use default ports
        FRONTEND_PORT=15000
        BACKEND_PORT=15001
        API_PORT=15001
    fi
    
    # Ask if want to expose ports to host
    read -p "Do you want to expose container ports to the host? (y/n): " EXPOSE_PORTS_INPUT
    if [[ $EXPOSE_PORTS_INPUT =~ ^[Yy]$ ]]; then
        EXPOSE_PORTS="true"
    else
        EXPOSE_PORTS="false"
    fi
}

# Configure HTTPS
configure_https() {
    # Use command line argument if provided
    if [ "$HTTPS_ARG" == "true" ]; then
        PROTOCOL="https"
        return
    fi
    
    # If in non-interactive mode and not specified, use HTTP
    if [ "$NON_INTERACTIVE" == "true" ]; then
        PROTOCOL="http"
        return
    fi
    
    # Interactive mode
    read -p "Are you using HTTPS? (y/n): " USE_HTTPS
    if [[ $USE_HTTPS =~ ^[Yy]$ ]]; then
        PROTOCOL="https"
    else
        PROTOCOL="http"
    fi
}

# Update environment files with configuration
update_env_files() {
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
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT}|g" .env
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
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT}|g" server/.env
    fi
    
    # Update port mappings in .env
    if [ "$EXPOSE_PORTS" = "true" ]; then
        # Check if the variables already exist in the .env file
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
    fi
}

# Backup current configuration
backup_configuration() {
    BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
    log_info "Backing up current configuration to ${BACKUP_DIR}..."
    mkdir -p $BACKUP_DIR
    cp .env $BACKUP_DIR/.env 2>/dev/null || echo "No .env file to backup"
    cp client/.env $BACKUP_DIR/client.env 2>/dev/null || echo "No client/.env file to backup"
    cp server/.env $BACKUP_DIR/server.env 2>/dev/null || echo "No server/.env file to backup"
    
    # Backup compose files if they exist
    cp build/config/podman-compose.yml $BACKUP_DIR/podman-compose.yml 2>/dev/null || echo "No build/config/podman-compose.yml file to backup"
    cp build/config/podman-compose.prod.yml $BACKUP_DIR/podman-compose.prod.yml 2>/dev/null || echo "No build/config/podman-compose.prod.yml file to backup"
    cp build/config/podman-compose.prod.temp.yml $BACKUP_DIR/podman-compose.prod.temp.yml 2>/dev/null || echo "No build/config/podman-compose.prod.temp.yml file to backup"
    
    log_success "Configuration backed up to ${BACKUP_DIR}"
}

# Capture current configuration for reinstall
capture_current_configuration() {
    log_info "Capturing current configuration..."
    
    # Capture hostname
    if grep -q "API_URL=auto" .env; then
        HOSTNAME_ARG="auto"
    else
        HOSTNAME_ARG=$(grep "API_URL=" .env | sed -E 's|API_URL=https?://([^:]+).*|\1|')
    fi
    
    # Capture protocol
    if grep -q "API_URL=https" .env; then
        HTTPS_ARG="true"
    else
        HTTPS_ARG="false"
    fi
    
    # Capture ports with safer extraction
    FRONTEND_PORT_LINE=$(grep "FRONTEND_PORT=" .env || echo "FRONTEND_PORT=15000")
    BACKEND_PORT_LINE=$(grep "BACKEND_PORT=" .env || echo "BACKEND_PORT=15001")
    API_PORT_LINE=$(grep "API_PORT=" .env || echo "API_PORT=15001")
    
    # Extract the port numbers with simpler pattern matching
    FRONTEND_PORT_ARG=$(echo "$FRONTEND_PORT_LINE" | grep -o '[0-9]\+' || echo "15000")
    BACKEND_PORT_ARG=$(echo "$BACKEND_PORT_LINE" | grep -o '[0-9]\+' || echo "15001")
    API_PORT_ARG=$(echo "$API_PORT_LINE" | grep -o '[0-9]\+' || echo "15001")
    
    # Log the extracted values for debugging
    log_info "Extracted ports: Frontend=$FRONTEND_PORT_ARG, Backend=$BACKEND_PORT_ARG, API=$API_PORT_ARG"
    
    # Capture production mode
    if [ -f build/config/podman-compose.prod.yml ] || [ -f build/config/podman-compose.prod.temp.yml ]; then
        PRODUCTION_MODE="true"
    else
        PRODUCTION_MODE="false"
    fi
    
    # Capture expose ports
    if grep -q "FRONTEND_PORT=" .env; then
        EXPOSE_PORTS="true"
    else
        EXPOSE_PORTS="false"
    fi
    
    log_success "Configuration captured for reinstall"
}

