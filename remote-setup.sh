#!/bin/bash

# ShareThings Remote Setup Script
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

# Function to generate SSH command
generate_ssh_command() {
    if [[ "$USE_KEY" == true ]]; then
        SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP"
    else
        # Using sshpass for password authentication
        SSH_CMD="sshpass -p '$SSH_PASS' ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP"
    fi
}

# Function to test SSH connection
test_ssh_connection() {
    log_message "INFO" "Testing SSH connection..."
    
    if [[ "$USE_KEY" == true ]]; then
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 "$SSH_USER@$SERVER_IP" echo "SSH connection successful" >> $LOG_FILE 2>&1
    else
        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 "$SSH_USER@$SERVER_IP" echo "SSH connection successful" >> $LOG_FILE 2>&1
    fi
    
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to connect to $SERVER_IP"
        log_message "ERROR" "Please check your credentials and try again"
        exit 1
    fi
    
    log_message "SUCCESS" "SSH connection successful"
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

# Function to install system dependencies on remote server
install_system_dependencies() {
    log_message "INFO" "Installing system dependencies..."
    
    # Update package lists
    $SSH_CMD "sudo apt-get update" >> $LOG_FILE 2>&1
    check_command "Update package lists"
    
    # Install essential packages
    $SSH_CMD "sudo apt-get install -y curl git build-essential apt-transport-https ca-certificates gnupg lsb-release" >> $LOG_FILE 2>&1
    check_command "Install essential packages"
    
    log_message "SUCCESS" "System dependencies installed"
}

# Function to install Node.js on remote server
install_nodejs() {
    log_message "INFO" "Installing Node.js $DEFAULT_NODE_VERSION..."
    
    # Check if Node.js is already installed
    NODE_INSTALLED=$($SSH_CMD "command -v node && node --version | grep -q 'v$DEFAULT_NODE_VERSION'" >> $LOG_FILE 2>&1; echo $?)
    
    if [ $NODE_INSTALLED -eq 0 ]; then
        log_message "INFO" "Node.js $DEFAULT_NODE_VERSION is already installed"
    else
        # Install Node.js
        $SSH_CMD "curl -fsSL https://deb.nodesource.com/setup_$DEFAULT_NODE_VERSION.x | sudo -E bash -" >> $LOG_FILE 2>&1
        check_command "Add Node.js repository"
        
        $SSH_CMD "sudo apt-get install -y nodejs" >> $LOG_FILE 2>&1
        check_command "Install Node.js"
        
        # Verify installation
        $SSH_CMD "node --version" >> $LOG_FILE 2>&1
        check_command "Verify Node.js installation"
    fi
    
    log_message "SUCCESS" "Node.js installed"
}

# Function to install Docker on remote server
install_docker() {
    log_message "INFO" "Installing Docker..."
    
    # Check if Docker is already installed
    DOCKER_INSTALLED=$($SSH_CMD "command -v docker" >> $LOG_FILE 2>&1; echo $?)
    
    if [ $DOCKER_INSTALLED -eq 0 ]; then
        log_message "INFO" "Docker is already installed"
    else
        # Install Docker
        $SSH_CMD "curl -fsSL https://get.docker.com -o get-docker.sh" >> $LOG_FILE 2>&1
        check_command "Download Docker installation script"
        
        $SSH_CMD "sudo sh get-docker.sh" >> $LOG_FILE 2>&1
        check_command "Install Docker"
        
        # Add user to docker group
        $SSH_CMD "sudo usermod -aG docker $SSH_USER" >> $LOG_FILE 2>&1
        check_command "Add user to docker group"
        
        # Verify installation
        $SSH_CMD "sudo docker --version" >> $LOG_FILE 2>&1
        check_command "Verify Docker installation"
    fi
    
    log_message "SUCCESS" "Docker installed"
}

# Function to install Docker Compose on remote server
install_docker_compose() {
    log_message "INFO" "Installing Docker Compose..."
    
    # Check if Docker Compose is already installed
    COMPOSE_INSTALLED=$($SSH_CMD "command -v docker-compose || command -v docker compose" >> $LOG_FILE 2>&1; echo $?)
    
    if [ $COMPOSE_INSTALLED -eq 0 ]; then
        log_message "INFO" "Docker Compose is already installed"
    else
        # Install Docker Compose
        $SSH_CMD "sudo curl -L \"https://github.com/docker/compose/releases/download/v2.20.3/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose" >> $LOG_FILE 2>&1
        check_command "Download Docker Compose"
        
        $SSH_CMD "sudo chmod +x /usr/local/bin/docker-compose" >> $LOG_FILE 2>&1
        check_command "Make Docker Compose executable"
        
        # Create symbolic link
        $SSH_CMD "sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose" >> $LOG_FILE 2>&1
        check_command "Create Docker Compose symbolic link"
        
        # Verify installation
        $SSH_CMD "docker-compose --version" >> $LOG_FILE 2>&1
        check_command "Verify Docker Compose installation"
    fi
    
    log_message "SUCCESS" "Docker Compose installed"
}

# Function to clone repository on remote server
clone_repository() {
    log_message "INFO" "Cloning repository..."
    
    # Create installation directory
    $SSH_CMD "sudo mkdir -p $INSTALL_DIR" >> $LOG_FILE 2>&1
    check_command "Create installation directory"
    
    # Set ownership
    $SSH_CMD "sudo chown $SSH_USER:$SSH_USER $INSTALL_DIR" >> $LOG_FILE 2>&1
    check_command "Set directory ownership"
    
    # Check if repository already exists
    REPO_EXISTS=$($SSH_CMD "[ -d $INSTALL_DIR/.git ] && echo 'yes' || echo 'no'" 2>> $LOG_FILE)
    
    if [[ "$REPO_EXISTS" == "yes" ]]; then
        log_message "INFO" "Repository already exists, updating..."
        
        # Pull latest changes
        $SSH_CMD "cd $INSTALL_DIR && git fetch && git checkout $BRANCH && git pull" >> $LOG_FILE 2>&1
        check_command "Update repository"
    else
        # Clone repository
        $SSH_CMD "git clone -b $BRANCH $REPO_URL $INSTALL_DIR" >> $LOG_FILE 2>&1
        check_command "Clone repository"
    fi
    
    log_message "SUCCESS" "Repository cloned/updated"
}

# Function to setup environment on remote server
setup_environment() {
    log_message "INFO" "Setting up environment..."
    
    # Create .env file from example
    $SSH_CMD "cd $INSTALL_DIR && cp -n .env.example .env" >> $LOG_FILE 2>&1
    check_command "Create main .env file"
    
    # Create client .env file from example
    $SSH_CMD "cd $INSTALL_DIR/client && cp -n .env.example .env" >> $LOG_FILE 2>&1
    check_command "Create client .env file"
    
    # Create server .env file from example
    $SSH_CMD "cd $INSTALL_DIR/server && cp -n .env.example .env" >> $LOG_FILE 2>&1
    check_command "Create server .env file"
    
    log_message "SUCCESS" "Environment setup complete"
}

# Function to build application on remote server
build_application() {
    log_message "INFO" "Building application..."
    
    # Make build-production.sh executable
    $SSH_CMD "cd $INSTALL_DIR && chmod +x build-production.sh" >> $LOG_FILE 2>&1
    check_command "Make build-production.sh executable"
    
    # Run build-production.sh
    $SSH_CMD "cd $INSTALL_DIR && CI=true ./build-production.sh" >> $LOG_FILE 2>&1
    check_command "Build application"
    
    log_message "SUCCESS" "Application built successfully"
}

# Function to setup systemd services on remote server
setup_systemd_services() {
    log_message "INFO" "Setting up systemd services..."
    
    # Ask if user wants to setup systemd services
    read -p "Do you want to setup systemd services for automatic startup? (y/n): " SETUP_SERVICES
    
    if [[ "$SETUP_SERVICES" == "y" || "$SETUP_SERVICES" == "Y" ]]; then
        # Create systemd service file for ShareThings
        $SSH_CMD "cat > /tmp/sharethings.service << 'EOL'
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
EOL" >> $LOG_FILE 2>&1
        check_command "Create systemd service file"
        
        # Move service file to systemd directory
        $SSH_CMD "sudo mv /tmp/sharethings.service /etc/systemd/system/" >> $LOG_FILE 2>&1
        check_command "Move service file to systemd directory"
        
        # Reload systemd
        $SSH_CMD "sudo systemctl daemon-reload" >> $LOG_FILE 2>&1
        check_command "Reload systemd"
        
        # Enable service
        $SSH_CMD "sudo systemctl enable sharethings.service" >> $LOG_FILE 2>&1
        check_command "Enable ShareThings service"
        
        # Start service
        $SSH_CMD "sudo systemctl start sharethings.service" >> $LOG_FILE 2>&1
        check_command "Start ShareThings service"
        
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
        SERVICE_STATUS=$($SSH_CMD "sudo systemctl status sharethings.service | grep Active" 2>> $LOG_FILE)
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
    
    # Check for sshpass
    check_sshpass
    
    # Collect server details
    collect_server_details
    
    # Collect repository details
    collect_repository_details
    
    # Generate SSH command
    generate_ssh_command
    
    # Test SSH connection
    test_ssh_connection
    
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