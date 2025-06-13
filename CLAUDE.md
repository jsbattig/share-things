# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShareThings is a real-time content sharing application with end-to-end encryption. It consists of a React frontend, Node.js backend, and uses Podman for containerized deployment.

## Common Development Commands

### Building and Development
```bash
# Start both client and server in development mode
npm start

# Build both client and server for production
npm run build

# Start individual components
cd client && npm run dev    # Frontend development server
cd server && npm run dev    # Backend development server
```

### Testing
```bash
# Run all tests (client, server, and E2E)
npm run test:all

# Run specific test suites
cd client && npm test       # Client unit tests
cd server && npm test       # Server unit tests
npm run test:e2e           # End-to-end functional tests

# Run a single E2E test
npm run test:e2e:simple

# Run tests in specific directory
cd test/e2e/functional && npm test -- clear-all-content.test.ts
```

### Linting and Code Quality
```bash
# Lint client code
cd client && npm run lint

# Lint server code
cd server && npm run lint

# Build TypeScript (checks for compilation errors)
cd client && npm run build
cd server && npm run build
```

### Deployment and Container Management
```bash
# Run the main setup script for deployment
./setup.sh

# Check container status
podman ps --filter label=io.podman.compose.project=share-things

# View container logs
podman logs share-things-frontend
podman logs share-things-backend
```

## Architecture Overview

### Monorepo Structure
- **`client/`** - React frontend with Vite build system
- **`server/`** - Express.js backend with Socket.IO
- **`shared/`** - Shared TypeScript types and crypto utilities
- **`test/`** - Cross-system integration and E2E tests
- **`setup/`** - Deployment and configuration scripts

### Key Architectural Patterns

#### Unified Crypto System
The project uses a unified crypto abstraction in `shared/crypto/` that works across browser and Node.js environments:
- **`types.ts`** - Interfaces for all crypto operations
- **`browser.ts`** - CryptoJS implementation for client
- **`node.ts`** - Node.js crypto implementation for server
- **`polyfills.ts`** - Environment-specific polyfills

This allows seamless encryption/decryption across client and server while maintaining the same API.

#### Content Store Architecture
Content sharing uses a sophisticated chunking and caching system:
- **ContentStoreContext** - Main React context managing content state
- **ChunkTrackingService** - Tracks chunk upload/download progress
- **DiskCacheService** - Client-side IndexedDB cache for large files
- **FileSystemChunkStorage** - Server-side file and database storage

#### Socket Communication
Real-time features use Socket.IO with structured event handling:
- **SocketContext** - React context wrapping Socket.IO client
- **server/src/socket/index.ts** - Main socket event handlers
- Events for content sharing, chunking, session management, and broadcasts

#### Session Management
Sessions use passphrase-based authentication with fingerprinting:
- Passphrases are never sent to server
- Fingerprints allow session validation without exposing passphrases
- Content is encrypted client-side before transmission

### Database and Storage

#### Server Storage (`server/src/infrastructure/storage/`)
- **SQLite database** for metadata and session management
- **File system** for encrypted content chunks
- **Migration system** for schema updates
- **Connection pooling** for database access

#### Client Storage
- **React state** for active session data
- **IndexedDB** via DiskCacheService for caching large files
- **URL Registry** for managing temporary blob URLs

## Development Guidelines

### Adding New Features
1. Check `plans/` directory for existing planning documents
2. Review `memory-bank/` for architectural decisions and patterns
3. Follow existing patterns in similar components
4. Add appropriate tests (unit, integration, E2E as needed)

### Socket Events
When adding new socket events:
1. Define event handler in `server/src/socket/index.ts`
2. Add client method in `SocketContext.tsx`
3. Update the SocketContextType interface
4. Add event listeners in relevant React contexts
5. Write E2E tests for the complete flow

### Crypto Operations
Use the unified crypto system from `shared/crypto/`:
- Import from `shared/crypto` not directly from crypto libraries
- Use the CryptoInterface for consistency
- Test crypto operations on both client and server

### Testing Strategy
- **Unit tests** - Individual functions and classes
- **Integration tests** - Database operations, file system, API endpoints
- **Functional tests** - Complete user workflows using real server instances
- E2E tests run real server processes and simulate multiple clients

### Environment Configuration
Development uses automatic port detection and localhost URLs. Production deployment:
- Uses `setup.sh` script for configuration
- Supports custom hostnames and HTTPS
- Configures HAProxy for SSL termination
- Environment variables are in `.env` files for each component

## Common Patterns and Conventions

### Error Handling
- Server responses use `{ success: boolean; error?: string }` pattern
- Socket events include callback functions for response handling
- Client-side errors are logged and shown via toast notifications

### Content Processing
Content goes through several stages:
1. **Client encryption** before transmission
2. **Chunking** for large files
3. **Server storage** in file system with database metadata
4. **Broadcasting** to other session participants
5. **Client decryption** and caching

### State Management
- React Context for shared state (ContentStore, Socket, Services)
- Local component state for UI-specific data
- Service classes for business logic (singleton pattern)

### File Handling
Large files are automatically chunked:
- Default chunk size: 64KB (configurable)
- Chunks stored separately on disk
- Progress tracking during upload/download
- Automatic reassembly on the client

## CI/CD Pipeline

The GitHub Actions workflow includes:
1. **Lint** - Code quality checks
2. **Build and Test** - Unit and integration tests
3. **Container Build** - Podman container verification
4. **E2E Tests** - Full workflow testing
5. **Deploy** - Automatic deployment to production

The deployment process:
1. Connects to production server via SSH
2. Pulls latest code from git
3. Runs setup script for fresh installation
4. Verifies container status

## Important Notes

### Logging
- Client logging is controlled by `VITE_ENABLE_LOGGING` environment variable
- Server logging level set by `LOG_LEVEL` environment variable
- Avoid excessive console.log statements in production code

### Security Considerations
- All content is encrypted client-side before transmission
- Passphrases never leave the client browser
- Session tokens expire automatically
- Content deletion broadcasts to all session participants

### Performance
- Large files are chunked to prevent memory issues
- IndexedDB caching reduces redundant downloads
- SQLite with WAL mode for concurrent access
- Blob URLs are automatically cleaned up to prevent memory leaks