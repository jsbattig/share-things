# Modular Setup Scripts

## Overview

The ShareThings setup process has been refactored into a modular architecture to improve maintainability, testability, and extensibility. This document outlines the structure, functionality, and usage of the modular setup scripts.

## Architecture

The setup scripts are organized into a modular structure:

```
setup.sh                # Main setup script
setup/
  common.sh             # Common functions and utilities
  postgres.sh           # PostgreSQL setup functions
  docker.sh             # Docker/Podman setup functions
  env.sh                # Environment configuration functions
  test.sh               # Test functions
```

This modular approach provides several benefits:

1. **Separation of Concerns**: Each module focuses on a specific aspect of the setup process
2. **Reusability**: Common functions can be shared across modules
3. **Testability**: Each module can be tested independently
4. **Extensibility**: New functionality can be added by creating new modules
5. **Maintainability**: Smaller, focused files are easier to understand and maintain

## Module Descriptions

### Main Setup Script (setup.sh)

The main setup script serves as the entry point and orchestrator for the setup process:

```bash
#!/bin/bash

# Ensure we're in the project root directory
cd "$(dirname "$0")"

# Source the common functions
source setup/common.sh

# Parse command line arguments
parse_args "$@"

# Display welcome message
show_welcome

# Source other modules
source setup/env.sh
source setup/postgres.sh
source setup/docker.sh

# If running in test mode, source test module
if [ "$TEST_MODE" = true ]; then
  source setup/test.sh
  run_tests
  exit $?
fi

# Setup environment files
setup_env_files

# Configure session storage
configure_session_storage

# Configure Docker/Podman
configure_container_engine

# Build and start containers if requested
if [ "$START_CONTAINERS" = true ]; then
  build_and_start_containers
fi

# Show completion message
show_completion

# Clean up any backup files created by sed
cleanup_backups
```

### Common Functions (common.sh)

The common module provides shared functions and utilities used by other modules:

- **Text Colors**: ANSI color codes for terminal output
- **OS Detection**: Detect OS for sed compatibility and default container engine
- **Global Variables**: Shared variables used across modules
- **Argument Parsing**: Parse command line arguments
- **Help Message**: Display usage information
- **Welcome/Completion Messages**: Display informative messages
- **Cleanup Functions**: Clean up temporary files

### PostgreSQL Functions (postgres.sh)

The PostgreSQL module handles PostgreSQL configuration and setup:

- **Session Storage Configuration**: Configure in-memory or PostgreSQL session storage
- **PostgreSQL Configuration**: Configure external or Docker-based PostgreSQL
- **Database Schema Initialization**: Initialize the PostgreSQL database schema
- **Environment Variable Management**: Update environment files with PostgreSQL configuration

### Docker/Podman Functions (docker.sh)

The Docker/Podman module handles container engine configuration and setup:

- **Container Engine Detection**: Detect and configure Docker or Podman
- **Docker Compose Configuration**: Update Docker Compose files for PostgreSQL
- **Production Configuration**: Create production Docker Compose files
- **Script Permissions**: Make scripts executable

### Environment Functions (env.sh)

The environment module handles environment file configuration:

- **Environment File Creation**: Create .env files from templates
- **Hostname Configuration**: Configure automatic or manual hostname
- **Port Configuration**: Configure custom ports for HAProxy
- **HTTPS Configuration**: Configure HTTPS support
- **Environment Variable Updates**: Update environment files with configuration

### Test Functions (test.sh)

The test module provides automated testing functionality:

- **Test Runner**: Run specified test cases
- **Memory Test**: Test setup with in-memory session storage
- **PostgreSQL Test**: Test setup with PostgreSQL session storage
- **Environment File Creation**: Create test environment files
- **Container Verification**: Verify containers are running correctly
- **Application Testing**: Test the application functionality
- **Cleanup**: Clean up test containers and volumes

## Command Line Arguments

The setup script supports the following command line arguments:

- **--test [case]**: Run in test mode, optionally specifying a test case (memory, postgres, all)
- **--start**: Build and start containers after setup
- **--postgres**: Use PostgreSQL for session storage
- **--memory**: Use in-memory session storage (default)
- **--help**: Show help message

## Test Mode

The setup script includes a test mode that can be used to verify the setup process:

```bash
# Run all tests
./setup.sh --test all

# Test with in-memory storage
./setup.sh --test memory

# Test with PostgreSQL storage
./setup.sh --test postgres
```

Each test performs the following steps:

1. Clean up any existing containers
2. Create test environment files
3. Configure session storage
4. Configure container engine
5. Build and start containers
6. Verify containers are running
7. Test the application
8. Clean up containers and volumes

## CI/CD Integration

The modular setup scripts are integrated into the CI/CD pipeline:

```yaml
setup-tests:
  name: Setup Script Tests
  needs: [integration]
  runs-on: [self-hosted, Rocky Linux]
  
  steps:
  - uses: actions/checkout@v3
  
  - name: Make setup scripts executable
    run: |
      chmod +x setup.sh
      mkdir -p setup
      chmod +x setup/*.sh
  
  - name: Run setup tests with in-memory storage
    run: |
      # Clean up any existing containers
      podman ps -a --filter name=share-things | awk 'NR>1 {print $1}' | xargs -r podman rm -f
      
      # Run setup in test mode with in-memory storage
      ./setup.sh --test memory
      
      # Verify containers are running
      podman ps --filter name=share-things
      
      # Clean up
      podman ps -a --filter name=share-things | awk 'NR>1 {print $1}' | xargs -r podman rm -f
  
  - name: Run setup tests with PostgreSQL storage
    run: |
      # Clean up any existing containers
      podman ps -a --filter name=share-things | awk 'NR>1 {print $1}' | xargs -r podman rm -f
      
      # Run setup in test mode with PostgreSQL storage
      ./setup.sh --test postgres
      
      # Verify containers are running
      podman ps --filter name=share-things
      
      # Clean up
      podman ps -a --filter name=share-things | awk 'NR>1 {print $1}' | xargs -r podman rm -f
```

This ensures that the setup scripts work correctly on the Rocky Linux environment used for production deployment.

## Best Practices

When modifying the setup scripts, follow these best practices:

1. **Keep Modules Focused**: Each module should have a single responsibility
2. **Use Common Functions**: Reuse common functions instead of duplicating code
3. **Handle Errors Gracefully**: Check for errors and provide helpful error messages
4. **Provide Feedback**: Use color-coded messages to provide clear feedback
5. **Test Changes**: Run tests to verify changes work correctly
6. **Document Changes**: Update documentation to reflect changes

## Future Enhancements

Potential future enhancements to the modular setup scripts:

1. **Additional Storage Backends**: Support for additional session storage backends (e.g., Redis, MongoDB)
2. **Advanced Testing**: More comprehensive automated tests
3. **Deployment Automation**: Integration with deployment automation tools
4. **Configuration Validation**: Validate configuration before applying changes
5. **Rollback Support**: Support for rolling back changes if setup fails