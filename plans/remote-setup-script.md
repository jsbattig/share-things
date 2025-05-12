# Remote Setup Script for ShareThings

This document outlines the plan for a shell script that automates the remote setup of the ShareThings application on a new system.

## Overview

The `remote-setup.sh` script will:

1. Prompt the user for remote server details (IP address, username, password)
2. SSH into the remote system
3. Install all required dependencies
4. Clone the ShareThings repository
5. Set up the application for production use

## Script Components

### 1. User Input Collection

The script will collect the following information:
- Remote server IP address
- SSH username
- SSH password (with option to use SSH key instead)
- Git repository URL (with default value)
- Branch to clone (with default value of "master")
- Installation directory (with default value)

### 2. SSH Connection

The script will establish an SSH connection to the remote server using:
- SSH password authentication, or
- SSH key-based authentication if specified

### 3. Dependency Installation

The script will install the following dependencies:
- Git
- Node.js (version 18.x)
- npm
- Docker
- Docker Compose
- Other system dependencies

### 4. Repository Setup

The script will:
- Clone the ShareThings repository
- Checkout the specified branch
- Set up environment files

### 5. Application Setup

The script will:
- Build the Docker containers using the production configuration
- Configure the application for production use
- Set up systemd services for automatic startup (optional)

## Implementation Details

### Error Handling

The script will include robust error handling:
- Check for successful command execution
- Provide meaningful error messages
- Allow for retry of failed steps
- Clean up partial installations if the process fails

### Security Considerations

The script will implement security best practices:
- Avoid storing passwords in plain text
- Use SSH key authentication when possible
- Set appropriate file permissions
- Use secure environment variables

### Logging

The script will provide detailed logging:
- Display progress information
- Log all commands and their outputs
- Create a setup log file for troubleshooting

## Script Structure

```bash
#!/bin/bash

# 1. Functions for collecting user input
function collect_server_details() {
  # Prompt for IP, username, password
}

function collect_repository_details() {
  # Prompt for repository URL, branch, etc.
}

# 2. Functions for SSH connection
function establish_ssh_connection() {
  # Connect to the remote server
}

# 3. Functions for dependency installation
function install_system_dependencies() {
  # Install required system packages
}

function install_nodejs() {
  # Install Node.js and npm
}

function install_docker() {
  # Install Docker and Docker Compose
}

# 4. Functions for repository setup
function clone_repository() {
  # Clone the ShareThings repository
}

function setup_environment() {
  # Create and configure environment files
}

# 5. Functions for application setup
function build_application() {
  # Build the Docker containers
}

function configure_services() {
  # Set up systemd services
}

# 6. Main execution flow
function main() {
  # Execute the setup process in sequence
}

# Start the script
main
```

## Usage Instructions

1. Download the `remote-setup.sh` script
2. Make it executable: `chmod +x remote-setup.sh`
3. Run the script: `./remote-setup.sh`
4. Follow the prompts to provide server details
5. Wait for the setup to complete

## Implementation Steps

1. Create the basic script structure with functions
2. Implement user input collection
3. Implement SSH connection handling
4. Implement dependency installation
5. Implement repository setup
6. Implement application setup
7. Add error handling and logging
8. Test the script on different environments
9. Document usage instructions