# Docker Configuration Files for ShareThings

This document contains all the configuration files needed to dockerize the ShareThings application. You can copy these files to their respective locations in your project.

## Table of Contents

1. [Docker Compose Configuration](#docker-compose-configuration)
2. [Backend Dockerfile](#backend-dockerfile)
3. [Frontend Dockerfile](#frontend-dockerfile)
4. [Nginx Configuration](#nginx-configuration)
5. [HAProxy Configuration](#haproxy-configuration)

## Docker Compose Configuration

Create a file named `docker-compose.yml` in the root directory of your project:

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

## Backend Dockerfile

Create a file named `Dockerfile` in the `server` directory:

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

## Frontend Dockerfile

Create a file named `Dockerfile` in the `client` directory:

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

## Nginx Configuration

Create a file named `nginx.conf` in the `client` directory:

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

## HAProxy Configuration

Create a file named `haproxy.cfg` for your HAProxy instance:

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

Remember to replace `docker-host` with your actual Docker host IP or hostname, and adjust any paths or settings to match your specific environment.