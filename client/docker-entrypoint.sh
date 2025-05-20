#!/bin/sh
set -e

# Entrypoint script for Node.js static server
echo "Starting Node.js static server entrypoint script"

# Create necessary directories
mkdir -p /app/public/health
echo '{"status":"ok"}' > /app/public/health/index.json

# Print diagnostic information
echo "DIAGNOSTIC INFO:"
echo "Environment variables:"
env | grep -E 'PORT|API|SOCKET|STATIC'

# Check if the static directory exists
if [ ! -d "$STATIC_DIR" ]; then
  echo "WARNING: Static directory $STATIC_DIR does not exist"
  mkdir -p "$STATIC_DIR"
  echo "<html><body><h1>ShareThings</h1><p>Server is running but no content is available.</p></body></html>" > "$STATIC_DIR/index.html"
fi

# Execute the static server
echo "Starting Node.js static server..."
exec node /app/static-server.js