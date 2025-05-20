#!/bin/sh
set -e

# Entrypoint script for Node.js static server
echo "Starting Node.js static server entrypoint script"

# Create necessary directories with proper error handling
if [ ! -d "/app/public/health" ]; then
  mkdir -p /app/public/health || {
    echo "WARNING: Could not create health directory, it may already exist or permissions issue"
  }
fi

# Try to write health check file with error handling
echo '{"status":"ok"}' > /app/public/health/index.json || {
  echo "WARNING: Could not write health check file, using fallback method"
  # Fallback: check if directory exists but isn't writable
  if [ -d "/app/public/health" ] && [ ! -w "/app/public/health" ]; then
    echo "WARNING: Health directory exists but is not writable. Attempting to fix permissions."
    # Try to fix permissions if possible
    chmod -R 755 /app/public/health 2>/dev/null || true
  fi
}

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