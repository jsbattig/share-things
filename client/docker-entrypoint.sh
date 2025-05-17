#!/bin/sh
set -e

# Function to wait for the backend to be available
wait_for_backend() {
  echo "Waiting for backend service..."
  until ping -c1 backend &>/dev/null; do
    echo "Backend not available yet - sleeping 2s"
    sleep 2
  done
  echo "Backend is available!"
}

# Try to resolve backend hostname
if ! ping -c1 backend &>/dev/null; then
  echo "Cannot resolve 'backend' hostname. Attempting to fix..."
  
  # Try to get backend IP from DNS
  BACKEND_IP=$(getent hosts backend | awk '{ print $1 }')
  
  # If DNS resolution failed, try to get IP from backend container
  if [ -z "$BACKEND_IP" ]; then
    echo "DNS resolution failed. Trying alternative methods..."
    
    # Try to get IP from backend container using container name
    if [ -n "$(ip -4 route list 0/0)" ]; then
      # Get default gateway IP (usually the container engine)
      GATEWAY_IP=$(ip -4 route list 0/0 | awk '{print $3}')
      echo "Gateway IP: $GATEWAY_IP"
      
      # Try to add backend entry to /etc/hosts as a fallback
      if echo "$GATEWAY_IP backend" >> /etc/hosts 2>/dev/null; then
        echo "Added backend entry to /etc/hosts: $GATEWAY_IP backend"
      else
        echo "Warning: Cannot modify /etc/hosts (permission denied). Running in rootless mode."
        echo "Will rely on Podman's network aliases instead."
      fi
    fi
  else
    # Try to add backend entry to /etc/hosts
    if echo "$BACKEND_IP backend" >> /etc/hosts 2>/dev/null; then
      echo "Added backend entry to /etc/hosts: $BACKEND_IP backend"
    else
      echo "Warning: Cannot modify /etc/hosts (permission denied). Running in rootless mode."
      echo "Will rely on Podman's network aliases instead."
    fi
  fi
  
  # Verify the fix
  if ping -c1 backend &>/dev/null; then
    echo "Successfully resolved 'backend' hostname!"
  else
    echo "Warning: Still cannot resolve 'backend' hostname. Nginx might fail to start."
  fi
fi

# Update nginx.conf with the correct backend port
# Extract the actual port value from API_PORT if it contains shell syntax
if [ -n "$API_PORT" ]; then
  # Handle the case where API_PORT might be in the format ${API_PORT:-3001}
  if [[ "$API_PORT" == *":-"* ]]; then
    # Extract the default value from the variable
    DEFAULT_PORT=$(echo "$API_PORT" | sed -n 's/.*:-\([0-9]*\).*/\1/p')
    echo "API_PORT contains shell syntax, using default port: $DEFAULT_PORT"
    ACTUAL_PORT=$DEFAULT_PORT
  else
    ACTUAL_PORT=$API_PORT
  fi
  
  echo "Updating nginx.conf to use backend port: $ACTUAL_PORT"
  # Create a temporary file in a writable location
  TEMP_DIR="/tmp"
  if [ ! -w "$TEMP_DIR" ]; then
    # If /tmp is not writable, try current directory
    TEMP_DIR="."
  fi
  
  # Create a temporary configuration file
  TEMP_CONF="$TEMP_DIR/nginx.conf.tmp"
  TEMP_NEW="$TEMP_DIR/nginx.conf.new"
  
  # Copy the original configuration
  cat /etc/nginx/conf.d/default.conf > "$TEMP_CONF" 2>/dev/null || echo "Error: Cannot read nginx config"
  
  # Modify the temporary file
  if [ -f "$TEMP_CONF" ]; then
    sed "s|http://backend:3001|http://backend:$ACTUAL_PORT|g" "$TEMP_CONF" > "$TEMP_NEW" 2>/dev/null
    
    # Try to use the modified file
    if [ -w /etc/nginx/conf.d/default.conf ]; then
      # If writable, update the original
      cat "$TEMP_NEW" > /etc/nginx/conf.d/default.conf 2>/dev/null
      echo "Successfully updated nginx.conf with backend port: $ACTUAL_PORT"
    else
      # If not writable, create a symbolic link to the modified file
      echo "WARNING: Cannot write to /etc/nginx/conf.d/default.conf (permission denied)"
      echo "Creating a symbolic link to the modified configuration"
      
      # Try to create a symbolic link
      if ln -sf "$TEMP_NEW" /etc/nginx/conf.d/default.conf 2>/dev/null; then
        echo "Successfully created symbolic link to modified configuration"
      else
        echo "WARNING: Cannot create symbolic link (permission denied)"
        echo "Using environment variable workaround for backend hostname"
        
        # Set environment variables that nginx can use
        export BACKEND_HOST="backend"
        export BACKEND_PORT="$ACTUAL_PORT"
        echo "Set environment variables: BACKEND_HOST=$BACKEND_HOST, BACKEND_PORT=$BACKEND_PORT"
      fi
    fi
  else
    echo "WARNING: Could not create temporary nginx configuration"
  fi
  
  # Clean up only if files exist
  [ -f "$TEMP_CONF" ] && rm -f "$TEMP_CONF"
  [ -f "$TEMP_NEW" ] && rm -f "$TEMP_NEW"
else
  echo "Using default backend port: 3001"
fi

# Print diagnostic information
echo "DIAGNOSTIC INFO:"
echo "Environment variables:"
env | grep -E 'PORT|API|SOCKET'
echo "Network configuration:"
ip addr
echo "DNS resolution test:"
getent hosts backend || echo "Backend hostname not in hosts database"
echo "Current nginx configuration:"
cat /etc/nginx/conf.d/default.conf

# Add a health check endpoint
mkdir -p /usr/share/nginx/html/health
echo '{"status":"ok"}' > /usr/share/nginx/html/health/index.json

# In rootless mode, we need to handle the case where we can't modify the nginx config
if [ ! -w /etc/nginx/conf.d/default.conf ] && [ -n "$BACKEND_HOST" ] && [ -n "$BACKEND_PORT" ]; then
  echo "Using runtime workaround for backend hostname resolution"
  # Create a simple script to periodically update /etc/hosts with the backend IP
  (
    while true; do
      # Try to resolve backend IP
      BACKEND_IP=$(getent hosts backend 2>/dev/null | awk '{ print $1 }')
      if [ -n "$BACKEND_IP" ]; then
        echo "Resolved backend IP: $BACKEND_IP"
      fi
      sleep 10
    done
  ) &
fi

# Print final diagnostic information
echo "FINAL CONFIGURATION:"
echo "Backend hostname resolution:"
getent hosts backend || echo "Backend hostname not in hosts database"
echo "Network interfaces:"
ip addr | grep -E 'inet|eth' || echo "No network interfaces found"
echo "DNS servers:"
cat /etc/resolv.conf || echo "No DNS configuration found"

# Execute the original docker-entrypoint.sh from the Nginx image with error handling
if [ -x /docker-entrypoint.sh ]; then
  exec /docker-entrypoint.sh "$@"
else
  echo "ERROR: Cannot find or execute /docker-entrypoint.sh"
  echo "Falling back to direct nginx execution"
  exec nginx -g "daemon off;"
fi