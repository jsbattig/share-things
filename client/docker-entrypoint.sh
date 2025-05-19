#!/bin/sh
set -e

# Simple entrypoint script that doesn't rely on backend hostname resolution
echo "Starting simplified entrypoint script"

# Add a health check endpoint
mkdir -p /usr/share/nginx/html/health
echo '{"status":"ok"}' > /usr/share/nginx/html/health/index.json

# Print diagnostic information
echo "DIAGNOSTIC INFO:"
echo "Environment variables:"
env | grep -E 'PORT|API|SOCKET'

# Execute the original docker-entrypoint.sh from the Nginx image with error handling
if [ -x /docker-entrypoint.sh ]; then
  exec /docker-entrypoint.sh "$@"
else
  echo "WARNING: Cannot find or execute /docker-entrypoint.sh"
  echo "Falling back to direct nginx execution"
  exec nginx -g "daemon off;"
fi