# Custom Port Configuration for ShareThings with HAProxy

This document provides specific instructions for configuring the ShareThings application with HAProxy listening on non-standard ports:
- HAProxy listening on port 15000 for the client app
- HAProxy listening on port 15001 for the API
- Hostname: linner.ddns.net

## Configuration Steps Before Running docker-compose up

### 1. Client Environment Variables

You need to update the client environment variables to include the non-standard ports. Create or modify the `.env` file in the `client` directory:

```
VITE_API_URL=http://linner.ddns.net:15001
VITE_SOCKET_URL=http://linner.ddns.net:15001
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_LOGGING=false
VITE_MAX_FILE_SIZE=104857600
VITE_DEFAULT_CHUNK_SIZE=65536
```

**Important**: If you're using HTTPS, change the URLs to `https://`:

```
VITE_API_URL=https://linner.ddns.net:15001
VITE_SOCKET_URL=https://linner.ddns.net:15001
```

### 2. Update the Client Dockerfile

Modify the client Dockerfile to use these environment variables during the build process. In the `client/Dockerfile`:

```dockerfile
# Build stage
FROM node:16-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create production .env file with custom ports
RUN echo "VITE_API_URL=http://linner.ddns.net:15001\n\
VITE_SOCKET_URL=http://linner.ddns.net:15001\n\
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

### 3. HAProxy Configuration

Update your HAProxy configuration to listen on the specified ports:

```
global
    log /dev/log local0
    log /dev/log local1 notice
    maxconn 4096
    user haproxy
    group haproxy
    daemon
    
    # SSL settings if using HTTPS
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

# Frontend for client app (port 15000)
frontend client_front
    bind *:15000
    
    # Forward client IP
    option forwardfor
    
    # Route all traffic to frontend container
    default_backend sharethings_front

# Frontend for API (port 15001)
frontend api_front
    bind *:15001
    
    # Forward client IP
    option forwardfor
    
    # WebSocket detection for Socket.IO
    acl is_websocket hdr(Upgrade) -i WebSocket
    
    # Route all traffic to backend container
    default_backend sharethings_back

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

### 4. Docker Compose Configuration

Update your `docker-compose.yml` file to expose the necessary ports:

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
      - CORS_ORIGIN=http://linner.ddns.net:15000
      - SESSION_TIMEOUT=600000
      - SESSION_EXPIRY=86400000
      - LOG_LEVEL=info
      - RATE_LIMIT_WINDOW=60000
      - RATE_LIMIT_MAX=100
    ports:
      - "3001:3001"
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
    ports:
      - "8080:80"
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

### 5. Nginx Configuration

Update the Nginx configuration in the frontend container to handle the non-standard ports. Create or modify `client/nginx.conf`:

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

    # No need to proxy API requests in this setup
    # since HAProxy routes them directly to the backend
}
```

## Running the Application

After making these configuration changes, you can build and start the containers:

```bash
docker-compose build
docker-compose up -d
```

## Accessing the Application

With this configuration:

1. Access the client application at: `http://linner.ddns.net:15000`
2. The client will make API requests to: `http://linner.ddns.net:15001`
3. WebSocket connections will be established to: `http://linner.ddns.net:15001`

## HTTPS Configuration (Optional)

If you want to use HTTPS, you'll need to:

1. Update the client environment variables to use `https://`
2. Configure SSL certificates in HAProxy
3. Update the HAProxy configuration to use SSL:

```
frontend client_front
    bind *:15000 ssl crt /etc/ssl/private/combined-cert.pem
    # ... other configuration ...

frontend api_front
    bind *:15001 ssl crt /etc/ssl/private/combined-cert.pem
    # ... other configuration ...
```

## Troubleshooting

If you encounter issues:

1. **Client can't connect to API**: Verify that the environment variables are correctly set with the right hostname and port
2. **WebSocket connection fails**: Check HAProxy WebSocket configuration and ensure the Socket.IO URL is correct
3. **CORS errors**: Verify that the CORS_ORIGIN in the backend environment is set to match the client URL (including port)

## Summary of Changes

To configure the application with HAProxy on non-standard ports:

1. Set client environment variables to include the API port (15001)
2. Configure HAProxy to listen on separate ports for client (15000) and API (15001)
3. Update Docker Compose to expose the necessary ports
4. Update Nginx configuration to handle the non-standard setup
5. Build and run the containers

These changes ensure that all components of the application are properly configured to work with the non-standard port setup.