# ShareThings

[![Lint](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=lint)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build and Test](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Integration Tests](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=integration)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Deploy to Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=deploy-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)

A real-time content sharing application with end-to-end encryption.

## Features

- Real-time content sharing (text, images, files)
- End-to-end encryption
- Session-based sharing
- Secure passphrase authentication
- Chunking for large files
- WebSocket communication

## Architecture

ShareThings consists of:

1. React frontend with Chakra UI
2. Express backend with Socket.IO
3. End-to-end encryption using CryptoJS library

## Docker Deployment

ShareThings is designed to be deployed using Docker (or Podman on Rocky Linux). The deployment architecture uses containers for both the client and server components, with HAProxy handling SSL termination and routing.

### Prerequisites

- Docker or Podman (for Rocky Linux)
- Docker Compose or Podman Compose
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
1. Detect your OS and recommend the appropriate container engine (Docker or Podman)
2. Create necessary configuration files
3. Configure environment variables
4. Build and start the containers

### Rocky Linux Specific Instructions

On Rocky Linux, the setup script will automatically detect the OS and recommend using Podman instead of Docker. Here's what you need to know:

1. **Install Podman and Podman Compose**:
   ```bash
   sudo dnf install podman podman-compose
   ```

2. **Run the setup script**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Follow the prompts**:
   - Confirm using Podman when prompted
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
         │  (Nginx + SPA) │   │  (Node.js +    │
         │                │   │   Socket.IO)   │
         └────────────────┘   └────────────────┘
```

### Container Configuration

The setup creates two containers:
1. **Frontend Container**: Nginx serving the built React application
2. **Backend Container**: Node.js running the Express and Socket.IO server

Both containers are configured to communicate with each other through an internal Docker/Podman network.

### HAProxy Configuration

HAProxy is used to:
1. Terminate SSL connections
2. Route traffic to the appropriate container
3. Handle WebSocket connections

The setup script generates a template HAProxy configuration file that you can customize. For detailed HAProxy configuration instructions, see [HAPROXY.md](HAPROXY.md).

### Managing Containers

After deployment, you can manage your containers with these commands:

**For Docker:**
```bash
# Check container status
docker ps --filter label=com.docker.compose.project=share-things

# View logs
docker logs share-things-frontend
docker logs share-things-backend

# Restart containers
cd /path/to/share-things && docker-compose down && docker-compose up -d
```

**For Podman (Rocky Linux):**
```bash
# Check container status
podman ps --filter label=io.podman.compose.project=share-things

# View logs
podman logs share-things-frontend
podman logs share-things-backend

# Restart containers
cd /path/to/share-things && podman-compose down && podman-compose up -d
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

3. **SELinux issues (Rocky Linux)**:
   If you encounter permission errors, you may need to set the correct SELinux context:
   ```bash
   sudo chcon -Rt container_file_t /path/to/share-things
   ```

4. **HAProxy connection issues**:
   - Check HAProxy logs: `sudo tail -f /var/log/haproxy.log`
   - Verify your HAProxy configuration matches the ports exposed by your containers
   - See [HAPROXY.md](HAPROXY.md) for detailed troubleshooting

## Project Structure

```
share-things/
├── client/                 # React frontend
│   ├── public/             # Static assets
│   ├── src/                # Source code
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── pages/          # Page components
│   │   ├── utils/          # Utility functions
│   │   └── ...
│   └── ...
├── server/                 # Express backend
│   ├── src/                # Source code
│   │   ├── domain/         # Domain models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.IO handlers
│   │   └── ...
│   └── ...
└── memory-bank/           # Documentation
    ├── architecture/      # Architecture documentation
    ├── technical/         # Technical documentation
    └── ...
```

## Continuous Integration and Deployment

ShareThings uses GitHub Actions for continuous integration and deployment:

1. **Lint**: Runs linting checks on the codebase
2. **Build and Test**: Builds the application and runs unit tests
3. **Dockered Build and Tests**: Runs tests in Docker containers (Integration tests)
4. **Build Production**: Builds and verifies the production Docker configuration
5. **Deploy to Production**: Automatically deploys to the production server when all other workflows succeed

The deployment workflow uses a self-hosted runner on Rocky Linux to connect to the production server via SSH and run the update script.

## Security

ShareThings implements several security measures:

1. **End-to-end Encryption**: All content is encrypted client-side before transmission
2. **Passphrase Fingerprinting**: Allows verification without exposing the passphrase
3. **Token-based Authentication**: Secure session tokens for request authorization
4. **Session Expiration**: Inactive sessions are automatically expired

## License

This project is licensed under the MIT License - see the LICENSE file for details.
