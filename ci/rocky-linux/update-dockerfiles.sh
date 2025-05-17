#!/bin/bash

# This script updates Dockerfiles to use a custom Docker registry
# It should be called by test-setup.sh and test-update.sh

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to log messages
log() {
  local level=$1
  local message=$2
  local color=$BLUE
  
  case $level in
    "INFO") color=$BLUE ;;
    "SUCCESS") color=$GREEN ;;
    "WARNING") color=$YELLOW ;;
    "ERROR") color=$RED ;;
  esac
  
  echo -e "${color}[$level] $message${NC}"
}

# Get the Docker registry URL from command line arguments
DOCKER_REGISTRY_URL=""
DOCKER_USERNAME=""
DOCKER_PASSWORD=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --registry-url)
      DOCKER_REGISTRY_URL="$2"
      shift 2
      ;;
    --username)
      DOCKER_USERNAME="$2"
      shift 2
      ;;
    --password)
      DOCKER_PASSWORD="$2"
      shift 2
      ;;
    *)
      # Skip unknown arguments
      shift
      ;;
  esac
done

# Check if we're running in GitHub Actions
if [ -n "$GITHUB_ACTIONS" ]; then
  # Use GitHub secrets if available
  if [ -n "$HARBORURL" ]; then
    DOCKER_REGISTRY_URL="$HARBORURL"
  fi
  if [ -n "$HARBORUSERNAME" ]; then
    DOCKER_USERNAME="$HARBORUSERNAME"
  fi
  if [ -n "$HARBORPASSWORD" ]; then
    DOCKER_PASSWORD="$HARBORPASSWORD"
  fi
fi

# If registry URL is provided, update Dockerfiles
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  log "INFO" "Updating Dockerfiles to use custom registry URL: $DOCKER_REGISTRY_URL"
  
  # Update server Dockerfile
  if [ -f "./server/Dockerfile" ]; then
    log "INFO" "Updating server/Dockerfile..."
    sed -i "s|FROM docker.io/library/|FROM ${DOCKER_REGISTRY_URL}/library/|g" ./server/Dockerfile
    cat ./server/Dockerfile | grep "FROM"
  fi
  
  # Update client Dockerfile
  if [ -f "./client/Dockerfile" ]; then
    log "INFO" "Updating client/Dockerfile..."
    sed -i "s|FROM docker.io/library/|FROM ${DOCKER_REGISTRY_URL}/library/|g" ./client/Dockerfile
    cat ./client/Dockerfile | grep "FROM"
  fi
  
  # Update server/Dockerfile.test if it exists
  if [ -f "./server/Dockerfile.test" ]; then
    log "INFO" "Updating server/Dockerfile.test..."
    sed -i "s|FROM docker.io/library/|FROM ${DOCKER_REGISTRY_URL}/library/|g" ./server/Dockerfile.test
    cat ./server/Dockerfile.test | grep "FROM"
  fi
  
  # Update client/Dockerfile.test if it exists
  if [ -f "./client/Dockerfile.test" ]; then
    log "INFO" "Updating client/Dockerfile.test..."
    sed -i "s|FROM docker.io/library/|FROM ${DOCKER_REGISTRY_URL}/library/|g" ./client/Dockerfile.test
    cat ./client/Dockerfile.test | grep "FROM"
  fi
  
  # Update docker-compose files to use custom registry
  for compose_file in docker-compose.yml docker-compose.prod.yml docker-compose.test.yml; do
    if [ -f "./$compose_file" ]; then
      log "INFO" "Updating $compose_file..."
      sed -i "s|image: docker.io/library/|image: ${DOCKER_REGISTRY_URL}/library/|g" ./$compose_file
      sed -i "s|image: postgres:17-alpine|image: ${DOCKER_REGISTRY_URL}/library/postgres:14-alpine|g" ./$compose_file
      cat ./$compose_file | grep "image:"
    fi
  done
  
  # Create a file to indicate that we're using a custom registry
  echo "${DOCKER_REGISTRY_URL}" > ./.docker-registry-url
  
  # Configure podman to use the custom registry
  log "INFO" "Configuring podman to use custom registry..."
  mkdir -p ~/.config/containers
  cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["${DOCKER_REGISTRY_URL}", "docker.io", "quay.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL

  # Login to the registry if credentials are provided
  if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then
    log "INFO" "Logging in to Docker registry..."
    echo "$DOCKER_PASSWORD" | podman login --username "$DOCKER_USERNAME" --password-stdin "$DOCKER_REGISTRY_URL"
  fi
  
  # Create a wrapper for podman build to use our custom registry
  log "INFO" "Creating podman build wrapper..."
  cat > /tmp/podman-build-wrapper.sh << EOL
#!/bin/bash
# This is a wrapper for podman build that uses our custom registry
# Usage: podman-build-wrapper.sh [args]

# Extract the original command
ARGS="\$@"

# Replace docker.io with our custom registry in the command
ARGS=\$(echo "\$ARGS" | sed "s|docker.io/library/|${DOCKER_REGISTRY_URL}/library/|g")

# Run the modified command
echo "Running: podman \$ARGS"
podman \$ARGS
EOL
  chmod +x /tmp/podman-build-wrapper.sh
  
  # Create an alias for podman build
  log "INFO" "Creating alias for podman build..."
  alias podman-build="/tmp/podman-build-wrapper.sh"
  
  log "SUCCESS" "Dockerfiles and compose files updated to use custom registry."
else
  log "WARNING" "No Docker registry URL provided. Using default Docker Hub."
fi

# Create a file with the registry prefix for other scripts to use
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  echo "REGISTRY_PREFIX=${DOCKER_REGISTRY_URL}/library" > ./.registry-prefix
else
  echo "REGISTRY_PREFIX=docker.io/library" > ./.registry-prefix
fi

exit 0