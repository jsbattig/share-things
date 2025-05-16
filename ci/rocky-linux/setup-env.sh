#!/bin/bash

# Setup Environment Variables for Rocky Linux Testing
# This script sets up environment variables for the Rocky Linux wrapper script
# Run this script once to configure the environment for testing

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to prompt for a value with a default
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    read -p "${prompt} [${default}]: " value
    value="${value:-$default}"
    echo "$value"
}

echo -e "${BLUE}=== ShareThings Rocky Linux Environment Setup ===${NC}"
echo "This script will set up environment variables for Rocky Linux testing."
echo "These variables will be stored in ~/.rocky-linux-env.sh"
echo ""

# Prompt for values
ROCKY_LINUX_HOST=$(prompt_with_default "Enter the hostname or IP address of the Rocky Linux machine" "localhost" "ROCKY_LINUX_HOST")
ROCKY_LINUX_USER=$(prompt_with_default "Enter the username to use for SSH" "$(whoami)" "ROCKY_LINUX_USER")
ROCKY_LINUX_PASSWORD=$(prompt_with_default "Enter the password to use for SSH" "" "ROCKY_LINUX_PASSWORD")

# Create the environment variable file in the user's home directory
echo -e "${YELLOW}Creating environment variable file...${NC}"
cat > ~/.rocky-linux-env.sh << EOF
#!/bin/bash

# Environment variables for Rocky Linux testing
export ROCKY_LINUX_HOST="${ROCKY_LINUX_HOST}"
export ROCKY_LINUX_USER="${ROCKY_LINUX_USER}"
export ROCKY_LINUX_PASSWORD="${ROCKY_LINUX_PASSWORD}"
EOF

# Make the file executable
chmod +x ~/.rocky-linux-env.sh

# Set permissions to restrict access
chmod 600 ~/.rocky-linux-env.sh

echo -e "${GREEN}Environment variables have been set up successfully!${NC}"
echo "The following variables are now available:"
echo "  ROCKY_LINUX_HOST=${ROCKY_LINUX_HOST}"
echo "  ROCKY_LINUX_USER=${ROCKY_LINUX_USER}"
echo "  ROCKY_LINUX_PASSWORD=********"

echo "To use these variables in any session, the following line will be added to your shell profile:"
echo "  source ~/.rocky-linux-env.sh"
echo ""

# Determine which shell profile to use
SHELL_PROFILE=""
if [[ "$SHELL" == *"zsh"* ]]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    SHELL_PROFILE="$HOME/.bash_profile"
  else
    SHELL_PROFILE="$HOME/.bashrc"
  fi
fi

# Add source line to shell profile if it doesn't already exist
if [ -n "$SHELL_PROFILE" ]; then
  if ! grep -q "source ~/.rocky-linux-env.sh" "$SHELL_PROFILE"; then
    echo "" >> "$SHELL_PROFILE"
    echo "# ShareThings Rocky Linux testing environment" >> "$SHELL_PROFILE"
    echo "source ~/.rocky-linux-env.sh" >> "$SHELL_PROFILE"
    echo -e "${GREEN}Added source line to $SHELL_PROFILE${NC}"
  else
    echo -e "${YELLOW}Source line already exists in $SHELL_PROFILE${NC}"
  fi
else
  echo -e "${YELLOW}Could not determine shell profile. Please add the following line manually:${NC}"
  echo "  source ~/.rocky-linux-env.sh"
fi

echo ""
echo "To use these variables immediately in this session, run:"
echo "  source ~/.rocky-linux-env.sh"

# Export the variables for the current session
export ROCKY_LINUX_HOST="${ROCKY_LINUX_HOST}"
export ROCKY_LINUX_USER="${ROCKY_LINUX_USER}"
export ROCKY_LINUX_PASSWORD="${ROCKY_LINUX_PASSWORD}"

# Verify the variables are set
echo ""
echo "Verifying environment variables:"
echo "ROCKY_LINUX_HOST: ${ROCKY_LINUX_HOST}"
echo "ROCKY_LINUX_USER: ${ROCKY_LINUX_USER}"
echo "ROCKY_LINUX_PASSWORD: ${ROCKY_LINUX_PASSWORD}"

exit 0