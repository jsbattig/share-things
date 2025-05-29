# Networking Configuration

## Overview

ShareThings supports multiple deployment configurations with different networking setups. This document details how the application's networking is configured in different environments, including development, production with HAProxy, and production with Podman containers.

## Deployment Configurations

ShareThings can be deployed in several configurations:

1. **Development**: Direct connection to the backend server
2. **Production with HAProxy**: HAProxy routes traffic to frontend and backend containers
3. **Production with Podman**: Podman containers with Node.js static server for frontend

## Network Flow Diagrams

### Development Environment

```mermaid
graph LR
    A[Client Browser] -->|"http://localhost:3001/api"| B[Backend Server]
    A -->|"http://localhost:3001/socket.io"| B
    A -->|"http://localhost:5173"| C[Frontend Dev Server]
```

In development:
- The frontend runs on a Vite development server (typically on port 5173)
- The backend runs directly on port 3001
- The client connects directly to both servers

### Production with HAProxy

```mermaid
graph LR
    A[Client Browser] -->|"https://yourdomain.com:15000"| B[HAProxy client_front]
    A -->|"https://yourdomain.com:15001/api"| C[HAProxy api_front]
    A -->|"https://yourdomain.com:15001/socket.io"| C
    B -->|"http://frontend:8080"| D[Frontend Container]
    C -->|"http://backend:3001"| E[Backend Container]
```

In production with HAProxy:
- HAProxy has two frontends:
  - `client_front` on port 15000 for the client application
  - `api_front` on port 15001 for API and Socket.IO
- The client application is served by the frontend container through HAProxy's `client_front`
- API requests and Socket.IO connections go directly to the backend container through HAProxy's `api_front`

### Production with Podman

```mermaid
graph LR
    A[Client Browser] -->|"http://yourdomain.com"| B[Frontend Container]
    B -->|Static Files| A
    A -->|"/api"| B
    A -->|"/socket.io"| B
    B -->|"http://backend:3001/api"| C[Backend Container]
    B -->|"http://backend:3001/socket.io"| C
```

In production with Podman containers:
- The frontend container serves the client application using Node.js static server
- API and Socket.IO requests are handled by the backend container
- Containers communicate through Podman network

## Client Configuration

The client determines the backend URL dynamically based on environment variables:

```typescript
// Dynamically determine the backend URL based on the current window location
const getBackendUrl = () => {
  // If an environment variable is set to a specific value (not 'auto'), use it
  if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL !== 'auto') {
    console.log(`[Socket] Using configured backend URL: ${import.meta.env.VITE_SOCKET_URL}`);
    return import.meta.env.VITE_SOCKET_URL;
  }
  
  // Otherwise, derive from the current URL
  const currentUrl = new URL(window.location.href);
  
  // Determine the appropriate port based on environment variables or fallback to default
  const port = import.meta.env.VITE_API_PORT || '3001';
  
  // Construct the backend URL
  const backendUrl = `${currentUrl.protocol}//${currentUrl.hostname}${port ? ':' + port : ''}`;
  console.log(`[Socket] Automatically determined backend URL: ${backendUrl}`);
  
  return backendUrl;
};
```

### Environment Variables

The client uses the following environment variables:

| Variable | Description | Example Values |
|----------|-------------|----------------|
| `VITE_API_URL` | Base URL for API requests | `http://localhost:3001`, `https://yourdomain.com`, `auto` |
| `VITE_SOCKET_URL` | URL for Socket.IO connections | `http://localhost:3001`, `https://yourdomain.com`, `auto` |
| `VITE_API_PORT` | Port for API and Socket.IO when auto-detecting | `3001` |

## HAProxy Configuration

HAProxy is configured with two frontends and two backends:

### Frontends

#### client_front (Port 15000)

```
frontend client_front
    bind *:15000
    
    # Forward client IP
    option forwardfor
    http-request set-header X-Forwarded-Proto http
    
    # Route all traffic to frontend container
    default_backend sharethings_front
```

#### api_front (Port 15001)

```
frontend api_front
    bind *:15001
    
    # Forward client IP
    option forwardfor
    http-request set-header X-Forwarded-Proto http
    
    # WebSocket detection for Socket.IO
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_socketio path_beg /socket.io/
    
    # Route all traffic to backend container
    default_backend sharethings_back
```

### Backends

#### sharethings_front

```
backend sharethings_front
    balance roundrobin
    option httpchk GET /
    
    # Server definition - point to frontend container
    server frontend podman-host:15000 check
```

#### sharethings_back

```
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
    server backend podman-host:3001 check
```

## Frontend Container Configuration

The frontend container uses a Node.js static server to serve the built React application. The static server is configured to handle routing and serve static files efficiently.

### Static Server Configuration

```javascript
// static-server.js
const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const port = process.env.PORT || 15000;

// Enable gzip compression
app.use(compression());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Static server running on port ${port}`);
});
```

## Environment-Specific Configurations

### Development

In development:
- Client directly accesses backend on port 3001
- No HAProxy or Nginx involved
- Environment variables set to include port: `VITE_API_URL=http://localhost:3001`

### Production with HAProxy

In production with HAProxy:
- Client accesses frontend through HAProxy on port 15000
- Client accesses backend through HAProxy on port 15001
- Environment variables set to domain with specific ports:
  ```
  VITE_API_URL=https://yourdomain.com:15001
  VITE_SOCKET_URL=https://yourdomain.com:15001
  ```

### Production with Podman

In production with Podman containers:
- Client accesses frontend through the frontend container
- API and Socket.IO requests go directly to the backend container
- Environment variables configured based on deployment setup:
  ```
  VITE_API_URL=auto
  VITE_SOCKET_URL=auto
  VITE_API_PORT=3001
  ```

## Configuration Synchronization

To ensure all components work together correctly, the following must be synchronized:

1. **Client Environment Variables**: Set to the appropriate URL based on deployment configuration
2. **HAProxy Configuration**: Configure to route traffic to the correct containers
3. **Podman Network**: Ensure containers can communicate through Podman network
4. **Backend Port**: Set to the port the backend container is listening on (3001)

## Security Considerations

1. **SSL Termination**: In production, SSL termination should be handled by HAProxy
2. **CORS Configuration**: CORS must be properly configured on the backend to allow requests from the frontend
3. **WebSocket Security**: WebSocket connections must be properly secured with authentication
4. **Container Security**: Podman containers should run with appropriate security contexts and user permissions