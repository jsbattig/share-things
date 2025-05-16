#!/bin/bash

# Script to configure Podman to use Docker Hub authentication
# This script should be run in the CI environment before building or pulling images

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log function
log() {
  local level=$1
  local message=$2
  echo -e "${!level}[${level}] ${message}${NC}"
}

# Check if Docker Hub credentials are provided
if [ -z "$DOCKERHUB_USERNAME" ] || [ -z "$DOCKERHUB_TOKEN" ]; then
  log "RED" "Docker Hub credentials not provided. Skipping authentication."
  exit 1
fi

log "INFO" "Configuring Podman to use Docker Hub authentication..."

# Create auth directory if it doesn't exist
mkdir -p ~/.config/containers/auth.json.d

# Create auth.json file with Docker Hub credentials
cat > ~/.config/containers/auth.json << EOL
{
  "auths": {
    "docker.io": {
      "auth": "$(echo -n "${DOCKERHUB_USERNAME}:${DOCKERHUB_TOKEN}" | base64)"
    }
  }
}
EOL

# Set permissions
chmod 600 ~/.config/containers/auth.json

log "GREEN" "Docker Hub authentication configured successfully."

# Test authentication
log "INFO" "Testing Docker Hub authentication..."
podman login --username "$DOCKERHUB_USERNAME" --password "$DOCKERHUB_TOKEN" docker.io

if [ $? -eq 0 ]; then
  log "GREEN" "Docker Hub authentication test successful."
else
  log "RED" "Docker Hub authentication test failed."
  exit 1
fi

exit 0