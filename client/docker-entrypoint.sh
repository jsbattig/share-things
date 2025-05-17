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
  TEMP_CONF=$(mktemp -p /tmp nginx.conf.XXXXXX)
  cat /etc/nginx/conf.d/default.conf > $TEMP_CONF
  
  # Modify the temporary file
  sed "s|http://backend:3001|http://backend:$ACTUAL_PORT|g" $TEMP_CONF > /tmp/nginx.conf.new
  
  # Try to use the modified file
  if [ -w /etc/nginx/conf.d/default.conf ]; then
    # If writable, update the original
    cat /tmp/nginx.conf.new > /etc/nginx/conf.d/default.conf
    echo "Successfully updated nginx.conf with backend port: $ACTUAL_PORT"
  else
    # If not writable, print diagnostic info
    echo "WARNING: Cannot write to /etc/nginx/conf.d/default.conf (permission denied)"
    echo "Current nginx.conf content:"
    cat /etc/nginx/conf.d/default.conf
    echo "Modified content that would be applied:"
    cat /tmp/nginx.conf.new
    echo "Will continue with original configuration"
  fi
  
  # Clean up
  rm -f $TEMP_CONF /tmp/nginx.conf.new
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

# Execute the original docker-entrypoint.sh from the Nginx image
exec /docker-entrypoint.sh "$@"