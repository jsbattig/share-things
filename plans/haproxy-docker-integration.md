# HAProxy Integration with Docker for ShareThings

This document provides detailed guidance on integrating HAProxy with the dockerized ShareThings application, with special focus on SSL termination and WebSocket support.

## Table of Contents

1. [Overview](#overview)
2. [HAProxy Deployment Options](#haproxy-deployment-options)
3. [HAProxy Configuration for Docker](#haproxy-configuration-for-docker)
4. [WebSocket Configuration](#websocket-configuration)
5. [SSL Termination](#ssl-termination)
6. [Load Balancing Multiple Containers](#load-balancing-multiple-containers)
7. [Monitoring and Health Checks](#monitoring-and-health-checks)
8. [Troubleshooting](#troubleshooting)

## Overview

HAProxy serves as the entry point to the ShareThings application, handling:

1. SSL termination
2. WebSocket proxying for Socket.IO
3. Load balancing (if multiple containers are used)
4. Routing traffic to the appropriate container

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

## HAProxy Deployment Options

There are two main options for deploying HAProxy with Docker:

### Option 1: HAProxy Outside Docker (Recommended)

In this approach, HAProxy runs on the host machine or a separate server:

**Pros:**
- Easier to manage SSL certificates
- Can handle multiple Docker environments
- Simpler network configuration
- Better performance

**Cons:**
- Requires separate installation and management
- Not included in Docker Compose setup

### Option 2: HAProxy as a Docker Container

In this approach, HAProxy runs as another container in the Docker environment:

**Pros:**
- Everything is containerized
- Included in Docker Compose setup
- Easier to version control configuration

**Cons:**
- More complex network configuration
- SSL certificate management is more challenging
- Additional layer of networking

For production environments, **Option 1** is generally recommended for simplicity and performance.

## HAProxy Configuration for Docker

### Basic Configuration

Here's a complete HAProxy configuration for the dockerized ShareThings application:

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

### Docker Host Configuration

For HAProxy to communicate with Docker containers, you need to:

1. **Expose container ports** in the `docker-compose.yml` file:
   ```yaml
   services:
     frontend:
       # ... other configuration ...
       ports:
         - "8080:80"
     
     backend:
       # ... other configuration ...
       ports:
         - "3001:3001"
   ```

2. **Update HAProxy configuration** with the correct host and ports:
   - If HAProxy is on the same host as Docker, use `localhost` or `127.0.0.1`
   - If HAProxy is on a different host, use the Docker host's IP address or hostname

## WebSocket Configuration

WebSocket support is critical for ShareThings, especially for Socket.IO. Here's how to configure HAProxy for proper WebSocket handling:

### 1. WebSocket Detection

```
frontend https_front
    # ... other configuration ...
    
    # WebSocket detection
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_socketio path_beg /socket.io/
    
    # Route WebSocket traffic
    use_backend sharethings_back if is_socketio or is_websocket
```

### 2. WebSocket Timeouts

WebSocket connections remain open for extended periods, so adjust timeouts accordingly:

```
defaults
    # ... other configuration ...
    
    # Standard timeouts
    timeout connect 5s
    timeout client 50s
    timeout server 50s
    
    # WebSocket specific timeouts - critical for long-lived connections
    timeout tunnel 3600s  # 1 hour for WebSocket connections
```

### 3. Backend WebSocket Handling

```
backend sharethings_back
    # ... other configuration ...
    
    # WebSocket handling
    option http-server-close
    http-reuse safe
```

## SSL Termination

HAProxy handles SSL termination for the ShareThings application:

### 1. Certificate Setup

1. Combine your certificate and private key:
   ```bash
   cat your_certificate.crt your_private_key.key > /etc/ssl/private/combined-cert.pem
   chmod 600 /etc/ssl/private/combined-cert.pem
   ```

2. If you have intermediate certificates, include them:
   ```bash
   cat your_certificate.crt intermediate.crt root.crt your_private_key.key > /etc/ssl/private/combined-cert.pem
   ```

### 2. HAProxy SSL Configuration

```
global
    # ... other configuration ...
    
    # SSL settings
    ssl-default-bind-options no-sslv3 no-tlsv10 no-tlsv11
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256

frontend https_front
    bind *:443 ssl crt /etc/ssl/private/combined-cert.pem
    
    # Set HTTPS header for backend
    http-request set-header X-Forwarded-Proto https
```

## Load Balancing Multiple Containers

For high availability and scalability, you can run multiple instances of the ShareThings containers:

### 1. Multiple Backend Instances

Update the `docker-compose.yml` file to use the `deploy` section for scaling:

```yaml
services:
  backend:
    # ... other configuration ...
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    ports:
      - "3001-3003:3001"
```

### 2. HAProxy Configuration for Multiple Backends

```
backend sharethings_back
    # ... other configuration ...
    
    # Sticky sessions - critical for WebSockets
    stick-table type ip size 200k expire 30m
    stick on src
    
    # Multiple backend servers
    server backend1 docker-host:3001 check
    server backend2 docker-host:3002 check
    server backend3 docker-host:3003 check
```

### 3. Multiple Frontend Instances

Similarly, you can scale the frontend:

```yaml
services:
  frontend:
    # ... other configuration ...
    deploy:
      replicas: 2
    ports:
      - "8080-8081:80"
```

### 4. HAProxy Configuration for Multiple Frontends

```
backend sharethings_front
    # ... other configuration ...
    
    # Multiple frontend servers
    server frontend1 docker-host:8080 check
    server frontend2 docker-host:8081 check
```

## Monitoring and Health Checks

### 1. HAProxy Statistics

Add a statistics page to monitor HAProxy:

```
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats admin if LOCALHOST
    stats auth admin:your-secure-password
```

### 2. Container Health Checks

The Docker Compose file includes health checks for both services:

```yaml
services:
  backend:
    # ... other configuration ...
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

HAProxy uses these health checks to determine if a container is available:

```
backend sharethings_back
    # ... other configuration ...
    option httpchk GET /health
```

## Troubleshooting

### 1. WebSocket Connection Issues

If WebSocket connections fail:

- Check HAProxy logs:
  ```bash
  sudo tail -f /var/log/haproxy.log
  ```

- Verify WebSocket headers are being passed correctly:
  ```
  # These must be set in HAProxy
  option http-server-close
  http-reuse safe
  ```

- Check timeouts:
  ```
  # Increase for long-lived connections
  timeout tunnel 3600s
  ```

### 2. SSL Certificate Issues

If SSL termination fails:

- Verify the certificate file:
  ```bash
  openssl x509 -in /etc/ssl/private/combined-cert.pem -text -noout
  ```

- Check HAProxy SSL configuration:
  ```
  # Ensure this path is correct
  bind *:443 ssl crt /etc/ssl/private/combined-cert.pem
  ```

### 3. Container Connectivity Issues

If HAProxy can't connect to containers:

- Check if ports are exposed:
  ```bash
  docker-compose ps
  ```

- Verify network connectivity:
  ```bash
  telnet docker-host 3001
  ```

- Check Docker network configuration:
  ```bash
  docker network inspect app-network