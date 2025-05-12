# ShareThings Docker Deployment Guide

This guide provides comprehensive instructions for deploying the ShareThings application using Docker. The deployment architecture uses Docker containers for both the client and server components, with Nginx serving the client's static files and HAProxy handling SSL termination and load balancing.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Directory Structure](#directory-structure)
4. [Docker Configuration Files](#docker-configuration-files)
   - [Docker Compose](#docker-compose)
   - [Backend Dockerfile](#backend-dockerfile)
   - [Frontend Dockerfile](#frontend-dockerfile)
   - [Nginx Configuration](#nginx-configuration)
5. [Environment Configuration](#environment-configuration)
6. [HAProxy Configuration](#haproxy-configuration)
7. [Deployment Steps](#deployment-steps)
8. [Scaling and Production Considerations](#scaling-and-production-considerations)
9. [Troubleshooting](#troubleshooting)

## Architecture Overview

The dockerized ShareThings application consists of the following components:

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

- **HAProxy**: Handles SSL termination, load balancing, and routes traffic to the appropriate container
- **Frontend Container**: Nginx serving the built React application (static files)
- **Backend Container**: Node.js running the Express and Socket.IO server

## Prerequisites

- Docker Engine (version 20.10.0 or higher)
- Docker Compose (version 2.0.0 or higher)
- Git (to clone the repository)
- Basic understanding of Docker, Node.js, and networking

## Directory Structure

After implementing this Docker setup, your project structure will include these additional files:

```
share-things/
├── client/
│   ├── ... (existing files)
│   ├── Dockerfile                 # Frontend Dockerfile
│   └── nginx.conf                 # Nginx configuration
├── server/
│   ├── ... (existing files)
│   └── Dockerfile                 # Backend Dockerfile
├── docker-compose.yml             # Docker Compose configuration
├── docker-deployment-guide.md     # This guide
└── haproxy.cfg                    # HAProxy configuration example
```

## Docker Configuration Files

### Docker Compose

Create a `docker-compose.yml` file in the root directory:

```yaml
version: '3.8'

services:
  # Backend service
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: sharethings-backend
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3001
      - CORS_ORIGIN=http://frontend
      - SESSION_TIMEOUT=600000
      - SESSION_EXPIRY=86400000
      - LOG_LEVEL=info
      - RATE_LIMIT_WINDOW=60000
      - RATE_LIMIT_MAX=100
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # Frontend service
  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
    container_name: sharethings-frontend
    restart: always
    depends_on:
      - backend
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

networks:
  app-network:
    driver: bridge
```

### Backend Dockerfile

Create a `Dockerfile` in the `server` directory:

```dockerfile
FROM node:16-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:16-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create health check endpoint
RUN echo 'const http = require("http"); \
    const server = http.createServer((req, res) => { \
      if (req.url === "/health") { \
        res.writeHead(200, {"Content-Type": "application/json"}); \
        res.end(JSON.stringify({status: "ok"})); \
      } else { \
        res.writeHead(404); \
        res.end(); \
      } \
    }); \
    server.listen(3001);' > /app/health.js

# Expose the port
EXPOSE 3001

# Start the server
CMD ["node", "dist/index.js"]
```

### Frontend Dockerfile

Create a `Dockerfile` in the `client` directory:

```dockerfile
# Build stage
FROM node:16-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create production .env file
RUN echo "VITE_API_URL=http://localhost\n\
VITE_SOCKET_URL=http://localhost\n\
VITE_ENABLE_ANALYTICS=false\n\
VITE_ENABLE_LOGGING=false\n\
VITE_MAX_FILE_SIZE=104857600\n\
VITE_DEFAULT_CHUNK_SIZE=65536" > .env

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Configuration

Create an `nginx.conf` file in the `client` directory:

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy Socket.IO requests to backend
    location /socket.io {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Environment Configuration

### Backend Environment Variables

The backend container uses these environment variables:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| NODE_ENV | Environment mode | production |
| PORT | Server port | 3001 |
| CORS_ORIGIN | Allowed CORS origin | http://frontend |
| SESSION_TIMEOUT | Session timeout in ms | 600000 (10 minutes) |
| SESSION_EXPIRY | Session expiry in ms | 86400000 (24 hours) |
| LOG_LEVEL | Logging level | info |
| RATE_LIMIT_WINDOW | Rate limit window in ms | 60000 (1 minute) |
| RATE_LIMIT_MAX | Max requests per window | 100 |

These are set in the `docker-compose.yml` file, but you can override them by creating a `.env` file in the project root.

### Frontend Environment Variables

The frontend environment variables are baked into the build during the Docker image creation:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| VITE_API_URL | API URL | http://localhost |
| VITE_SOCKET_URL | Socket.IO URL | http://localhost |
| VITE_ENABLE_ANALYTICS | Enable analytics | false |
| VITE_ENABLE_LOGGING | Enable logging | false |
| VITE_MAX_FILE_SIZE | Max file size in bytes | 104857600 (100MB) |
| VITE_DEFAULT_CHUNK_SIZE | Chunk size in bytes | 65536 (64KB) |

## HAProxy Configuration

Create a `haproxy.cfg` file to use with your HAProxy instance:

```
global
    log /dev/log local0
    log /dev/log local1 notice
    maxconn 4096
    user haproxy
    group haproxy
    daemon
    
    # SSL settings
    ssl-default-bind-options no-sslv3 no-tlsv10 no-tlsv11
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256

defaults
    log global
    mode http
    option httplog
    option dontlognull
    
    # Standard timeouts
    timeout connect 5s
    timeout client 50s
    timeout server 50s
    
    # WebSocket specific timeouts
    timeout tunnel 3600s
    timeout http-keep-alive 1s
    timeout http-request 10s
    timeout client-fin 10s
    timeout server-fin 10s

frontend https_front
    bind *:443 ssl crt /etc/ssl/private/combined-cert.pem
    
    # Forward client IP
    option forwardfor
    http-request set-header X-Forwarded-Proto https
    
    # WebSocket detection for Socket.IO
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_socketio path_beg /socket.io/
    
    # Route Socket.IO traffic to backend container
    use_backend sharethings_back if is_socketio
    
    # Route all other traffic to frontend container
    default_backend sharethings_front

backend sharethings_front
    balance roundrobin
    option httpchk GET /
    
    # Server definition - point to frontend container
    # Replace docker-host with your Docker host IP or hostname
    server frontend docker-host:8080 check

backend sharethings_back
    balance roundrobin
    option httpchk GET /health
    
    # WebSocket handling
    option http-server-close
    http-reuse safe
    
    # Sticky sessions
    stick-table type ip size 200k expire 30m
    stick on src
    
    # Server definition - point to backend container
    # Replace docker-host with your Docker host IP or hostname
    server backend docker-host:3001 check
```

**Important Notes:**
1. Replace `docker-host` with your Docker host IP or hostname
2. Update the port mappings if you change them in the Docker Compose file
3. Ensure your SSL certificate is properly configured at `/etc/ssl/private/combined-cert.pem`

## Deployment Steps

Follow these steps to deploy the ShareThings application using Docker:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/share-things.git
   cd share-things
   ```

2. **Create Docker configuration files**:
   - Create `docker-compose.yml` in the root directory
   - Create `Dockerfile` in the `server` directory
   - Create `Dockerfile` and `nginx.conf` in the `client` directory

3. **Build and start the containers**:
   ```bash
   docker-compose build
   docker-compose up -d
   ```

4. **Verify the containers are running**:
   ```bash
   docker-compose ps
   ```

5. **Configure HAProxy**:
   - Install HAProxy on your host machine or a separate server
   - Copy the HAProxy configuration to `/etc/haproxy/haproxy.cfg`
   - Update the configuration with your Docker host IP and port mappings
   - Restart HAProxy:
     ```bash
     sudo systemctl restart haproxy
     ```

6. **Access the application**:
   - Open your browser and navigate to `https://your-domain.com`
   - The application should be running with SSL termination via HAProxy

## Scaling and Production Considerations

### Multiple Backend Instances

To scale the backend service horizontally:

1. Update the `docker-compose.yml` file:
   ```yaml
   backend:
     # ... existing configuration ...
     deploy:
       replicas: 3
   ```

2. Update the HAProxy configuration to include all backend instances:
   ```
   backend sharethings_back
       # ... existing configuration ...
       server backend1 docker-host:3001 check
       server backend2 docker-host:3002 check
       server backend3 docker-host:3003 check
   ```

### Data Persistence

If your application needs to persist data:

1. Add volumes to the `docker-compose.yml` file:
   ```yaml
   backend:
     # ... existing configuration ...
     volumes:
       - ./data:/app/data
   ```

### Container Health Monitoring

The Docker Compose file includes health checks for both services. You can monitor their health with:

```bash
docker-compose ps
```

### Logging

To view container logs:

```bash
# View backend logs
docker-compose logs backend

# View frontend logs
docker-compose logs frontend

# Follow logs in real-time
docker-compose logs -f
```

## Troubleshooting

### WebSocket Connection Issues

If WebSocket connections fail:

1. Check HAProxy logs:
   ```bash
   sudo tail -f /var/log/haproxy.log
   ```

2. Verify HAProxy WebSocket configuration:
   - Ensure `timeout tunnel` is set to a high value
   - Verify the WebSocket detection ACLs are correct

3. Check Nginx WebSocket proxy settings:
   - Ensure the `Upgrade` and `Connection` headers are properly set

### Container Startup Issues

If containers fail to start:

1. Check container logs:
   ```bash
   docker-compose logs
   ```

2. Verify environment variables:
   - Check that all required environment variables are set
   - Ensure the values are correct

3. Check network connectivity:
   - Verify that containers can communicate with each other
   - Check that HAProxy can reach the Docker host

### SSL Certificate Issues

If SSL termination fails:

1. Verify the certificate file:
   ```bash
   openssl x509 -in /etc/ssl/private/combined-cert.pem -text -noout
   ```

2. Check HAProxy SSL configuration:
   - Ensure the certificate path is correct
   - Verify SSL settings in the global section