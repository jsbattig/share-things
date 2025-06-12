#!/bin/bash

# ShareThings Setup and Management Script - INSTRUMENTED VERSION
# This script handles installation, updates, and management of ShareThings application
# Podman-only implementation with detailed timing instrumentation

# Script name for logging
SCRIPT_NAME=$(basename "$0")

# Determine repository root
REPO_ROOT=$(dirname "$(readlink -f "$0")")
export REPO_ROOT

# Default values
INSTALL_MODE="install"
NON_INTERACTIVE="false"
FORCE_MODE="false"
PRODUCTION_MODE="false"
EXPOSE_PORTS="false"
PROTOCOL="http"
COMPOSE_CMD="podman-compose"
CONTAINER_CMD="podman"
COMPOSE_FILE="build/config/podman-compose.yml"
FORCE_INSTALL="false"
DEBUG_MODE="false"

# Export INSTALL_MODE so it's available to all functions
export INSTALL_MODE

# Timing instrumentation variables
declare -A STEP_START_TIMES
declare -A STEP_END_TIMES
declare -A STEP_DURATIONS
declare -a STEP_ORDER
TOTAL_START_TIME=""
TOTAL_END_TIME=""

# Timing functions
start_timer() {
    local step_name="$1"
    STEP_START_TIMES["$step_name"]=$(date +%s.%N)
    STEP_ORDER+=("$step_name")
    echo "⏱️  [$(date '+%H:%M:%S')] Starting: $step_name"
}

end_timer() {
    local step_name="$1"
    STEP_END_TIMES["$step_name"]=$(date +%s.%N)
    local duration=$(echo "${STEP_END_TIMES[$step_name]} - ${STEP_START_TIMES[$step_name]}" | bc -l)
    STEP_DURATIONS["$step_name"]=$duration
    printf "✅ [$(date '+%H:%M:%S')] Completed: %s (%.2fs)\n" "$step_name" "$duration"
}

# Function to format duration in human-readable format
format_duration() {
    local duration=$1
    local minutes=$(echo "$duration / 60" | bc -l)
    local seconds=$(echo "$duration % 60" | bc -l)
    
    if (( $(echo "$minutes >= 1" | bc -l) )); then
        printf "%.0fm %.1fs" "$minutes" "$seconds"
    else
        printf "%.2fs" "$duration"
    fi
}

# Function to show timing summary
show_timing_summary() {
    echo ""
    echo "🕐 ================= TIMING SUMMARY =================="
    echo "📊 Step-by-step breakdown:"
    echo ""
    
    local total_measured=0
    for step in "${STEP_ORDER[@]}"; do
        if [[ -n "${STEP_DURATIONS[$step]}" ]]; then
            local formatted_duration=$(format_duration "${STEP_DURATIONS[$step]}")
            printf "   %-35s %s\n" "$step:" "$formatted_duration"
            total_measured=$(echo "$total_measured + ${STEP_DURATIONS[$step]}" | bc -l)
        fi
    done
    
    echo ""
    echo "📈 Summary:"
    if [[ -n "$TOTAL_START_TIME" && -n "$TOTAL_END_TIME" ]]; then
        local total_wall_time=$(echo "$TOTAL_END_TIME - $TOTAL_START_TIME" | bc -l)
        local total_wall_formatted=$(format_duration "$total_wall_time")
        local total_measured_formatted=$(format_duration "$total_measured")
        
        printf "   %-35s %s\n" "Total wall clock time (actual):" "$total_wall_formatted"
        printf "   %-35s %s\n" "Total measured time (sum):" "$total_measured_formatted"
        
        # Explain the difference
        echo ""
        echo "ℹ️  Timing Explanation:"
        echo "   • Wall clock time = actual elapsed time from start to finish"
        echo "   • Measured time = sum of all individual step durations"
        if (( $(echo "$total_measured > $total_wall_time" | bc -l) )); then
            echo "   • Measured > Wall clock indicates overlapping/parallel operations"
        elif (( $(echo "$total_wall_time > $total_measured" | bc -l) )); then
            local overhead=$(echo "$total_wall_time - $total_measured" | bc -l)
            local overhead_formatted=$(format_duration "$overhead")
            printf "   • Overhead/unmeasured time: %s\n" "$overhead_formatted"
        else
            echo "   • Times match closely - good measurement coverage"
        fi
    else
        local total_measured_formatted=$(format_duration "$total_measured")
        printf "   %-35s %s\n" "Total measured time:" "$total_measured_formatted"
        echo "   (Wall clock time not available - missing start/end timestamps)"
    fi
    
    echo ""
    echo "🔍 Performance insights:"
    
    # Find slowest step
    local slowest_step=""
    local slowest_duration=0
    for step in "${STEP_ORDER[@]}"; do
        if [[ -n "${STEP_DURATIONS[$step]}" ]]; then
            if (( $(echo "${STEP_DURATIONS[$step]} > $slowest_duration" | bc -l) )); then
                slowest_duration=${STEP_DURATIONS[$step]}
                slowest_step=$step
            fi
        fi
    done
    
    if [[ -n "$slowest_step" ]]; then
        local slowest_formatted=$(format_duration "$slowest_duration")
        echo "   🐌 Slowest step: $slowest_step ($slowest_formatted)"
        
        # Calculate percentage of total time
        if (( $(echo "$total_measured > 0" | bc -l) )); then
            local percentage=$(echo "scale=1; $slowest_duration * 100 / $total_measured" | bc -l)
            echo "      (${percentage}% of total measured time)"
        fi
    fi
    
    # Show build-related steps
    echo ""
    echo "🔨 Build-related timing:"
    local build_total=0
    for step in "${STEP_ORDER[@]}"; do
        if [[ "$step" == *"build"* || "$step" == *"Build"* || "$step" == *"container"* ]]; then
            if [[ -n "${STEP_DURATIONS[$step]}" ]]; then
                local formatted_duration=$(format_duration "${STEP_DURATIONS[$step]}")
                printf "   %-35s %s\n" "$step:" "$formatted_duration"
                build_total=$(echo "$build_total + ${STEP_DURATIONS[$step]}" | bc -l)
            fi
        fi
    done
    
    if (( $(echo "$build_total > 0" | bc -l) )); then
        local build_total_formatted=$(format_duration "$build_total")
        printf "   %-35s %s\n" "Total build time:" "$build_total_formatted"
        
        if (( $(echo "$total_measured > 0" | bc -l) )); then
            local build_percentage=$(echo "scale=1; $build_total * 100 / $total_measured" | bc -l)
            echo "   (${build_percentage}% of total time spent on builds)"
        fi
    fi
    
    echo "=================================================="
}

# Source the module scripts
source setup/common.sh
source setup/config.sh
source setup/containers.sh
source setup/operations.sh

# Override key functions with timing instrumentation

# Instrumented version of build_and_start_containers
build_and_start_containers_instrumented() {
    start_timer "Pre-operation Check"
    podman_pre_operation_check
    end_timer "Pre-operation Check"
    
    start_timer "Data Directory Setup"
    log_info "Ensuring data directory exists with proper permissions..."
    if [ -f "$REPO_ROOT/ensure-data-directory.sh" ]; then
        bash "$REPO_ROOT/ensure-data-directory.sh"
    else
        mkdir -p "$REPO_ROOT/data/sessions"
        chmod 755 "$REPO_ROOT/data" "$REPO_ROOT/data/sessions"
        log_info "Data directory created at: $REPO_ROOT/data"
    fi
    end_timer "Data Directory Setup"
    
    if [ "$PRODUCTION_MODE" == "true" ]; then
        start_timer "Production Compose File Creation"
        log_info "Creating temporary production podman-compose file without volume mounts..."
        
        mkdir -p build/config
        SERVER_DIR="$REPO_ROOT/server"
        CLIENT_DIR="$REPO_ROOT/client"
        
        cat > build/config/podman-compose.prod.temp.yml << EOF
# Temporary production configuration for ShareThings Podman Compose

services:
  backend:
    build:
      context: $REPO_ROOT
      dockerfile: server/Dockerfile
      args:
        - PORT=${API_PORT:-15001}
    container_name: share-things-backend
    ports:
      - "${BACKEND_PORT}:${API_PORT:-15001}"
    volumes:
      - ./data:/app/data:Z
    networks:
      app_network:
        aliases:
          - backend
    environment:
      - NODE_ENV=production
      - PORT=${API_PORT:-15001}
      - SQLITE_DB_PATH=/app/data/sessions.db
      - STORAGE_PATH=/app/data/sessions
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: $REPO_ROOT
      dockerfile: client/Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT:-15001}
        - VITE_API_PORT=${API_PORT:-15001}
    container_name: share-things-frontend
    ports:
      - "${FRONTEND_PORT}:15000"
    networks:
      app_network:
        aliases:
          - frontend
    environment:
      - API_PORT=${API_PORT:-15001}
      - PORT=15000
      - STATIC_DIR=/app/public
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  app_network:
    driver: bridge

volumes:
  volume-backend-node-modules:
  volume-frontend-node-modules:
EOF
        end_timer "Production Compose File Creation"
        
        start_timer "Production Container Build"
        log_info "Building containers in production mode..."
        
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        PROD_COMPOSE_PATH="build/config/podman-compose.prod.temp.yml"
        ABSOLUTE_PROD_COMPOSE_PATH="$(cd "$(dirname "$PROD_COMPOSE_PATH")" && pwd)/$(basename "$PROD_COMPOSE_PATH")"
        log_info "Using absolute compose file path: $ABSOLUTE_PROD_COMPOSE_PATH"
        
        if ! podman info &> /dev/null; then
            log_warning "Podman service may not be running properly. Attempting to reset..."
            podman system migrate &> /dev/null || true
            podman system reset --force &> /dev/null || true
            
            if ! podman info &> /dev/null; then
                log_warning "Podman service still not running properly. Will attempt to continue with existing images..."
            else
                log_info "Podman service reset successfully. Proceeding with build..."
                podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" build --no-cache
            fi
        else
            podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" build --no-cache
        fi
        
        if [ $? -ne 0 ]; then
            log_error "Container build failed in production mode"
            log_error "Cannot continue with installation. Please fix the build errors and try again."
            exit 1
        fi
        end_timer "Production Container Build"
        
        start_timer "Production Container Startup"
        log_info "Starting containers in production mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        if ! podman info &> /dev/null; then
            log_warning "Podman service may not be running properly. Attempting to reset..."
            podman system migrate &> /dev/null || true
            podman system reset --force &> /dev/null || true
            
            if ! podman info &> /dev/null; then
                log_warning "Podman service still not running properly. Container startup may fail."
                FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" up -d
            else
                log_info "Podman service reset successfully. Proceeding with container startup..."
                FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" up -d
            fi
        else
            FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT API_PORT=$API_PORT podman-compose -f "$ABSOLUTE_PROD_COMPOSE_PATH" up -d
        fi
        
        COMPOSE_FILE="$ABSOLUTE_PROD_COMPOSE_PATH"
        end_timer "Production Container Startup"
    else
        start_timer "Development Compose File Creation"
        log_info "Building containers in development mode..."
        
        export VITE_API_PORT="${API_PORT:-15001}"
        log_info "Setting explicit VITE_API_PORT=${VITE_API_PORT} for build"
        
        log_info "Creating temporary development podman-compose file..."
        
        CONFIG_DIR="build/config"
        mkdir -p "$CONFIG_DIR"
        DEV_COMPOSE_PATH="$CONFIG_DIR/podman-compose.dev.temp.yml"
        
        SERVER_DIR="$REPO_ROOT/server"
        CLIENT_DIR="$REPO_ROOT/client"
        
        cat > "$DEV_COMPOSE_PATH" <<-EOF
# Temporary development configuration for ShareThings Podman Compose with host networking

services:
  backend:
    build:
      context: $REPO_ROOT
      dockerfile: server/Dockerfile
      args:
        - PORT=${API_PORT:-15001}
    container_name: share-things-backend
    network_mode: "host"
    volumes:
      - ./data:/app/data:Z
    environment:
      - NODE_ENV=development
      - PORT=${API_PORT:-15001}
      - SQLITE_DB_PATH=/app/data/sessions.db
      - STORAGE_PATH=/app/data/sessions
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: $REPO_ROOT
      dockerfile: client/Dockerfile
      args:
        - API_URL=auto
        - SOCKET_URL=auto
        - API_PORT=${API_PORT:-15001}
        - VITE_API_PORT=${API_PORT:-15001}
    container_name: share-things-frontend
    network_mode: "host"
    environment:
      - API_PORT=${API_PORT:-15001}
      - PORT=15000
      - STATIC_DIR=/app/public
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  volume-backend-node-modules:
  volume-frontend-node-modules:
EOF
        end_timer "Development Compose File Creation"
        
        start_timer "Development Container Build"
        log_info "Building containers with temporary development file..."
        
        if [ ! -f "$DEV_COMPOSE_PATH" ]; then
            log_error "Compose file not found at $DEV_COMPOSE_PATH, but we just created it"
            ls -la "$(dirname "$DEV_COMPOSE_PATH")"
        fi
        
        COMPOSE_PATH="$DEV_COMPOSE_PATH"
        ABSOLUTE_COMPOSE_PATH="$(cd "$(dirname "$COMPOSE_PATH")" && pwd)/$(basename "$COMPOSE_PATH")"
        log_info "Using absolute compose file path: $ABSOLUTE_COMPOSE_PATH"
        
        if ! podman info &> /dev/null; then
            log_warning "Podman service may not be running properly. Attempting to reset..."
            podman system migrate &> /dev/null || true
            podman system reset --force &> /dev/null || true
            
            if ! podman info &> /dev/null; then
                log_warning "Podman service still not running properly. Will attempt to continue with existing images..."
                BUILD_EXIT_CODE=1
            else
                log_info "Podman service reset successfully. Proceeding with build..."
                podman-compose -f "$ABSOLUTE_COMPOSE_PATH" build --no-cache
                BUILD_EXIT_CODE=$?
            fi
        else
            podman-compose -f "$ABSOLUTE_COMPOSE_PATH" build --no-cache
            BUILD_EXIT_CODE=$?
        fi
        
        if [ $BUILD_EXIT_CODE -ne 0 ]; then
            log_error "Container build failed with exit code $BUILD_EXIT_CODE"
            log_error "Cannot continue with installation. Please fix the build errors and try again."
            exit 1
        else
            log_success "Container build completed successfully"
        fi
        end_timer "Development Container Build"
        
        start_timer "Development Container Startup"
        log_info "Starting containers in development mode with ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}"
        
        export FRONTEND_PORT
        export BACKEND_PORT
        export API_PORT
        
        if ! podman info &> /dev/null; then
            log_warning "Podman service may not be running properly. Attempting to reset..."
            podman system migrate &> /dev/null || true
            podman system reset --force &> /dev/null || true
            
            if ! podman info &> /dev/null; then
                log_warning "Podman service still not running properly. Container startup may fail."
                podman-compose -f "$ABSOLUTE_COMPOSE_PATH" up -d
                UP_EXIT_CODE=$?
            else
                log_info "Podman service reset successfully. Proceeding with container startup..."
                podman-compose -f "$ABSOLUTE_COMPOSE_PATH" up -d
                UP_EXIT_CODE=$?
            fi
        else
            podman-compose -f "$ABSOLUTE_COMPOSE_PATH" up -d
            UP_EXIT_CODE=$?
        fi
        
        if [ $UP_EXIT_CODE -ne 0 ]; then
            log_error "Container startup failed with exit code $UP_EXIT_CODE"
            log_info "Checking for container errors..."
            podman ps -a --filter name=share-things
        else
            log_success "Containers started successfully"
        fi
        
        COMPOSE_FILE="$ABSOLUTE_COMPOSE_PATH"
        end_timer "Development Container Startup"
    fi
}

# Instrumented version of perform_installation
perform_installation_instrumented() {
    start_timer "Environment Files Creation"
    create_env_files
    end_timer "Environment Files Creation"
    
    start_timer "Hostname Configuration"
    configure_hostname
    end_timer "Hostname Configuration"
    
    start_timer "HTTPS Configuration"
    configure_https
    end_timer "HTTPS Configuration"
    
    start_timer "Ports Configuration"
    configure_ports
    end_timer "Ports Configuration"
    
    start_timer "Environment Files Update"
    update_env_files
    end_timer "Environment Files Update"
    
    start_timer "Docker Entrypoint Permissions"
    if [ -f "client/docker-entrypoint.sh" ]; then
        chmod +x client/docker-entrypoint.sh
        log_success "Made client/docker-entrypoint.sh executable."
    else
        log_warning "Warning: client/docker-entrypoint.sh not found. Container networking might have issues."
    fi
    end_timer "Docker Entrypoint Permissions"
    
    # Don't time the wrapper function to avoid double-counting
    # The sub-functions inside build_and_start_containers_instrumented already have their own timers
    build_and_start_containers_instrumented
    
    start_timer "Container Verification"
    verify_containers
    end_timer "Container Verification"
    
    start_timer "Next Steps Display"
    echo ""
    echo -e "${BLUE}=== Next Steps ===${NC}"
    
    if [ "$EXPOSE_PORTS" = "true" ]; then
        echo "You can access the application at:"
        echo "- Frontend: ${PROTOCOL}://${HOSTNAME}:${FRONTEND_PORT} (container port 15000)"
        echo "- Backend: ${PROTOCOL}://${HOSTNAME}:${BACKEND_PORT} (container port ${API_PORT})"
        
        echo ""
        echo -e "${YELLOW}Verifying port mappings:${NC}"
        podman port share-things-frontend
        podman port share-things-backend
        
        if [ "$PRODUCTION_MODE" == "true" ]; then
            echo ""
            echo -e "${GREEN}Running in production mode (no volume mounts).${NC}"
            echo "This means the containers are using the built files from the Dockerfile."
            echo "Any changes to the source code will require rebuilding the containers."
        else
            echo ""
            echo -e "${YELLOW}Running in development mode (with volume mounts).${NC}"
            echo "This means the containers are using the local source code."
            echo "Changes to the source code will be reflected in the containers."
        fi
    else
        echo "The containers are running, but ports are not exposed to the host."
        echo "Make sure your HAProxy is properly configured to route traffic to the containers."
    fi
    
    log_success "Installation complete!"
    
    echo ""
    echo -e "${BLUE}=== Container Status Check ===${NC}"
    echo "You can check container status at any time by running:"
    echo "  podman ps --filter label=io.podman.compose.project=share-things"
    echo ""
    echo "If containers aren't running, you can view error logs with:"
    echo "  podman logs share-things-frontend"
    echo "  podman logs share-things-backend"
    echo ""
    echo "To restart the containers:"
    echo "  podman-compose -f build/config/podman-compose.yml down && podman-compose -f build/config/podman-compose.yml up -d"
    
    cleanup_backup_files
    end_timer "Next Steps Display"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --reinstall)
            INSTALL_MODE="reinstall"
            shift
            ;;
        --uninstall)
            INSTALL_MODE="uninstall"
            shift
            ;;
        --hostname=*)
            HOSTNAME_ARG="${1#*=}"
            shift
            ;;
        --frontend-port=*)
            FRONTEND_PORT_ARG="${1#*=}"
            shift
            ;;
        --backend-port=*)
            BACKEND_PORT_ARG="${1#*=}"
            shift
            ;;
        --api-port=*)
            API_PORT_ARG="${1#*=}"
            shift
            ;;
        --https)
            PROTOCOL="https"
            HTTPS_ARG="true"
            shift
            ;;
        --expose-ports)
            EXPOSE_PORTS="true"
            shift
            ;;
        --production)
            PRODUCTION_MODE="true"
            shift
            ;;
        --non-interactive)
            NON_INTERACTIVE="true"
            shift
            ;;
        --force)
            FORCE_MODE="true"
            shift
            ;;
        --force-install)
            FORCE_INSTALL="true"
            shift
            ;;
        --debug)
            DEBUG_MODE="true"
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

# Check if bc is available for timing calculations
if ! command -v bc &> /dev/null; then
    echo "Warning: 'bc' command not found. Installing for timing calculations..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y bc
    elif command -v yum &> /dev/null; then
        sudo yum install -y bc
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y bc
    else
        echo "Could not install 'bc'. Timing calculations may not work properly."
    fi
fi

# Start total timing
TOTAL_START_TIME=$(date +%s.%N)
echo "🚀 Starting ShareThings setup with detailed timing instrumentation..."
echo "📅 Start time: $(date)"

# Main execution flow based on mode
start_timer "Podman Pre-operation Check"
podman_pre_operation_check
end_timer "Podman Pre-operation Check"

start_timer "Podman Availability Check"
check_podman
end_timer "Podman Availability Check"

if [ "$DEBUG_MODE" = "true" ]; then
    start_timer "Debug Mode Setup"
    echo "Debug mode enabled - showing verbose output"
    
    mkdir -p "logs"
    DEBUG_LOG_FILE="logs/setup-debug.log"
    rm -f "$DEBUG_LOG_FILE"
    echo "=== Debug Log Started ===" > "$DEBUG_LOG_FILE"
    exec > >(tee -a "$DEBUG_LOG_FILE") 2>&1
    
    echo "=== System Information ==="
    echo "Date: $(date)"
    echo "Hostname: $(hostname)"
    echo "Kernel: $(uname -a)"
    echo "Podman version: $(podman --version)"
    echo "Podman Compose version: $(podman-compose --version)"
    echo "Current directory: $(pwd)"
    echo "Current user: $(whoami)"
    echo "Available disk space:"
    df -h
    echo "=========================="
    
    set -x
    end_timer "Debug Mode Setup"
fi

case $INSTALL_MODE in
    "install")
        start_timer "Installation Check"
        if check_installation && [ "$FORCE_INSTALL" != "true" ]; then
            log_error "ShareThings is already installed."
            log_info "Use --reinstall to remove and reinstall."
            log_info "Or use --force-install to force a fresh installation."
            exit 1
        fi
        end_timer "Installation Check"
        
        if [ "$FORCE_INSTALL" == "true" ]; then
            start_timer "Force Install Cleanup"
            log_warning "Force install enabled. Cleaning up existing installation..."
            perform_uninstall
            end_timer "Force Install Cleanup"
        fi
        
        log_info "Starting ShareThings installation..."
        perform_installation_instrumented
        ;;
        
    "reinstall")
        start_timer "Reinstall Installation Check"
        if ! check_installation; then
            log_error "ShareThings is not installed. Cannot reinstall."
            log_info "Use the script without flags to perform a fresh installation."
            exit 1
        fi
        end_timer "Reinstall Installation Check"
        
        log_info "Starting ShareThings reinstallation..."
        
        start_timer "Configuration Capture"
        capture_current_configuration
        end_timer "Configuration Capture"
        
        start_timer "Uninstall"
        perform_uninstall
        end_timer "Uninstall"
        
        start_timer "Reinstall"
        perform_installation_instrumented
        end_timer "Reinstall"
        ;;
        
    "uninstall")
        start_timer "Uninstall Installation Check"
        if ! check_installation; then
            log_error "ShareThings is not installed. Nothing to uninstall."
            exit 0
        fi
        end_timer "Uninstall Installation Check"
        
        log_info "Starting ShareThings uninstallation..."
        start_timer "Uninstall"
        perform_uninstall
        end_timer "Uninstall"
        ;;
esac

# End total timing and show summary
TOTAL_END_TIME=$(date +%s.%N)
echo ""
echo "🏁 ShareThings setup completed!"
echo "📅 End time: $(date)"

log_info "Script execution completed."

# Show comprehensive timing summary
show_timing_summary