#!/bin/bash

# Script to configure Podman to use Docker repositories with optional authentication
# This script accepts parameters for Docker proxy repository URL, username, and password
# If no URL is provided, the default Docker Hub is used

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DOCKER_REGISTRY_URL=${DOCKER_REGISTRY_URL:-"docker.io"}
DOCKER_USERNAME=${DOCKER_USERNAME:-""}
DOCKER_PASSWORD=${DOCKER_PASSWORD:-""}

# Log function
log() {
  local level=$1
  local message=$2
  echo -e "${!level}[${level}] ${message}${NC}"
}

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

log "INFO" "Configuring Podman for Docker registry access..."
log "INFO" "Docker Registry URL: ${DOCKER_REGISTRY_URL}"
log "INFO" "Docker Username: ${DOCKER_USERNAME:-not set}"
log "INFO" "Docker Password: ${DOCKER_PASSWORD:+masked}"

# Create registries.conf to ensure the registry is in the search path
mkdir -p ~/.config/containers

# Extract only the hostname and port from the registry URL for registries.conf
registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
registry_url_no_scheme="${registry_url_no_scheme#https://}"
# Extract only the hostname and port (remove path)
registry_hostname_port="${registry_url_no_scheme%%/*}"

cat > ~/.config/containers/registries.conf << EOL
[registries.search]
registries = ["${registry_hostname_port}", "docker.io", "quay.io"]

[registries.insecure]
registries = []

[registries.block]
registries = []

[engine]
short-name-mode="permissive"
EOL

# Skip system-wide configuration - only use user-level configuration
log "INFO" "Using user-level configuration only (skipping system-wide configuration)"

# If username and password are provided, set up authentication
if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then
  log "INFO" "Setting up Docker registry authentication..."
  
  # Create auth directory if it doesn't exist
  mkdir -p ~/.config/containers/auth.json.d
  
  # Create auth.json file with Docker credentials
  cat > ~/.config/containers/auth.json << EOL
{
  "auths": {
    "${DOCKER_REGISTRY_URL}": {
      "auth": "$(echo -n "${DOCKER_USERNAME}:${DOCKER_PASSWORD}" | base64)"
    }
  }
}
EOL
  
  # Set permissions
  chmod 600 ~/.config/containers/auth.json
  
  # Skip system-wide auth.json creation
  log "INFO" "Using user-level auth.json only (skipping system-wide configuration)"
  
  # Test authentication
  log "INFO" "Testing Docker registry authentication..."
  podman login --username "$DOCKER_USERNAME" --password "$DOCKER_PASSWORD" "$DOCKER_REGISTRY_URL"
  
  if [ $? -eq 0 ]; then
    log "GREEN" "Docker registry authentication successful."
    
    # Create a marker file to indicate successful authentication
    echo "${DOCKER_REGISTRY_URL}" > ./.docker-registry-authenticated
    echo "${DOCKER_USERNAME}" >> ./.docker-registry-authenticated
    chmod 600 ./.docker-registry-authenticated
    
    # Export environment variables for child processes
    export DOCKER_REGISTRY_URL="${DOCKER_REGISTRY_URL}"
    export DOCKER_USERNAME="${DOCKER_USERNAME}"
    export DOCKER_PASSWORD="${DOCKER_PASSWORD}"
    
    # Create a script that can be sourced by other scripts
    cat > ./.docker-registry-env.sh << EOL
#!/bin/bash
export DOCKER_REGISTRY_URL="${DOCKER_REGISTRY_URL}"
export DOCKER_USERNAME="${DOCKER_USERNAME}"
export DOCKER_PASSWORD="${DOCKER_PASSWORD}"
EOL
    chmod 700 ./.docker-registry-env.sh
  else
    log "YELLOW" "Docker registry authentication failed. Will try to use public repositories."
  fi
else
  log "INFO" "No authentication credentials provided. Using public repositories."
fi

# If registry URL is provided, update Dockerfiles to use it
if [ -n "$DOCKER_REGISTRY_URL" ]; then
  log "INFO" "Updating Dockerfiles to use custom registry URL: $DOCKER_REGISTRY_URL"
  
  # Check if we're in a CI/CD environment
  if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$GITLAB_CI" ] || [ -n "$JENKINS_URL" ]; then
    log "INFO" "Running in CI/CD environment. Checking for temporary Dockerfiles..."
    
    # Check for temporary Dockerfiles
    TEMP_DOCKERFILES=$(find /tmp -name "Dockerfile*" -type f 2>/dev/null)
    if [ -n "$TEMP_DOCKERFILES" ]; then
      log "INFO" "Found temporary Dockerfiles:"
      echo "$TEMP_DOCKERFILES"
      
      # Update temporary Dockerfiles
      for file in $TEMP_DOCKERFILES; do
        log "INFO" "Updating temporary Dockerfile: $file"
        log "INFO" "Before update:"
        head -10 "$file"
        
        # Create a temporary file for the modified Dockerfile
        TEMP_FILE=$(mktemp)
        
        # Read the Dockerfile line by line and replace all FROM statements
        while IFS= read -r line; do
          if [[ $line =~ ^FROM ]]; then
            # Extract the image name and tag
            if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
              image="${BASH_REMATCH[1]}"
              rest="${BASH_REMATCH[2]}"
              
              # Remove docker.io prefix if present
              image_without_prefix="${image#docker.io/}"
              
              # Construct the new image reference with the custom registry
              # Remove trailing slash from registry URL if present
              registry_url="${DOCKER_REGISTRY_URL%/}"
              
              # Construct the new image reference
              new_image="${registry_url}/${image_without_prefix}"
              
              # Replace the line
              log "INFO" "Replacing FROM statement: $line"
              log "INFO" "With: FROM $new_image$rest"
              echo "FROM $new_image$rest" >> "$TEMP_FILE"
            else
              # If we couldn't parse the FROM statement, keep it as is
              echo "$line" >> "$TEMP_FILE"
            fi
          else
            # Not a FROM statement, keep it as is
            echo "$line" >> "$TEMP_FILE"
          fi
        done < "$file"
        
        # Replace the original file with the modified one
        mv "$TEMP_FILE" "$file"
        
        log "INFO" "After update:"
        head -10 "$file"
        
        # Verify the update
        if ! grep -q "$DOCKER_REGISTRY_URL" "$file"; then
          log "ERROR" "Failed to update temporary Dockerfile: $file"
          log "ERROR" "Custom Docker registry URL not found in the file after update."
        else
          log "SUCCESS" "Successfully updated temporary Dockerfile: $file"
        fi
      done
    else
      log "INFO" "No temporary Dockerfiles found."
    fi
  fi
  
  # Update server Dockerfile
  if [ -f "./server/Dockerfile" ]; then
    log "INFO" "Updating server/Dockerfile..."
    log "INFO" "Before update (first 10 lines):"
    head -10 ./server/Dockerfile
    
    # Create a temporary file for the modified Dockerfile
    TEMP_FILE=$(mktemp)
    
    # Read the Dockerfile line by line and replace all FROM statements
    while IFS= read -r line; do
      if [[ $line =~ ^FROM ]]; then
        # Extract the image name and tag
        if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
          image="${BASH_REMATCH[1]}"
          rest="${BASH_REMATCH[2]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove https:// or http:// prefix from registry URL for image references
          registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
          registry_url_no_scheme="${registry_url_no_scheme#https://}"
          # Remove trailing slash if present
          registry_url_no_scheme="${registry_url_no_scheme%/}"
          
          # Construct the new image reference
          new_image="${registry_url_no_scheme}/${image_without_prefix}"
          
          # Replace the line
          log "INFO" "Replacing FROM statement: $line"
          echo "FROM $new_image$rest" >> "$TEMP_FILE"
        else
          # If we couldn't parse the FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      else
        # Not a FROM statement, keep it as is
        echo "$line" >> "$TEMP_FILE"
      fi
    done < "./server/Dockerfile"
    
    # Replace the original file with the modified one
    mv "$TEMP_FILE" "./server/Dockerfile"
    
    log "INFO" "After update (first 10 lines):"
    head -10 ./server/Dockerfile
    log "INFO" "Verifying FROM statements in server/Dockerfile:"
    grep -n "FROM" ./server/Dockerfile || log "WARNING" "No FROM statements found after update"
  fi
  
  # Update client Dockerfile
  if [ -f "./client/Dockerfile" ]; then
    log "INFO" "Updating client/Dockerfile..."
    log "INFO" "Before update (first 10 lines):"
    head -10 ./client/Dockerfile
    
    # Create a temporary file for the modified Dockerfile
    TEMP_FILE=$(mktemp)
    
    # Read the Dockerfile line by line and replace all FROM statements
    while IFS= read -r line; do
      if [[ $line =~ ^FROM ]]; then
        # Extract the image name and tag
        if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
          image="${BASH_REMATCH[1]}"
          rest="${BASH_REMATCH[2]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove https:// or http:// prefix from registry URL for image references
          registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
          registry_url_no_scheme="${registry_url_no_scheme#https://}"
          # Remove trailing slash if present
          registry_url_no_scheme="${registry_url_no_scheme%/}"
          
          # Construct the new image reference
          new_image="${registry_url_no_scheme}/${image_without_prefix}"
          
          # Replace the line
          log "INFO" "Replacing FROM statement: $line"
          echo "FROM $new_image$rest" >> "$TEMP_FILE"
        else
          # If we couldn't parse the FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      else
        # Not a FROM statement, keep it as is
        echo "$line" >> "$TEMP_FILE"
      fi
    done < "./client/Dockerfile"
    
    # Replace the original file with the modified one
    mv "$TEMP_FILE" "./client/Dockerfile"
    
    log "INFO" "After update (first 10 lines):"
    head -10 ./client/Dockerfile
    log "INFO" "Verifying FROM statements in client/Dockerfile:"
    grep -n "FROM" ./client/Dockerfile || log "WARNING" "No FROM statements found after update"
  fi
  
  # Update docker-compose files to use custom registry
  for compose_file in docker-compose.yml docker-compose.prod.yml docker-compose.test.yml; do
    if [ -f "./$compose_file" ]; then
      log "INFO" "Updating $compose_file..."
      
      # Create a temporary file for the modified compose file
      TEMP_FILE=$(mktemp)
      
      # Read the compose file line by line and replace image references
      while IFS= read -r line; do
        if [[ $line =~ image:[[:space:]]+(.*) ]]; then
          image="${BASH_REMATCH[1]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove https:// or http:// prefix from registry URL for image references
          registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
          registry_url_no_scheme="${registry_url_no_scheme#https://}"
          # Remove trailing slash if present
          registry_url_no_scheme="${registry_url_no_scheme%/}"
          
          # Construct the new image reference
          new_image="${registry_url_no_scheme}/${image_without_prefix}"
          
          # Replace the line
          log "INFO" "Replacing image reference: $line"
          log "INFO" "With: image: $new_image"
          echo "      image: $new_image" >> "$TEMP_FILE"
        else
          # Not an image reference, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      done < "./$compose_file"
      
      # Replace the original file with the modified one
      mv "$TEMP_FILE" "./$compose_file"
      
      log "INFO" "Updated $compose_file successfully"
    fi
  done
  
  # Update server/Dockerfile.test if it exists
  if [ -f "./server/Dockerfile.test" ]; then
    log "INFO" "Updating server/Dockerfile.test..."
    log "INFO" "Before update (first 10 lines):"
    head -10 ./server/Dockerfile.test
    
    # Check if the file contains the pattern we're looking for
    if grep -q "FROM docker.io/library/" ./server/Dockerfile.test; then
      log "INFO" "Found 'FROM docker.io/library/' pattern in server/Dockerfile.test"
      # Do the original replacement
      # Remove https:// or http:// prefix from registry URL for image references
      registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
      registry_url_no_scheme="${registry_url_no_scheme#https://}"
      # Remove trailing slash if present
      registry_url_no_scheme="${registry_url_no_scheme%/}"
      
      sed -i "s|FROM docker.io/library/|FROM ${registry_url_no_scheme}/library/|g" ./server/Dockerfile.test
    else
      log "WARNING" "Pattern 'FROM docker.io/library/' not found in server/Dockerfile.test"
      log "INFO" "Checking for other FROM patterns..."
      grep -n "FROM" ./server/Dockerfile.test || log "WARNING" "No FROM statements found"
      
      # Try multiple replacement patterns
      log "INFO" "Trying multiple replacement patterns for server/Dockerfile.test..."
      # Remove https:// or http:// prefix from registry URL for image references
      registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
      registry_url_no_scheme="${registry_url_no_scheme#https://}"
      # Remove trailing slash if present
      registry_url_no_scheme="${registry_url_no_scheme%/}"
      
      sed -i "s|FROM node:|FROM ${registry_url_no_scheme}/library/node:|g" ./server/Dockerfile.test
      sed -i "s|FROM alpine:|FROM ${registry_url_no_scheme}/library/alpine:|g" ./server/Dockerfile.test
      sed -i "s|FROM nginx:|FROM ${registry_url_no_scheme}/library/nginx:|g" ./server/Dockerfile.test
      
      # Handle multi-stage builds with AS
      sed -i "s|FROM node:.* AS |FROM ${registry_url_no_scheme}/library/node:18-alpine AS |g" ./server/Dockerfile.test
    fi
    
    # Create a temporary file for the modified Dockerfile
    TEMP_FILE=$(mktemp)
    
    # Read the Dockerfile line by line and replace all FROM statements
    while IFS= read -r line; do
      if [[ $line =~ ^FROM ]]; then
        # Extract the image name and tag
        if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
          image="${BASH_REMATCH[1]}"
          rest="${BASH_REMATCH[2]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove https:// or http:// prefix from registry URL for image references
          registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
          registry_url_no_scheme="${registry_url_no_scheme#https://}"
          # Remove trailing slash if present
          registry_url_no_scheme="${registry_url_no_scheme%/}"
          
          # Construct the new image reference
          new_image="${registry_url_no_scheme}/${image_without_prefix}"
          
          # Replace the line
          log "INFO" "Replacing FROM statement: $line"
          log "INFO" "With: FROM $new_image$rest"
          echo "FROM $new_image$rest" >> "$TEMP_FILE"
        else
          # If we couldn't parse the FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      else
        # Not a FROM statement, keep it as is
        echo "$line" >> "$TEMP_FILE"
      fi
    done < "./server/Dockerfile.test"
    
    # Replace the original file with the modified one
    mv "$TEMP_FILE" "./server/Dockerfile.test"
    
    log "INFO" "After update (first 10 lines):"
    head -10 ./server/Dockerfile.test
    log "INFO" "Verifying FROM statements in server/Dockerfile.test:"
    grep -n "FROM" ./server/Dockerfile.test || log "WARNING" "No FROM statements found after update"
  fi
  
  # Update client/Dockerfile.test if it exists
  if [ -f "./client/Dockerfile.test" ]; then
    log "INFO" "Updating client/Dockerfile.test..."
    log "INFO" "Before update (first 10 lines):"
    head -10 ./client/Dockerfile.test
    
    # Create a temporary file for the modified Dockerfile
    TEMP_FILE=$(mktemp)
    
    # Read the Dockerfile line by line and replace all FROM statements
    while IFS= read -r line; do
      if [[ $line =~ ^FROM ]]; then
        # Extract the image name and tag
        if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
          image="${BASH_REMATCH[1]}"
          rest="${BASH_REMATCH[2]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove https:// or http:// prefix from registry URL for image references
          registry_url_no_scheme="${DOCKER_REGISTRY_URL#http://}"
          registry_url_no_scheme="${registry_url_no_scheme#https://}"
          # Remove trailing slash if present
          registry_url_no_scheme="${registry_url_no_scheme%/}"
          
          # Construct the new image reference
          new_image="${registry_url_no_scheme}/${image_without_prefix}"
          
          # Replace the line
          log "INFO" "Replacing FROM statement: $line"
          log "INFO" "With: FROM $new_image$rest"
          echo "FROM $new_image$rest" >> "$TEMP_FILE"
        else
          # If we couldn't parse the FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      else
        # Not a FROM statement, keep it as is
        echo "$line" >> "$TEMP_FILE"
      fi
    done < "./client/Dockerfile.test"
    
    # Replace the original file with the modified one
    mv "$TEMP_FILE" "./client/Dockerfile.test"
    
    log "INFO" "After update (first 10 lines):"
    head -10 ./client/Dockerfile.test
    log "INFO" "Verifying FROM statements in client/Dockerfile.test:"
    grep -n "FROM" ./client/Dockerfile.test || log "WARNING" "No FROM statements found after update"
  fi
  
  # Create a file to indicate that we're using a custom registry
  echo "${DOCKER_REGISTRY_URL}" > ./.docker-registry-url
  
  # Create a more comprehensive registry info file
  cat > ./.docker-registry-info << EOL
DOCKER_REGISTRY_URL=${DOCKER_REGISTRY_URL}
DOCKER_USERNAME=${DOCKER_USERNAME}
TIMESTAMP=$(date +%s)
EOL
  chmod 600 ./.docker-registry-info
  
  log "GREEN" "Dockerfiles and compose files updated to use custom registry."
  
  # Create a script that can be used by setup.sh and update-server.sh
  cat > ./docker-registry-setup.sh << EOL
#!/bin/bash

# This script is automatically generated by docker-auth.sh
# It contains the necessary configuration for Docker registry access

# Docker registry configuration
export DOCKER_REGISTRY_URL="${DOCKER_REGISTRY_URL}"
export DOCKER_USERNAME="${DOCKER_USERNAME}"
export DOCKER_PASSWORD="${DOCKER_PASSWORD}"

# Function to update Dockerfiles and docker-compose files
update_docker_files() {
  echo "Updating Dockerfiles and docker-compose files to use custom registry: ${DOCKER_REGISTRY_URL}"
  
  # Update server Dockerfile
  if [ -f "./server/Dockerfile" ]; then
    echo "Updating server/Dockerfile..."
    echo "Before update (first 10 lines):"
    head -10 ./server/Dockerfile
    
    # Create a temporary file for the modified Dockerfile
    TEMP_FILE=$(mktemp)
    
    # Read the Dockerfile line by line and replace all FROM statements
    while IFS= read -r line; do
      if [[ $line =~ ^FROM ]]; then
        # Extract the image name and tag
        if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
          image="${BASH_REMATCH[1]}"
          rest="${BASH_REMATCH[2]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove trailing slash from registry URL if present
          registry_url="${DOCKER_REGISTRY_URL%/}"
          
          # Construct the new image reference
          new_image="${registry_url}/${image_without_prefix}"
          
          # Replace the line
          echo "Replacing FROM statement: $line"
          echo "With: FROM $new_image$rest"
          echo "FROM $new_image$rest" >> "$TEMP_FILE"
        else
          # If we couldn't parse the FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      else
        # Not a FROM statement, keep it as is
        echo "$line" >> "$TEMP_FILE"
      fi
    done < "./server/Dockerfile"
    
    # Replace the original file with the modified one
    mv "$TEMP_FILE" "./server/Dockerfile"
    
    echo "After update (first 10 lines):"
    head -10 ./server/Dockerfile
    echo "Verifying FROM statements in server/Dockerfile:"
    grep -n "FROM" ./server/Dockerfile || echo "No FROM statements found after update"
  fi
  
  # Update client Dockerfile
  if [ -f "./client/Dockerfile" ]; then
    echo "Updating client/Dockerfile..."
    echo "Before update (first 10 lines):"
    head -10 ./client/Dockerfile
    
    # Create a temporary file for the modified Dockerfile
    TEMP_FILE=$(mktemp)
    
    # Read the Dockerfile line by line and replace all FROM statements
    while IFS= read -r line; do
      if [[ $line =~ ^FROM ]]; then
        # Extract the image name and tag
        if [[ $line =~ ^FROM[[:space:]]+([^[:space:]]+)(.*)$ ]]; then
          image="${BASH_REMATCH[1]}"
          rest="${BASH_REMATCH[2]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove trailing slash from registry URL if present
          registry_url="${DOCKER_REGISTRY_URL%/}"
          
          # Construct the new image reference
          new_image="${registry_url}/${image_without_prefix}"
          
          # Replace the line
          echo "Replacing FROM statement: $line"
          echo "With: FROM $new_image$rest"
          echo "FROM $new_image$rest" >> "$TEMP_FILE"
        else
          # If we couldn't parse the FROM statement, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      else
        # Not a FROM statement, keep it as is
        echo "$line" >> "$TEMP_FILE"
      fi
    done < "./client/Dockerfile"
    
    # Replace the original file with the modified one
    mv "$TEMP_FILE" "./client/Dockerfile"
    
    echo "After update (first 10 lines):"
    head -10 ./client/Dockerfile
    echo "Verifying FROM statements in client/Dockerfile:"
    grep -n "FROM" ./client/Dockerfile || echo "No FROM statements found after update"
  fi
  
  # Update docker-compose files
  for compose_file in docker-compose.yml docker-compose.prod.yml docker-compose.test.yml; do
    if [ -f "./$compose_file" ]; then
      echo "Updating $compose_file..."
      
      # Create a temporary file for the modified compose file
      TEMP_FILE=$(mktemp)
      
      # Read the compose file line by line and replace image references
      while IFS= read -r line; do
        if [[ $line =~ image:[[:space:]]+(.*) ]]; then
          image="${BASH_REMATCH[1]}"
          
          # Remove docker.io prefix if present
          image_without_prefix="${image#docker.io/}"
          
          # Construct the new image reference with the custom registry
          # Remove trailing slash from registry URL if present
          registry_url="${DOCKER_REGISTRY_URL%/}"
          
          # Construct the new image reference
          new_image="${registry_url}/${image_without_prefix}"
          
          # Replace the line
          echo "Replacing image reference: $line"
          echo "With: image: $new_image"
          echo "      image: $new_image" >> "$TEMP_FILE"
        else
          # Not an image reference, keep it as is
          echo "$line" >> "$TEMP_FILE"
        fi
      done < "./$compose_file"
      
      # Replace the original file with the modified one
      mv "$TEMP_FILE" "./$compose_file"
      
      echo "Updated $compose_file successfully"
    fi
  done
  
  # Clean up backup files
  find . -name "*.bak" -type f -delete 2>/dev/null || true
  
  echo "Docker files updated successfully."
}

# Function to authenticate with Docker registry
authenticate_with_registry() {
  if [ -n "${DOCKER_USERNAME}" ] && [ -n "${DOCKER_PASSWORD}" ]; then
    echo "Authenticating with Docker registry: ${DOCKER_REGISTRY_URL}"
    
    # Create auth directory if it doesn't exist
    mkdir -p ~/.config/containers/auth.json.d
    
    # Create auth.json file with Docker credentials
    cat > ~/.config/containers/auth.json << EOF
{
  "auths": {
    "${DOCKER_REGISTRY_URL}": {
      "auth": "$(echo -n "${DOCKER_USERNAME}:${DOCKER_PASSWORD}" | base64)"
    }
  }
}
EOF
    
    # Set permissions
    chmod 600 ~/.config/containers/auth.json
    
    # Login to registry
    if command -v podman &> /dev/null; then
      podman login --username "${DOCKER_USERNAME}" --password "${DOCKER_PASSWORD}" "${DOCKER_REGISTRY_URL}"
    elif command -v docker &> /dev/null; then
      docker login --username "${DOCKER_USERNAME}" --password "${DOCKER_PASSWORD}" "${DOCKER_REGISTRY_URL}"
    else
      echo "No container engine found. Cannot authenticate."
      return 1
    fi
  else
    echo "No authentication credentials provided. Using public repositories."
  fi
}

# Execute these functions when the script is sourced
update_docker_files
authenticate_with_registry
EOL

  chmod +x ./docker-registry-setup.sh
fi

log "GREEN" "Docker registry configuration completed."
log "INFO" "To use this configuration in other scripts, source ./docker-registry-setup.sh"
exit 0