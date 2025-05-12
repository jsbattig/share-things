#!/bin/bash

# ShareThings Remote Setup Script (Simplified Version)
# This script automates the setup of ShareThings on a remote server

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
DEFAULT_REPO="https://github.com/jsbattig/share-things.git"
DEFAULT_BRANCH="master"
DEFAULT_INSTALL_DIR="/opt/share-things"
DEFAULT_NODE_VERSION="18"
LOG_FILE="remote-setup.log"

# Initialize log file
echo "ShareThings Remote Setup Log - $(date)" > $LOG_FILE

# Function to log messages
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    echo -e "[$timestamp] [$level] $message" >> $LOG_FILE
    
    case $level in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        "WARNING")
            echo -e "${YELLOW}[WARNING]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        *)
            echo -e "$message"
            ;;
    esac
}

# Function to check command execution
check_command() {
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Command failed: $1"
        log_message "ERROR" "Check $LOG_FILE for details"
        exit 1
    else
        log_message "SUCCESS" "Command completed: $1"
    fi
}

# Function to collect server details
collect_server_details() {
    log_message "INFO" "Collecting server details..."
    
    # Get server IP
    read -p "Enter server IP address: " SERVER_IP
    while [[ -z "$SERVER_IP" ]]; do
        log_message "WARNING" "IP address cannot be empty"
        read -p "Enter server IP address: " SERVER_IP
    done
    
    # Get SSH username
    read -p "Enter SSH username: " SSH_USER
    while [[ -z "$SSH_USER" ]]; do
        log_message "WARNING" "Username cannot be empty"
        read -p "Enter SSH username: " SSH_USER
    done
    
    # Ask for authentication method
    echo "Select authentication method:"
    echo "1) Password"
    echo "2) SSH Key"
    read -p "Enter your choice (1/2): " AUTH_METHOD
    
    if [[ "$AUTH_METHOD" == "1" ]]; then
        # Get SSH password
        read -s -p "Enter SSH password: " SSH_PASS
        echo
        while [[ -z "$SSH_PASS" ]]; do
            log_message "WARNING" "Password cannot be empty"
            read -s -p "Enter SSH password: " SSH_PASS
            echo
        done
        USE_KEY=false
    else
        # Get SSH key path
        read -p "Enter path to SSH private key [~/.ssh/id_rsa]: " SSH_KEY
        SSH_KEY=${SSH_KEY:-~/.ssh/id_rsa}
        
        if [[ ! -f "$SSH_KEY" ]]; then
            log_message "ERROR" "SSH key not found: $SSH_KEY"
            exit 1
        fi
        USE_KEY=true
    fi
    
    log_message "INFO" "Server details collected"
}

# Function to collect repository details
collect_repository_details() {
    log_message "INFO" "Collecting repository details..."
    
    # Get repository URL
    read -p "Enter Git repository URL [$DEFAULT_REPO]: " REPO_URL
    REPO_URL=${REPO_URL:-$DEFAULT_REPO}
    
    # Get branch
    read -p "Enter branch to clone [$DEFAULT_BRANCH]: " BRANCH
    BRANCH=${BRANCH:-$DEFAULT_BRANCH}
    
    # Get installation directory
    read -p "Enter installation directory [$DEFAULT_INSTALL_DIR]: " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}
    
    log_message "INFO" "Repository details collected"
}

# Function to check if sshpass is installed
check_sshpass() {
    if [[ "$USE_KEY" == false ]]; then
        if ! command -v sshpass &> /dev/null; then
            log_message "WARNING" "sshpass is not installed. Installing..."
            
            if command -v apt-get &> /dev/null; then
                sudo apt-get update >> $LOG_FILE 2>&1
                sudo apt-get install -y sshpass >> $LOG_FILE 2>&1
            elif command -v yum &> /dev/null; then
                sudo yum install -y sshpass >> $LOG_FILE 2>&1
            elif command -v brew &> /dev/null; then
                brew install sshpass >> $LOG_FILE 2>&1
            else
                log_message "ERROR" "Could not install sshpass. Please install it manually."
                exit 1
            fi
            
            check_command "Install sshpass"
        fi
    fi
}

# Function to run a command on the remote server
run_remote_command() {
    local command=$1
    local description=$2
    local allow_fail=${3:-false}
    
    log_message "INFO" "Running command: $command"
    
    if [[ "$USE_KEY" == true ]]; then
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "$command" >> $LOG_FILE 2>&1
    else
        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "$command" >> $LOG_FILE 2>&1
    fi
    
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        if [[ "$allow_fail" == "true" ]]; then
            log_message "WARNING" "Command failed but continuing: $description (exit code: $exit_code)"
            return $exit_code
        else
            log_message "ERROR" "Failed to execute: $description (exit code: $exit_code)"
            log_message "ERROR" "Command: $command"
            exit 1
        fi
    else
        log_message "SUCCESS" "Executed: $description"
        return 0
    fi
}

# Function to run a command with debug output
run_debug_command() {
    local command=$1
    local description=$2
    
    log_message "INFO" "Running debug command: $command"
    
    if [[ "$USE_KEY" == true ]]; then
        output=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "$command" 2>&1)
    else
        output=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "$command" 2>&1)
    fi
    
    local exit_code=$?
    log_message "INFO" "Command output: $output"
    log_message "INFO" "Exit code: $exit_code"
    
    if [ $exit_code -ne 0 ]; then
        log_message "WARNING" "Debug command failed: $description"
    else
        log_message "INFO" "Debug command succeeded: $description"
    fi
    
    echo "$output"
    return $exit_code
}

# Function to test SSH connection
test_ssh_connection() {
    log_message "INFO" "Testing SSH connection..."
    
    if [[ "$USE_KEY" == true ]]; then
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$SSH_USER@$SERVER_IP" echo "SSH connection successful" >> $LOG_FILE 2>&1
    else
        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$SSH_USER@$SERVER_IP" echo "SSH connection successful" >> $LOG_FILE 2>&1
    fi
    
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to connect to $SERVER_IP"
        log_message "ERROR" "Please check your credentials and try again"
        exit 1
    fi
    
    log_message "SUCCESS" "SSH connection successful"
}

# Function to detect Rocky Linux
detect_rocky_linux() {
    log_message "INFO" "Checking for Rocky Linux..."
    
    if [[ "$USE_KEY" == true ]]; then
        ROCKY_CHECK=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "[ -f /etc/rocky-release ] && echo 'rocky' || echo 'not_rocky'" 2>> $LOG_FILE)
    else
        ROCKY_CHECK=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "[ -f /etc/rocky-release ] && echo 'rocky' || echo 'not_rocky'" 2>> $LOG_FILE)
    fi
    
    if [[ "$ROCKY_CHECK" == "rocky" ]]; then
        log_message "INFO" "Detected Rocky Linux"
        IS_ROCKY=true
    else
        log_message "INFO" "Not Rocky Linux"
        IS_ROCKY=false
    fi
}

# Function to install system dependencies on remote server
install_system_dependencies() {
    log_message "INFO" "Installing system dependencies..."
    
    # Get system information for debugging
    if [[ "$USE_KEY" == true ]]; then
        OS_INFO=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "cat /etc/os-release" 2>> $LOG_FILE)
    else
        OS_INFO=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "cat /etc/os-release" 2>> $LOG_FILE)
    fi
    log_message "INFO" "OS Info: $OS_INFO"
    
    if [[ "$USE_KEY" == true ]]; then
        UNAME_INFO=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "uname -a" 2>> $LOG_FILE)
    else
        UNAME_INFO=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "uname -a" 2>> $LOG_FILE)
    fi
    log_message "INFO" "Kernel Info: $UNAME_INFO"
    
    if [[ "$IS_ROCKY" == true ]]; then
        # Rocky Linux - try multiple approaches
        log_message "INFO" "Using multiple approaches for Rocky Linux"
        
        # Try installing just git first as a test
        if [[ "$USE_KEY" == true ]]; then
            ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y git" >> $LOG_FILE 2>&1
        else
            sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y git" >> $LOG_FILE 2>&1
        fi
        
        if [ $? -eq 0 ]; then
            log_message "SUCCESS" "Git installed successfully, proceeding with other packages"
            
            # Install remaining packages one by one
            for pkg in curl make gcc gcc-c++ openssl-devel ca-certificates gnupg; do
                log_message "INFO" "Installing $pkg..."
                if [[ "$USE_KEY" == true ]]; then
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y $pkg" >> $LOG_FILE 2>&1
                else
                    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y $pkg" >> $LOG_FILE 2>&1
                fi
                
                if [ $? -eq 0 ]; then
                    log_message "SUCCESS" "Installed $pkg"
                else
                    log_message "WARNING" "Failed to install $pkg, but continuing"
                fi
            done
        else
            log_message "WARNING" "Failed to install git with dnf, trying yum"
            
            # Try with yum instead
            if [[ "$USE_KEY" == true ]]; then
                ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y git curl make gcc gcc-c++ openssl-devel ca-certificates gnupg" >> $LOG_FILE 2>&1
            else
                sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y git curl make gcc gcc-c++ openssl-devel ca-certificates gnupg" >> $LOG_FILE 2>&1
            fi
            
            if [ $? -eq 0 ]; then
                log_message "SUCCESS" "Packages installed with yum"
            else
                log_message "WARNING" "Failed to install packages with yum, but continuing"
            fi
        fi
    else
        # Try to detect package manager
        if [[ "$USE_KEY" == true ]]; then
            HAS_APT=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v apt-get" 2>/dev/null)
        else
            HAS_APT=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v apt-get" 2>/dev/null)
        fi
        
        if [[ -n "$HAS_APT" ]]; then
            log_message "INFO" "Using apt-get"
            if [[ "$USE_KEY" == true ]]; then
                ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo apt-get update && sudo apt-get install -y curl git build-essential apt-transport-https ca-certificates gnupg lsb-release" >> $LOG_FILE 2>&1
            else
                sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo apt-get update && sudo apt-get install -y curl git build-essential apt-transport-https ca-certificates gnupg lsb-release" >> $LOG_FILE 2>&1
            fi
        else
            if [[ "$USE_KEY" == true ]]; then
                HAS_DNF=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v dnf" 2>/dev/null)
            else
                HAS_DNF=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v dnf" 2>/dev/null)
            fi
            
            if [[ -n "$HAS_DNF" ]]; then
                log_message "INFO" "Using dnf"
                if [[ "$USE_KEY" == true ]]; then
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y curl git make gcc gcc-c++ openssl-devel ca-certificates gnupg" >> $LOG_FILE 2>&1
                else
                    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y curl git make gcc gcc-c++ openssl-devel ca-certificates gnupg" >> $LOG_FILE 2>&1
                fi
            else
                log_message "INFO" "Using yum"
                if [[ "$USE_KEY" == true ]]; then
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y curl git make gcc gcc-c++ openssl-devel ca-certificates gnupg" >> $LOG_FILE 2>&1
                else
                    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y curl git make gcc gcc-c++ openssl-devel ca-certificates gnupg" >> $LOG_FILE 2>&1
                fi
            fi
        fi
    fi
    
    # Check if git was installed
    if [[ "$USE_KEY" == true ]]; then
        GIT_CHECK=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v git" 2>/dev/null)
    else
        GIT_CHECK=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v git" 2>/dev/null)
    fi
    
    if [[ -n "$GIT_CHECK" ]]; then
        log_message "SUCCESS" "Git is available, continuing with setup"
    else
        log_message "WARNING" "Git may not be installed, but continuing anyway"
    fi
    
    log_message "INFO" "System dependencies installation attempted"
}

# Function to install Node.js on remote server
install_nodejs() {
    log_message "INFO" "Installing Node.js $DEFAULT_NODE_VERSION..."
    
    # Check if Node.js is already installed
    if [[ "$USE_KEY" == true ]]; then
        NODE_VERSION=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v node && node --version || echo 'not_installed'" 2>/dev/null)
    else
        NODE_VERSION=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v node && node --version || echo 'not_installed'" 2>/dev/null)
    fi
    
    if [[ "$NODE_VERSION" == *"v$DEFAULT_NODE_VERSION"* ]]; then
        log_message "INFO" "Node.js $DEFAULT_NODE_VERSION is already installed"
    else
        log_message "INFO" "Installing Node.js $DEFAULT_NODE_VERSION..."
        
        if [[ "$IS_ROCKY" == true ]]; then
            # Rocky Linux - try multiple approaches
            log_message "INFO" "Setting up Node.js repository for Rocky Linux"
            
            # First try: Use curl to download the setup script and pipe to bash
            if [[ "$USE_KEY" == true ]]; then
                ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://rpm.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
            else
                sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://rpm.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
            fi
            
            # Try installing with dnf
            log_message "INFO" "Installing Node.js with dnf"
            if [[ "$USE_KEY" == true ]]; then
                ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y nodejs" >> $LOG_FILE 2>&1
            else
                sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y nodejs" >> $LOG_FILE 2>&1
            fi
            
            # Check if installation succeeded
            if [[ "$USE_KEY" == true ]]; then
                NODE_CHECK=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v node" 2>/dev/null)
            else
                NODE_CHECK=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v node" 2>/dev/null)
            fi
            
            if [[ -z "$NODE_CHECK" ]]; then
                # Try with yum if dnf failed
                log_message "WARNING" "Node.js installation with dnf failed, trying with yum"
                if [[ "$USE_KEY" == true ]]; then
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y nodejs" >> $LOG_FILE 2>&1
                else
                    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y nodejs" >> $LOG_FILE 2>&1
                fi
            fi
        else
            # Try to detect package manager
            if [[ "$USE_KEY" == true ]]; then
                HAS_APT=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v apt-get" 2>/dev/null)
            else
                HAS_APT=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v apt-get" 2>/dev/null)
            fi
            
            if [[ -n "$HAS_APT" ]]; then
                log_message "INFO" "Using apt-get for Node.js installation"
                if [[ "$USE_KEY" == true ]]; then
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://deb.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo apt-get install -y nodejs" >> $LOG_FILE 2>&1
                else
                    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://deb.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
                    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo apt-get install -y nodejs" >> $LOG_FILE 2>&1
                fi
            else
                if [[ "$USE_KEY" == true ]]; then
                    HAS_DNF=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v dnf" 2>/dev/null)
                else
                    HAS_DNF=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "command -v dnf" 2>/dev/null)
                fi
                
                if [[ -n "$HAS_DNF" ]]; then
                    log_message "INFO" "Using dnf for Node.js installation"
                    if [[ "$USE_KEY" == true ]]; then
                        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://rpm.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
                        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y nodejs" >> $LOG_FILE 2>&1
                    else
                        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://rpm.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
                        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo dnf install -y nodejs" >> $LOG_FILE 2>&1
                    fi
                else
                    log_message "INFO" "Using yum for Node.js installation"
                    if [[ "$USE_KEY" == true ]]; then
                        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://rpm.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
                        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y nodejs" >> $LOG_FILE 2>&1
                    else
                        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "curl -fsSL https://rpm.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo bash -" >> $LOG_FILE 2>&1
                        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "sudo yum install -y nodejs" >> $LOG_FILE 2>&1
                    fi
                fi
            fi
        fi
        
        # Verify installation
        if [[ "$USE_KEY" == true ]]; then
            NODE_VERSION=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "node --version" 2>/dev/null)
        else
            NODE_VERSION=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "node --version" 2>/dev/null)
        fi
        
        if [[ -n "$NODE_VERSION" ]]; then
            log_message "SUCCESS" "Node.js $NODE_VERSION installed successfully"
        else
            log_message "WARNING" "Node.js installation may have failed, but continuing"
        fi
    fi
    
    log_message "INFO" "Node.js installation attempted"
}

# Function to install Docker on remote server
install_docker() {
    log_message "INFO" "Installing Docker..."
    
    # Check if Docker is already installed
    DOCKER_VERSION=$(run_remote_command "command -v docker && docker --version || echo 'not_installed'" "Check Docker version")
    
    if [[ "$DOCKER_VERSION" != "not_installed" ]]; then
        log_message "INFO" "Docker is already installed"
    else
        # Install Docker
        run_remote_command "curl -fsSL https://get.docker.com -o get-docker.sh" "Download Docker installation script"
        run_remote_command "sudo sh get-docker.sh" "Install Docker"
        run_remote_command "sudo usermod -aG docker $SSH_USER" "Add user to docker group"
        run_remote_command "sudo docker --version" "Verify Docker installation"
    fi
    
    log_message "SUCCESS" "Docker installed"
}

# Function to install Docker Compose on remote server
install_docker_compose() {
    log_message "INFO" "Installing Docker Compose..."
    
    # Check if Docker Compose is already installed
    COMPOSE_VERSION=$(run_remote_command "command -v docker-compose && docker-compose --version || command -v docker && docker compose version || echo 'not_installed'" "Check Docker Compose version")
    
    if [[ "$COMPOSE_VERSION" != "not_installed" ]]; then
        log_message "INFO" "Docker Compose is already installed"
    else
        # Install Docker Compose
        run_remote_command "sudo curl -L \"https://github.com/docker/compose/releases/download/v2.20.3/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose" "Download Docker Compose"
        run_remote_command "sudo chmod +x /usr/local/bin/docker-compose" "Make Docker Compose executable"
        run_remote_command "sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose" "Create Docker Compose symbolic link"
        run_remote_command "docker-compose --version" "Verify Docker Compose installation"
    fi
    
    log_message "SUCCESS" "Docker Compose installed"
}

# Function to clone repository on remote server
clone_repository() {
    log_message "INFO" "Cloning repository..."
    
    # Create installation directory
    run_remote_command "sudo mkdir -p $INSTALL_DIR" "Create installation directory"
    run_remote_command "sudo chown $SSH_USER:$SSH_USER $INSTALL_DIR" "Set directory ownership"
    
    # Check if repository already exists
    REPO_EXISTS=$(run_remote_command "[ -d $INSTALL_DIR/.git ] && echo 'yes' || echo 'no'" "Check if repository exists")
    
    if [[ "$REPO_EXISTS" == "yes" ]]; then
        log_message "INFO" "Repository already exists, updating..."
        run_remote_command "cd $INSTALL_DIR && git fetch && git checkout $BRANCH && git pull" "Update repository"
    else
        run_remote_command "git clone -b $BRANCH $REPO_URL $INSTALL_DIR" "Clone repository"
    fi
    
    log_message "SUCCESS" "Repository cloned/updated"
}

# Function to setup environment on remote server
setup_environment() {
    log_message "INFO" "Setting up environment..."
    
    run_remote_command "cd $INSTALL_DIR && cp -n .env.example .env" "Create main .env file"
    run_remote_command "cd $INSTALL_DIR/client && cp -n .env.example .env" "Create client .env file"
    run_remote_command "cd $INSTALL_DIR/server && cp -n .env.example .env" "Create server .env file"
    
    log_message "SUCCESS" "Environment setup complete"
}

# Function to build application on remote server
build_application() {
    log_message "INFO" "Building application..."
    
    run_remote_command "cd $INSTALL_DIR && chmod +x build-production.sh" "Make build-production.sh executable"
    run_remote_command "cd $INSTALL_DIR && CI=true ./build-production.sh" "Build application"
    
    log_message "SUCCESS" "Application built successfully"
}

# Function to setup systemd services on remote server
setup_systemd_services() {
    log_message "INFO" "Setting up systemd services..."
    
    # Ask if user wants to setup systemd services
    read -p "Do you want to setup systemd services for automatic startup? (y/n): " SETUP_SERVICES
    
    if [[ "$SETUP_SERVICES" == "y" || "$SETUP_SERVICES" == "Y" ]]; then
        # Create systemd service file for ShareThings
        run_remote_command "cat > /tmp/sharethings.service << 'EOL'
[Unit]
Description=ShareThings Application
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$SSH_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
ExecStop=/usr/bin/docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL" "Create systemd service file"
        
        run_remote_command "sudo mv /tmp/sharethings.service /etc/systemd/system/" "Move service file to systemd directory"
        run_remote_command "sudo systemctl daemon-reload" "Reload systemd"
        run_remote_command "sudo systemctl enable sharethings.service" "Enable ShareThings service"
        run_remote_command "sudo systemctl start sharethings.service" "Start ShareThings service"
        
        log_message "SUCCESS" "Systemd services setup complete"
    else
        log_message "INFO" "Skipping systemd services setup"
    fi
}

# Function to display completion message
display_completion() {
    log_message "SUCCESS" "ShareThings has been successfully set up on $SERVER_IP"
    log_message "INFO" "Installation directory: $INSTALL_DIR"
    
    # Get service status if services were set up
    if [[ "$SETUP_SERVICES" == "y" || "$SETUP_SERVICES" == "Y" ]]; then
        SERVICE_STATUS=$(run_remote_command "sudo systemctl status sharethings.service | grep Active" "Get service status")
        log_message "INFO" "Service status: $SERVICE_STATUS"
    else
        log_message "INFO" "To start the application manually:"
        log_message "INFO" "  1. SSH into the server: ssh $SSH_USER@$SERVER_IP"
        log_message "INFO" "  2. Navigate to the installation directory: cd $INSTALL_DIR"
        log_message "INFO" "  3. Start the application: docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    fi
    
    log_message "INFO" "Setup log saved to $LOG_FILE"
}

# Main function
main() {
    echo -e "${BLUE}=== ShareThings Remote Setup ===${NC}"
    echo "This script will set up ShareThings on a remote server."
    echo
    
    # Collect server details
    collect_server_details
    
    # Check for sshpass if needed
    if [[ "$USE_KEY" == false ]]; then
        check_sshpass
    fi
    
    # Collect repository details
    collect_repository_details
    
    # Test SSH connection
    test_ssh_connection
    
    # Detect Rocky Linux
    detect_rocky_linux
    
    # Install dependencies
    install_system_dependencies
    install_nodejs
    install_docker
    install_docker_compose
    
    # Setup repository
    clone_repository
    setup_environment
    
    # Build application
    build_application
    
    # Setup systemd services
    setup_systemd_services
    
    # Display completion message
    display_completion
}

# Start the script
main