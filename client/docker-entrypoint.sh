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
      
      # Add backend entry to /etc/hosts as a fallback
      echo "$GATEWAY_IP backend" >> /etc/hosts
      echo "Added backend entry to /etc/hosts: $GATEWAY_IP backend"
    fi
  else
    # Add backend entry to /etc/hosts
    echo "$BACKEND_IP backend" >> /etc/hosts
    echo "Added backend entry to /etc/hosts: $BACKEND_IP backend"
  fi
  
  # Verify the fix
  if ping -c1 backend &>/dev/null; then
    echo "Successfully resolved 'backend' hostname!"
  else
    echo "Warning: Still cannot resolve 'backend' hostname. Nginx might fail to start."
  fi
fi

# Execute the original docker-entrypoint.sh from the Nginx image
exec /docker-entrypoint.sh "$@"