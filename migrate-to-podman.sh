#!/bin/bash

# Script to migrate from Docker to Podman
# This script helps with the migration process from Docker to Podman

set -e

echo "Starting Docker to Podman migration..."

# Check if Podman is installed
if ! command -v podman &> /dev/null; then
    echo "Podman is not installed. Please install Podman first."
    exit 1
fi

echo "Podman version: $(podman --version)"

# Check if podman-compose is installed
if ! command -v podman-compose &> /dev/null; then
    echo "podman-compose is not installed. Please install podman-compose first."
    exit 1
fi

echo "podman-compose version: $(podman-compose --version)"

# Stop any running Docker containers
echo "Stopping Docker containers..."
if command -v docker &> /dev/null; then
    docker-compose down || true
fi

# Stop any running Podman containers
echo "Stopping Podman containers..."
podman-compose -f podman-compose.yml down || true

# Clean up Podman system
echo "Cleaning up Podman system..."
podman system prune -a --volumes -f || true

# Create backup of Docker files
echo "Creating backup of Docker files..."
BACKUP_DIR="docker-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p $BACKUP_DIR
cp docker-compose.yml $BACKUP_DIR/ || true
cp docker-compose.prod.yml $BACKUP_DIR/ || true
cp docker-compose.test.yml $BACKUP_DIR/ || true
cp DOCKER.md $BACKUP_DIR/ || true
cp build-and-test.sh $BACKUP_DIR/ || true
cp build-production.sh $BACKUP_DIR/ || true
cp setup.sh $BACKUP_DIR/ || true

echo "Docker files backed up to $BACKUP_DIR/"

# Check if podman-compose.yml exists
if [ ! -f "podman-compose.yml" ]; then
    echo "Creating podman-compose.yml from docker-compose.yml..."
    cp docker-compose.yml podman-compose.yml
fi

# Check if podman-compose.prod.yml exists
if [ ! -f "podman-compose.prod.yml" ]; then
    echo "Creating podman-compose.prod.yml from docker-compose.prod.yml..."
    cp docker-compose.prod.yml podman-compose.prod.yml
fi

# Check if podman-compose.test.yml exists
if [ ! -f "podman-compose.test.yml" ]; then
    echo "Creating podman-compose.test.yml from docker-compose.test.yml..."
    cp docker-compose.test.yml podman-compose.test.yml
fi

# Remove PostgreSQL dependencies from server
echo -e "${YELLOW}Removing PostgreSQL dependencies from server...${NC}"
cd server
if grep -q '"pg":' package.json; then
    echo "Removing pg package from package.json..."
    $SED_CMD 's/"pg": ".*",//' package.json
    echo "Running npm install to update package-lock.json..."
    npm install
    echo -e "${GREEN}PostgreSQL dependencies removed.${NC}"
else
    echo -e "${GREEN}No PostgreSQL dependencies found.${NC}"
fi

# Rebuild the server TypeScript code
echo -e "${YELLOW}Rebuilding server TypeScript code...${NC}"
npm run build
cd ..

# Build and start the containers with Podman
echo "Building and starting containers with Podman..."
# Set environment variable for rootless Podman
export PODMAN_USERNS=keep-id
podman-compose -f podman-compose.yml build
podman-compose -f podman-compose.yml up -d

# Check if containers are running
echo "Checking if containers are running..."
podman-compose -f podman-compose.yml ps

echo "Migration completed successfully!"
echo "You can now access the application at http://localhost:8080"
echo "API is available at http://localhost:3001"