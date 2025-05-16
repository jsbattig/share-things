#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a command exists
check_command() {
  if ! command -v $1 &> /dev/null; then
    echo -e "${RED}Error: $1 is not installed. Please install it before running this script.${NC}"
    exit 1
  fi
}

# Function to detect the operating system
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
  elif type lsb_release >/dev/null 2>&1; then
    OS=$(lsb_release -si)
    VERSION=$(lsb_release -sr)
  elif [ -f /etc/lsb-release ]; then
    . /etc/lsb-release
    OS=$DISTRIB_ID
    VERSION=$DISTRIB_RELEASE
  else
    OS=$(uname -s)
    VERSION=$(uname -r)
  fi
  
  # Convert to lowercase
  OS=$(echo "$OS" | tr '[:upper:]' '[:lower:]')
}

# Function to detect if running in a CI/CD environment
detect_ci() {
  if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$GITLAB_CI" ] || [ -n "$JENKINS_URL" ]; then
    IS_CI=true
  else
    IS_CI=false
  fi
}

# Function to detect the container engine
detect_container_engine() {
  if command -v podman &> /dev/null; then
    CONTAINER_ENGINE="podman"
  elif command -v docker &> /dev/null; then
    CONTAINER_ENGINE="docker"
  else
    echo -e "${RED}Error: No container engine found. Please install podman or docker.${NC}"
    exit 1
  fi
}

# Function to configure Podman
configure_podman() {
  echo -e "${YELLOW}Detected Podman. Applying Podman-specific configuration...${NC}"
  
  # Make client/docker-entrypoint.sh executable
  chmod +x client/docker-entrypoint.sh
  echo -e "${GREEN}Made client/docker-entrypoint.sh executable.${NC}"
  
  # Check if running on Rocky Linux
  if [ "$OS" = "rocky" ]; then
    echo -e "${YELLOW}Detected Rocky Linux. Configuring Podman to allow short names...${NC}"
    echo "Creating registries.conf in user's home directory..."
    
    mkdir -p ~/.config/containers
    cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["quay.io", "docker.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL
    echo -e "${GREEN}Created ~/.config/containers/registries.conf${NC}"
  fi
  
  echo -e "${GREEN}Podman-specific configuration applied.${NC}"
  echo
}

# Function to configure Podman for Rocky Linux
configure_podman_rocky() {
  echo -e "${YELLOW}Detected Rocky Linux. Applying special Podman configuration...${NC}"
  
  # Check if running in CI/CD environment
  if [ "$IS_CI" = true ]; then
    echo -e "${YELLOW}Detected Rocky Linux in CI/CD environment. Applying special Podman configuration...${NC}"
    
    # Get Podman version
    PODMAN_VERSION=$(podman --version | awk '{print $3}')
    echo -e "${YELLOW}Detected Podman version: $PODMAN_VERSION${NC}"
    
    # Get environment information
    echo -e "${YELLOW}Environment information:${NC}"
    echo "User: $(whoami)"
    echo "Home directory: $HOME"
    echo "Current directory: $(pwd)"
    echo "Container engine: $CONTAINER_ENGINE"
    
    # Check if running in GitHub Actions
    if [ -n "$GITHUB_ACTIONS" ]; then
      echo -e "${YELLOW}Detected GitHub Actions environment${NC}"
    fi
  fi
  
  # Create a universal containers.conf that works in all environments
  mkdir -p ~/.config/containers
  cat > ~/.config/containers/containers.conf << EOL
[engine]
cgroup_manager = "cgroupfs"
events_logger = "file"
runtime = "crun"

[network]
default_rootless_network_cmd = "slirp4netns"
EOL
  echo -e "${GREEN}Created universal ~/.config/containers/containers.conf${NC}"
  
  # Create registries.conf with permissive short name mode
  cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["quay.io", "docker.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL
  echo -e "${GREEN}Created ~/.config/containers/registries.conf${NC}"
  
  # Modify docker-compose files to NOT use host networking
  echo -e "${YELLOW}Modifying docker-compose files to use standard networking...${NC}"
  sed -i 's/network_mode: host/# network_mode: host/' docker-compose.yml
  sed -i 's/network_mode: host/# network_mode: host/' docker-compose.prod.yml
  sed -i 's/network_mode: host/# network_mode: host/' docker-compose.test.yml
  echo -e "${GREEN}Modified docker-compose files to use standard networking${NC}"
  
  # Add health checks to PostgreSQL service
  echo -e "${YELLOW}Adding container dependency health checks...${NC}"
  if [ -f "docker-compose.yml" ]; then
    # Check if health checks already exist
    if ! grep -q "healthcheck:" docker-compose.yml; then
      # Add health checks to PostgreSQL service
      sed -i '/postgres:/,/volumes:/ s/container_name: share-things-postgres/container_name: share-things-postgres\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\n      timeout: 5s\n      retries: 5\n      start_period: 10s/' docker-compose.yml
      echo -e "${GREEN}Added health checks to PostgreSQL service${NC}"
    fi
  fi
  
  # Show Podman version
  echo -e "${YELLOW}Podman version:${NC}"
  podman --version
  
  # Show Podman system info
  echo -e "${YELLOW}Podman system info:${NC}"
  podman system info
  
  # Test network configuration
  echo -e "${YELLOW}Testing network configuration...${NC}"
  podman run --rm quay.io/quay/alpine:latest ping -c 1 google.com || echo -e "${RED}Network test failed. This might be expected in some CI environments.${NC}"
  
  # Create .npmrc file with network configuration for builds
  echo -e "${YELLOW}Creating .npmrc file with network configuration for builds...${NC}"
  cat > ~/.npmrc << EOL
registry=https://registry.npmjs.org/
strict-ssl=false
EOL
  echo -e "${GREEN}Created ~/.npmrc with network configuration${NC}"
  
  # Create podman build configuration
  echo -e "${YELLOW}Creating podman build configuration...${NC}"
  mkdir -p ~/.config/containers
  cat > ~/.config/containers/storage.conf << EOL
[storage]
driver = "overlay"
runroot = "/tmp/containers-$USER"
EOL
  echo -e "${GREEN}Created podman build configuration${NC}"
  
  echo -e "${GREEN}Podman configuration for Rocky Linux complete.${NC}"
}

# Function to test network connectivity
test_network() {
  echo -e "${YELLOW}Testing network connectivity...${NC}"
  
  # Try to ping google.com
  if ping -c 1 google.com &> /dev/null; then
    echo -e "${GREEN}Network connectivity test passed.${NC}"
    return 0
  else
    echo -e "${RED}Network connectivity test failed.${NC}"
    return 1
  fi
}

# Main function
main() {
  # Detect OS
  detect_os
  echo -e "${BLUE}Detected OS: $OS $VERSION${NC}"
  
  # Detect if running in CI/CD environment
  detect_ci
  if [ "$IS_CI" = true ]; then
    echo -e "${BLUE}Running in CI/CD environment${NC}"
  fi
  
  # Detect container engine
  detect_container_engine
  echo -e "${BLUE}Using container engine: $CONTAINER_ENGINE${NC}"
  
  # Configure container engine
  if [ "$CONTAINER_ENGINE" = "podman" ]; then
    configure_podman
    
    # Apply special configuration for Rocky Linux
    if [ "$OS" = "rocky" ]; then
      configure_podman_rocky
    fi
  fi
}

# Run main function
main