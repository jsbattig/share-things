#!/bin/bash

# Rocky Linux Wrapper Script for ShareThings Testing
# This script connects to a Rocky Linux machine and runs the test scripts
# It uses environment variables for sensitive information
#
# For detailed documentation on the purpose, usage, and workflow of this script,
# please refer to: memory-bank/technical/rocky-linux-wrapper.md
#
# Quick Start:
# 1. Set environment variables (if not already set):
#    ./ci/rocky-linux/setup-env.sh
# 2. Make changes to setup.sh or update-server.sh
# 3. Commit and push changes to the current branch
# 4. Run this wrapper script:
#    ./ci/rocky-linux/rocky-linux-wrapper.sh
# 5. Review the output and debug any issues

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration from environment variables
REMOTE_HOST="${ROCKY_LINUX_HOST}"
REMOTE_USER="${ROCKY_LINUX_USER}"
REMOTE_PASS="${ROCKY_LINUX_PASSWORD}"
REPO_URL="https://github.com/jsbattig/share-things.git"
BRANCH="${1:-"feature/postgresql-session-management"}"
WORK_DIR="~/share-things-test"

# Docker registry configuration
DOCKER_REGISTRY_URL="${DOCKER_REGISTRY_URL:-""}"
DOCKER_USERNAME="${DOCKER_USERNAME:-""}"
DOCKER_PASSWORD="${DOCKER_PASSWORD:-""}"

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

# Timeout settings for remote commands
SETUP_TEST_TIMEOUT=1800  # 30 minutes timeout for setup test
UPDATE_TEST_TIMEOUT=1800  # 30 minutes timeout for update test

# Function to run a command on the remote machine
run_remote_command() {
    local command="$1"
    echo -e "${BLUE}Running command on remote machine: ${command}${NC}"
    
    # Use -tt to force allocation of a pseudo-terminal, which helps with interactive commands like sudo
    sshpass -p "${REMOTE_PASS}" ssh -tt -o StrictHostKeyChecking=no -o ConnectTimeout=30 "${REMOTE_USER}@${REMOTE_HOST}" "${command}"
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Command failed with exit code ${exit_code}${NC}"
        return $exit_code
    fi
    return 0
}

# Function to run a sudo command on the remote machine
run_sudo_command() {
    local command="$1"
    echo -e "${BLUE}Running sudo command on remote machine: ${command}${NC}"
    
    # Use sshpass to provide the password for both SSH and sudo
    sshpass -p "${REMOTE_PASS}" ssh -tt -o StrictHostKeyChecking=no -o ConnectTimeout=30 "${REMOTE_USER}@${REMOTE_HOST}" "echo '${REMOTE_PASS}' | sudo -S ${command}"
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Command failed with exit code ${exit_code}${NC}"
        return $exit_code
    fi
    return 0
}

# Main script
echo -e "${BLUE}=== ShareThings Rocky Linux Testing Wrapper ===${NC}"
echo "This script will connect to a Rocky Linux machine and run the test scripts."
echo "Remote host: ${REMOTE_HOST}"
echo "Remote user: ${REMOTE_USER}"
echo "Repository: ${REPO_URL}"
echo "Branch: ${BRANCH}"
echo "Working directory: ${WORK_DIR}"
echo ""

# Check if environment variables are set
if [ -z "${ROCKY_LINUX_HOST}" ] || [ -z "${ROCKY_LINUX_USER}" ] || [ -z "${ROCKY_LINUX_PASSWORD}" ]; then
    echo -e "${RED}Error: Required environment variables are not set.${NC}"
    echo "Please set the following environment variables:"
    echo "  ROCKY_LINUX_HOST - The hostname or IP address of the Rocky Linux machine"
    echo "  ROCKY_LINUX_USER - The username to use for SSH"
    echo "  ROCKY_LINUX_PASSWORD - The password to use for SSH"
    exit 1
fi

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}Error: sshpass is not installed.${NC}"
    echo "Please install sshpass to use this script."
    echo "On macOS: brew install hudochenkov/sshpass/sshpass"
    echo "On Ubuntu/Debian: sudo apt-get install sshpass"
    echo "On CentOS/RHEL: sudo yum install sshpass"
    exit 1
fi

# Check if we can connect to the remote machine
echo -e "${YELLOW}Checking connection to remote machine...${NC}"
if ! run_remote_command "echo 'Connection successful'"; then
    echo -e "${RED}Failed to connect to remote machine.${NC}"
    exit 1
fi

# Create working directory if it doesn't exist
echo -e "${YELLOW}Creating working directory...${NC}"
run_remote_command "mkdir -p ${WORK_DIR}"

# Clone or update the repository
echo -e "${YELLOW}Cloning or updating repository...${NC}"
if run_remote_command "[ -d ${WORK_DIR}/.git ]"; then
    echo -e "${GREEN}Repository already exists. Updating...${NC}"
    run_remote_command "cd ${WORK_DIR} && git checkout -- . && git fetch && git checkout ${BRANCH} && git pull"
else
    echo -e "${GREEN}Cloning repository...${NC}"
    run_remote_command "git clone -b ${BRANCH} ${REPO_URL} ${WORK_DIR}"
fi

# Make scripts executable
echo -e "${YELLOW}Making scripts executable...${NC}"
run_remote_command "cd ${WORK_DIR} && chmod +x setup.sh update-server.sh ci/rocky-linux/*.sh"

# Install required packages
echo -e "${YELLOW}Installing required packages...${NC}"
run_sudo_command "dnf install -y podman podman-compose curl util-linux-user"

# Run the setup test script
echo -e "${YELLOW}Running the setup test script...${NC}"

# Build the setup test command with Docker registry parameters
SETUP_TEST_CMD="cd ${WORK_DIR} && ./ci/rocky-linux/test-setup.sh ${BRANCH} ${WORK_DIR}"

# Add Docker registry parameters if provided
if [ -n "$DOCKER_REGISTRY_URL" ]; then
    SETUP_TEST_CMD="${SETUP_TEST_CMD} --docker-registry-url ${DOCKER_REGISTRY_URL}"
fi
if [ -n "$DOCKER_USERNAME" ]; then
    SETUP_TEST_CMD="${SETUP_TEST_CMD} --docker-username ${DOCKER_USERNAME}"
fi
if [ -n "$DOCKER_PASSWORD" ]; then
    SETUP_TEST_CMD="${SETUP_TEST_CMD} --docker-password ${DOCKER_PASSWORD}"
fi

run_remote_command "$SETUP_TEST_CMD"
if [ $? -ne 0 ]; then
    echo -e "${RED}Setup test failed.${NC}"
    exit 1
fi

# Run the update test script
echo -e "${YELLOW}Running the update test script...${NC}"

# Build the update test command with Docker registry parameters
UPDATE_TEST_CMD="cd ${WORK_DIR} && ./ci/rocky-linux/test-update.sh ${BRANCH} ${WORK_DIR} 15000"

# Add Docker registry parameters if provided
if [ -n "$DOCKER_REGISTRY_URL" ]; then
    UPDATE_TEST_CMD="${UPDATE_TEST_CMD} --docker-registry-url ${DOCKER_REGISTRY_URL}"
fi
if [ -n "$DOCKER_USERNAME" ]; then
    UPDATE_TEST_CMD="${UPDATE_TEST_CMD} --docker-username ${DOCKER_USERNAME}"
fi
if [ -n "$DOCKER_PASSWORD" ]; then
    UPDATE_TEST_CMD="${UPDATE_TEST_CMD} --docker-password ${DOCKER_PASSWORD}"
fi

run_remote_command "$UPDATE_TEST_CMD"
if [ $? -ne 0 ]; then
    echo -e "${RED}Update test failed.${NC}"
    exit 1
fi

echo -e "${GREEN}All tests completed successfully!${NC}"
echo "The ShareThings application has been tested on a Rocky Linux machine."

exit 0