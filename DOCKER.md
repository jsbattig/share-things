# ShareThings Docker Deployment

This document provides instructions for deploying the ShareThings application using Docker.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Manual Configuration](#manual-configuration)
4. [HAProxy Integration](#haproxy-integration)
5. [Custom Port Configuration](#custom-port-configuration)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker Engine (version 20.10.0 or higher)
- Docker Compose (version 2.0.0 or higher)
- Git (to clone the repository)

## Quick Start

The easiest way to get started is to use the provided setup script:

```bash
# Clone the repository
git clone https://github.com/yourusername/share-things.git
cd share-things

# Make the setup script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

The setup script will:
1. Create environment files from templates
2. Prompt for configuration values (hostname, ports, etc.)
3. Update configuration files with your values
4. Optionally build and start the containers

## Manual Configuration

If you prefer to configure the application manually:

1. Copy the environment templates:
   ```bash
   cp .env.example .env
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```

2. Edit the environment files with your configuration:
   ```bash
   # Edit the main .env file
   nano .env
   
   # Edit the client .env file
   nano client/.env
   
   # Edit the server .env file
   nano server/.env
   ```

3. Build and start the containers:
   ```bash
   docker-compose build
   docker-compose up -d
   ```

## HAProxy Integration

ShareThings is designed to work with HAProxy for SSL termination and load balancing. A template HAProxy configuration is provided in `haproxy.cfg.template`.

To use HAProxy with ShareThings:

1. Copy the template to your HAProxy configuration directory:
   ```bash
   cp haproxy.cfg.template /etc/haproxy/haproxy.cfg
   ```

2. Edit the configuration to match your environment:
   ```bash
   # Replace 'docker-host' with your Docker host IP or hostname
   # Update ports if necessary
   # Configure SSL certificates if using HTTPS
   nano /etc/haproxy/haproxy.cfg
   ```

3. Restart HAProxy:
   ```bash
   sudo systemctl restart haproxy
   ```

## Custom Port Configuration

If you're using custom ports for HAProxy (e.g., 15000 for client, 15001 for API):

1. Update the client environment variables:
   ```
   VITE_API_URL=http://yourdomain.com:15001
   VITE_SOCKET_URL=http://yourdomain.com:15001
   ```

2. Update the server CORS configuration:
   ```
   CORS_ORIGIN=http://yourdomain.com:15000
   ```

3. Update the HAProxy configuration to listen on these ports:
   ```
   frontend client_front
       bind *:15000
       # ...
   
   frontend api_front
       bind *:15001
       # ...
   ```

For detailed instructions, see [Custom Port Configuration](./plans/custom-port-configuration.md).

## Production Deployment

For production deployments, use the production Docker Compose file:

```bash
# Build and start containers with production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The production configuration includes:
- Resource limits for containers
- Logging configuration
- Restart policies

## Troubleshooting

### Container Startup Issues

If containers fail to start:

```bash
# Check container logs
docker-compose logs

# Check container status
docker-compose ps
```

### WebSocket Connection Issues

If WebSocket connections fail:

1. Verify HAProxy WebSocket configuration:
   ```
   # These should be in your HAProxy configuration
   timeout tunnel 3600s
   option http-server-close
   http-reuse safe
   ```

2. Check Nginx WebSocket proxy settings:
   ```
   # These should be in your Nginx configuration
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection 'upgrade';
   ```

### CORS Issues

If you encounter CORS errors:

1. Verify the CORS_ORIGIN in the server environment matches the client URL (including protocol and port)
2. Check that HAProxy is properly forwarding headers

For more detailed troubleshooting, refer to the [Docker Deployment Guide](./plans/docker-deployment-guide.md).