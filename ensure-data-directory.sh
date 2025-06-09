#!/bin/bash

# Ensure data directory exists with proper permissions for ShareThings
# This script should be run before starting containers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"

echo "Ensuring data directory exists at: $DATA_DIR"

# Create data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    echo "Creating data directory: $DATA_DIR"
    mkdir -p "$DATA_DIR"
else
    echo "Data directory already exists: $DATA_DIR"
fi

# Set proper permissions (readable/writable by owner and group)
echo "Setting permissions on data directory..."
chmod 755 "$DATA_DIR"

# Create subdirectories that the application expects
echo "Creating application subdirectories..."
mkdir -p "$DATA_DIR/sessions"

# Set permissions on subdirectories
chmod 755 "$DATA_DIR/sessions"

echo "Data directory setup complete!"
echo "Directory structure:"
ls -la "$DATA_DIR"