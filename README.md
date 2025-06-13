# ShareThings

[![Build Status](https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=Build%20Status)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)

A secure, real-time content sharing application with end-to-end encryption and persistent storage. Share text, images, and files instantly across devices with military-grade security.

## Features

### Core Features
- **Real-time content sharing**: Text, images, files up to any size
- **End-to-end encryption**: Military-grade AES encryption with client-side key derivation
- **Session-based sharing**: Secure, temporary sharing sessions with passphrase authentication
- **Persistent storage**: Content survives server restarts and client disconnections
- **Cross-platform**: Works on any device with a modern web browser
- **No registration required**: Start sharing immediately with just a passphrase

### Advanced Features
- **Chunked file uploads**: Handle large files efficiently with progress tracking
- **Real-time synchronization**: Instant updates across all connected devices
- **Clear all content**: Securely remove all session content with confirmation
- **Automatic cleanup**: Sessions expire automatically to protect privacy
- **WebSocket communication**: Low-latency real-time updates
- **Responsive design**: Optimized for desktop, tablet, and mobile devices

## Architecture

ShareThings uses a modern, secure architecture designed for performance and reliability:

### System Components
1. **Frontend**: React 18 with TypeScript, Chakra UI, and Vite for fast development
2. **Backend**: Node.js with Express, Socket.IO for real-time communication
3. **Database**: SQLite with better-sqlite3 for lightweight, reliable storage
4. **Storage**: File system-based encrypted chunk storage with automatic cleanup
5. **Encryption**: Unified crypto system supporting both browser and Node.js environments
6. **Testing**: Comprehensive test suite with 69+ tests covering all critical functionality

### Security Architecture
- **Client-side encryption**: All content encrypted before leaving your device
- **Zero-knowledge server**: Server never sees unencrypted content or passwords
- **Passphrase fingerprinting**: Secure authentication without exposing passwords
- **Deterministic encryption**: Same content produces consistent encrypted output
- **Session isolation**: Complete separation between different sharing sessions

## Technology Stack

### Frontend Technologies
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe JavaScript development
- **Chakra UI** - Modern, accessible component library
- **Vite** - Fast build tool and development server
- **Framer Motion** - Animation library for smooth UI transitions
- **React Router** - Client-side routing
- **Socket.IO Client** - Real-time WebSocket communication

### Backend Technologies
- **Node.js 18** - JavaScript runtime
- **Express 5** - Web application framework
- **TypeScript** - Type-safe server development
- **Socket.IO** - Real-time bidirectional communication
- **SQLite** - Lightweight, serverless database
- **better-sqlite3** - High-performance SQLite driver

### Development & Testing
- **Jest** - Testing framework with 69+ tests (52 server + 17 client)
- **ESLint** - Strict code linting with zero errors policy
- **TypeScript** - Full type safety in strict mode
- **Concurrently** - Run multiple npm scripts simultaneously
- **Podman** - Containerization for secure, reproducible deployment
- **CI/CD** - Automated testing and deployment pipeline with GitHub Actions

## Podman Deployment

ShareThings is designed to be deployed using Podman. The deployment architecture uses containers for both the client and server components, with HAProxy handling SSL termination and routing.

### Prerequisites

- Podman
- Podman Compose
- Git (to clone the repository)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/jsbattig/share-things.git
cd share-things

# Run the setup script
chmod +x setup.sh
./setup.sh
```

The setup script will:
1. Create necessary configuration files
2. Configure environment variables
3. Build and start the Podman containers

### Installation Instructions

1. **Install Podman and Podman Compose**:
   ```bash
   # On Rocky Linux/RHEL/CentOS
   sudo dnf install podman podman-compose
   
   # On Ubuntu/Debian
   sudo apt-get install podman podman-compose
   
   # On Fedora
   sudo dnf install podman podman-compose
   ```

2. **Run the setup script**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Follow the prompts**:
   - Enter your hostname or leave blank for auto-detection
   - Specify if you're using custom ports for HAProxy
   - Choose whether to expose ports to the host

4. **HAProxy Configuration**:
   - The setup will generate a template HAProxy configuration
   - Update the template with your specific settings
   - See [HAPROXY.md](HAPROXY.md) for detailed configuration instructions

### Deployment Architecture

```
                     ┌─────────────┐
                     │   Client    │
                     │   Browser   │
                     └──────┬──────┘
                            │ HTTPS/WSS
                            ▼
                     ┌─────────────┐
                     │   HAProxy   │
                     │ (SSL Term)  │
                     └──────┬──────┘
                            │ HTTP/WS
                  ┌─────────┴─────────┐
                  │                   │
         ┌────────▼───────┐   ┌───────▼────────┐
         │    Frontend    │   │     Backend    │
         │ (Node.js + SPA)│   │  (Node.js +    │
         │                │   │   Socket.IO)   │
         └────────────────┘   └────────────────┘
```

### Container Configuration

The setup creates two containers:
1. **Frontend Container**: Node.js static server serving the built React application
2. **Backend Container**: Node.js running the Express and Socket.IO server with SQLite database

Both containers are configured to communicate with each other through an internal Podman network.

### HAProxy Configuration

HAProxy is used to:
1. Terminate SSL connections
2. Route traffic to the appropriate container
3. Handle WebSocket connections

The setup script generates a template HAProxy configuration file that you can customize. For detailed HAProxy configuration instructions, see [HAPROXY.md](HAPROXY.md).

### Managing Containers

After deployment, you can manage your containers with these commands:

```bash
# Check container status
podman ps --filter label=io.podman.compose.project=share-things

# View logs
podman logs share-things-frontend
podman logs share-things-backend

# Restart containers
cd /path/to/share-things && podman-compose -f build/config/podman-compose.yml down && podman-compose -f build/config/podman-compose.yml up -d

# Stop all containers
podman-compose -f build/config/podman-compose.yml down

# Start containers
podman-compose -f build/config/podman-compose.yml up -d

# View container resource usage
podman stats

# Access container shell
podman exec -it share-things-backend /bin/bash
podman exec -it share-things-frontend /bin/bash
```

### Troubleshooting

If you encounter issues:

1. **Check container logs**:
   ```bash
   podman logs share-things-frontend
   podman logs share-things-backend
   ```

2. **Verify port mappings**:
   ```bash
   podman port share-things-frontend
   podman port share-things-backend
   ```

3. **SELinux issues**:
   If you encounter permission errors on SELinux-enabled systems, you may need to set the correct SELinux context:
   ```bash
   sudo chcon -Rt container_file_t /path/to/share-things
   ```

4. **HAProxy connection issues**:
   - Check HAProxy logs: `sudo tail -f /var/log/haproxy.log`
   - Verify your HAProxy configuration matches the ports exposed by your containers
   - See [HAPROXY.md](HAPROXY.md) for detailed troubleshooting

## Environment Configuration

ShareThings uses environment variables for configuration. The setup script automatically creates the necessary configuration files, but you can customize them as needed:

### Root Directory Configuration (`.env`)
- `API_URL` - Base URL for API requests
- `SOCKET_URL` - Base URL for WebSocket connections
- `CORS_ORIGIN` - Allowed CORS origins
- `SESSION_TIMEOUT` - Session timeout in milliseconds
- `SESSION_EXPIRY` - Session expiry time in milliseconds
- `LOG_LEVEL` - Logging level (info, debug, error)
- `RATE_LIMIT_WINDOW` - Rate limiting window in milliseconds
- `RATE_LIMIT_MAX` - Maximum requests per window

### Client Configuration
The client uses Vite environment variables:
- `VITE_API_URL` - Backend API URL
- `VITE_SOCKET_URL` - WebSocket server URL
- `VITE_API_PORT` - API port number
- `VITE_ENABLE_ANALYTICS` - Enable/disable analytics
- `VITE_ENABLE_LOGGING` - Enable/disable client-side logging
- `VITE_MAX_FILE_SIZE` - Maximum file size for uploads
- `VITE_DEFAULT_CHUNK_SIZE` - Default chunk size for file transfers

### Server Configuration
The server uses standard Node.js environment variables:
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment mode (development/production)
- Database and storage configurations are handled automatically

## Project Structure

```
share-things/
├── build/                 # Build scripts and configuration
│   ├── scripts/           # Build scripts
│   └── config/            # Configuration files
├── client/                # React frontend
│   ├── public/            # Static assets
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   │   ├── content/   # Content-related components
│   │   │   └── session/   # Session-related components
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Page components
│   │   ├── services/      # Client-side services
│   │   ├── utils/         # Utility functions
│   │   └── __tests__/     # Client-side tests
│   └── ...
├── server/                # Express backend
│   ├── src/               # Source code
│   │   ├── domain/        # Domain models and interfaces
│   │   ├── infrastructure/# Infrastructure layer (storage, config)
│   │   ├── repositories/  # Data access layer
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── socket/        # Socket.IO handlers
│   │   ├── __tests__/     # Server-side tests
│   │   └── __mocks__/     # Test mocks
│   ├── scripts/           # Utility scripts
│   └── ...
├── test/                  # Test files and configuration
│   ├── config/            # Test configuration
│   ├── e2e/               # End-to-end tests
│   │   └── functional/    # Functional tests
│   └── misc/              # Miscellaneous test utilities
├── setup/                 # Setup modules
├── plans/                 # Project planning documents
│   └── ...                # Planning documents and implementation plans
├── memory-bank/           # Project knowledge base
│   ├── architecture/      # Architecture documentation
│   ├── technical/         # Technical documentation
│   └── ...
├── data/                  # Application data directory
├── logs/                  # Application logs
├── backups/               # Backup files
├── setup.sh               # Main setup script
└── cleanup-and-restart.sh # Cleanup and restart script
```

### Project Documentation

When working on this project, please refer to:

1. **Plans Directory**: Contains detailed planning documents for various aspects of the project. When implementing new features or making significant changes, check this directory first for relevant plans.

2. **Memory Bank**: Contains project knowledge, architecture documentation, and technical details. This is a valuable resource for understanding the project's design and implementation decisions.

## Continuous Integration and Deployment

ShareThings uses GitHub Actions for continuous integration and deployment. The build status badge at the top of this README shows the overall status of the CI/CD pipeline, which includes:

1. **Lint**: Runs linting checks on the codebase
2. **Build and Test**: Builds the application and runs unit tests
3. **Container Build and Tests**: Runs tests in Podman containers (Integration tests)
4. **Test Setup**: Verifies the setup script works correctly in various scenarios
5. **Deploy to Production**: Automatically deploys to the production server when all other workflows succeed

The badge will show green only if all steps succeed, and red if any step fails. Click on the badge to see detailed status of each step.

The deployment workflow uses a self-hosted runner on Rocky Linux to connect to the production server via SSH and run the update script.

## Security

ShareThings implements several security measures:

1. **End-to-end Encryption**: All content is encrypted client-side before transmission
2. **Passphrase Fingerprinting**: Allows verification without exposing the passphrase
3. **Token-based Authentication**: Secure session tokens for request authorization
4. **Session Expiration**: Inactive sessions are automatically expired

## Additional Files

The project includes several additional configuration and documentation files:

- [`HAPROXY.md`](HAPROXY.md) - HAProxy configuration guide
- [`FILE-STRUCTURE.md`](FILE-STRUCTURE.md) - Detailed file structure documentation
- [`cleanup-and-restart.sh`](cleanup-and-restart.sh) - Utility script for cleanup and restart operations
- [`setup.sh`](setup.sh) - Main setup and deployment script
- [`fix-eslint-typescript-plugin.sh`](fix-eslint-typescript-plugin.sh) - ESLint TypeScript plugin fix script

## Database

ShareThings uses SQLite as its database backend, providing:
- Session management and persistence
- Content metadata storage
- Chunk tracking for large files
- Migration support for schema updates

The database is automatically initialized on first run and includes proper migration handling for updates.

## Development Setup

For local development without containers:

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager

### Local Development
1. **Clone the repository**:
   ```bash
   git clone https://github.com/jsbattig/share-things.git
   cd share-things
   ```

2. **Install dependencies**:
   ```bash
   # Install root dependencies
   npm install
   
   # Install client dependencies
   cd client && npm install && cd ..
   
   # Install server dependencies
   cd server && npm install && cd ..
   ```

3. **Start development servers**:
   ```bash
   # Start both client and server in development mode
   npm start
   ```
   
   Or start them separately:
   ```bash
   # Terminal 1 - Start the backend
   cd server && npm run dev
   
   # Terminal 2 - Start the frontend
   cd client && npm run dev
   ```

4. **Access the application**:
   - Frontend: http://localhost:5173 (Vite dev server)
   - Backend API: http://localhost:3001

### Running Tests
```bash
# Run all tests
npm run test:all

# Run server tests only
cd server && npm test

# Run client tests only
cd client && npm test

# Run end-to-end tests
npm run test:e2e
```

### Building for Production
```bash
# Build both client and server
npm run build

# Build client only
cd client && npm run build

# Build server only
cd server && npm run build
```

## Current Status

✅ **Production Ready** - All systems operational with comprehensive testing

- **Code Quality**: Zero linting errors, strict TypeScript mode
- **Testing**: 69 tests passing (52 server + 17 client + functional tests)
- **Performance**: Optimized React rendering, efficient storage system
- **Security**: End-to-end encryption with unified crypto architecture
- **Deployment**: Automated CI/CD pipeline with containerized deployment
- **Documentation**: Comprehensive guides and technical documentation

## Recent Improvements (June 2025)

### ✅ Clear All Content Feature
- Secure session content clearing with name confirmation
- Real-time broadcasting to all connected clients
- Complete cleanup of database, files, and client cache
- Comprehensive functional testing

### ✅ Enhanced CI/CD Pipeline
- Fixed deployment synchronization issues
- Automated git pull in production deployments
- Improved reliability and error handling

### ✅ Simplified Setup Process
- Removed redundant production/development mode distinction
- Always builds production-optimized containers
- Simplified deployment with consistent behavior
- Updated documentation to use Podman terminology

### ✅ Performance Optimizations
- Eliminated unnecessary React re-renders
- Optimized context and callback dependencies
- Improved UI responsiveness

## Support and Documentation

For detailed technical information, see:
- [`CLAUDE.md`](CLAUDE.md) - Development guide for AI assistants
- [`memory-bank/`](memory-bank/) - Comprehensive project knowledge base
- [`plans/`](plans/) - Feature planning and implementation documents
- [`HAPROXY.md`](HAPROXY.md) - HAProxy configuration guide

## License

This project is licensed under the ISC License.
