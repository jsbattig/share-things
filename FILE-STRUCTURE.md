# ShareThings Project File Structure

This document provides an overview of the ShareThings project file structure after the reorganization.

## Directory Structure

```
share-things/
├── build/                 # Build scripts and configuration
│   ├── scripts/           # Build scripts
│   │   ├── build-and-test.sh     # Script for building and testing
│   │   └── build-production.sh   # Script for production builds
│   └── config/            # Configuration files
│       ├── docker-compose.yml    # Docker Compose configuration
│       ├── docker-compose.test.yml # Test Docker Compose configuration
│       ├── docker-compose.prod.yml # Production Docker Compose configuration
│       ├── podman-compose.yml    # Podman Compose configuration
│       ├── podman-compose.test.yml # Test Podman Compose configuration
│       └── podman-compose.prod.yml # Production Podman Compose configuration
├── client/                # React frontend
│   ├── public/            # Static assets
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Page components
│   │   ├── utils/         # Utility functions
│   │   └── ...
│   └── ...
├── server/                # Express backend
│   ├── src/               # Source code
│   │   ├── domain/        # Domain models
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── socket/        # Socket.IO handlers
│   │   └── ...
│   └── ...
├── test/                  # Test files and configuration
│   ├── config/            # Test configuration
│   │   └── jest.config.js # Jest configuration
│   ├── e2e/               # End-to-end tests
│   └── unit/              # Unit tests
├── setup/                 # Setup modules
├── plans/                 # Project planning documents
│   └── ...                # Planning documents and implementation plans
├── memory-bank/           # Project knowledge base
│   ├── architecture/      # Architecture documentation
│   ├── technical/         # Technical documentation
│   └── ...
├── setup.sh               # Main setup script
└── test-setup.sh          # Setup test script
```

## Key Files

### Root Directory

- `setup.sh`: Main setup script for installing, updating, and managing the application
- `test-setup.sh`: Script for testing the setup process
- `README.md`: Project documentation
- `package.json`: Project dependencies and scripts

### Build Directory

The `build` directory contains all build-related files:

- `build/scripts/build-and-test.sh`: Script for building and testing the application
- `build/scripts/build-production.sh`: Script for building the application for production
- `build/config/`: Contains all Docker and Podman compose configuration files

### Test Directory

The `test` directory contains all test-related files:

- `test/config/jest.config.js`: Jest configuration for running tests
- `test/e2e/`: End-to-end tests
- `test/unit/`: Unit tests

## Usage

### Running Tests

To run tests, use the npm test command:

```bash
npm test
```

This will use the Jest configuration in `test/config/jest.config.js`.

### Building the Application

To build and test the application, use the build-and-test.sh script:

```bash
./build/scripts/build-and-test.sh
```

To build the application for production, use the build-production.sh script:

```bash
./build/scripts/build-production.sh
```

### Setting Up the Application

To set up the application, use the setup.sh script:

```bash
./setup.sh
```

This script supports various flags for different operations:

- `--reinstall`: Remove and reinstall
- `--uninstall`: Remove the installation
- `--hostname=VALUE`: Set the hostname
- `--frontend-port=VALUE`: Set the frontend port
- `--backend-port=VALUE`: Set the backend port
- `--api-port=VALUE`: Set the API port
- `--https`: Use HTTPS instead of HTTP
- `--expose-ports`: Expose container ports to host
- `--production`: Run in production mode (no volume mounts)
- `--non-interactive`: Run in non-interactive mode
- `--force`: Force operation without confirmation
- `--force-install`: Force installation even if already installed
- `--help`: Show help message

## Development Workflow

1. Clone the repository
2. Install dependencies with `npm install`
3. Run tests with `npm test`
4. Build and test with `./build/scripts/build-and-test.sh`
5. Set up the application with `./setup.sh`

## CI/CD Workflow

The GitHub Actions workflow uses the following scripts:

1. `./build/scripts/build-and-test.sh` for building and testing
2. `./test-setup.sh` for testing the setup process
3. Fresh install approach for production deployments (uninstall + install)