# API Port Configuration in ShareThings Docker Setup

This document explains how the API port configuration works in the ShareThings application and how it needs to be synchronized across the Docker and HAProxy setup.

## Overview

In the ShareThings application, the client needs to know where to send API requests and establish WebSocket connections. This is configured through environment variables that are set during the build process of the client application.

## Client-Side Configuration

### Environment Variables

The client application uses two key environment variables to determine where to send requests:

1. `VITE_API_URL`: The base URL for API requests
2. `VITE_SOCKET_URL`: The URL for Socket.IO connections

These are defined in the client's `.env` file:

```
VITE_API_URL=http://localhost
VITE_SOCKET_URL=http://localhost
```

### How the Client Uses These Variables

In the client code, these variables are accessed using Vite's environment variable system:

```javascript
// Example from client code
const apiUrl = import.meta.env.VITE_API_URL;
const socketUrl = import.meta.env.VITE_SOCKET_URL;
```

The client then uses these URLs to make API requests and establish WebSocket connections.

## Production Configuration with HAProxy

In a production environment with HAProxy, the configuration flow is as follows:

1. **User Access**: Users access the application via HAProxy (e.g., `https://yourdomain.com`)
2. **HAProxy Routing**: HAProxy routes requests to the appropriate container
3. **Client Requests**: The client makes API requests to the same domain (no port specified)
4. **HAProxy API Routing**: HAProxy routes API requests to the backend container

### Environment Variable Configuration for Production

For production, the client's environment variables should be set to the domain name without a port:

```
VITE_API_URL=https://yourdomain.com
VITE_SOCKET_URL=https://yourdomain.com
```

This is because:
1. HAProxy handles SSL termination
2. HAProxy listens on standard ports (80/443)
3. Users access the application via the domain name without specifying a port

### Docker Configuration

In the Docker setup, the environment variables are baked into the client application during the build process:

```dockerfile
# In the client Dockerfile
RUN echo "VITE_API_URL=https://yourdomain.com\n\
VITE_SOCKET_URL=https://yourdomain.com\n\
# Other variables..." > .env

RUN npm run build
```

## HAProxy Configuration

HAProxy needs to be configured to route API and WebSocket requests to the backend container:

```
frontend https_front
    # ... other configuration ...
    
    # Route API requests to backend
    acl is_api path_beg /api
    use_backend sharethings_back if is_api
    
    # Route Socket.IO traffic to backend
    acl is_socketio path_beg /socket.io/
    use_backend sharethings_back if is_socketio
    
    # Route all other traffic to frontend
    default_backend sharethings_front
```

## Nginx Configuration

The Nginx server in the frontend container also needs to proxy API and WebSocket requests to the backend:

```nginx
server {
    # ... other configuration ...
    
    # Proxy API requests to backend
    location /api {
        proxy_pass http://backend:3001;
        # ... other proxy settings ...
    }
    
    # Proxy Socket.IO requests to backend
    location /socket.io {
        proxy_pass http://backend:3001;
        # ... other proxy settings ...
    }
}
```

## Configuration Synchronization

To ensure all components work together correctly, the following must be synchronized:

1. **Client Environment Variables**: Set to the domain name users will access
2. **HAProxy Routing Rules**: Configure to route API and Socket.IO paths to backend
3. **Nginx Proxy Configuration**: Configure to proxy API and Socket.IO paths to backend
4. **Backend Port**: Set to the port the backend container is listening on (3001)

## Template-Based Approach

In our template-based approach, we'll ensure this synchronization by:

1. **Setup Script**: Prompting for the domain name and updating all configurations
2. **Environment Templates**: Providing default values that work together
3. **Docker Compose**: Ensuring consistent port mappings
4. **Configuration Templates**: Pre-configuring HAProxy and Nginx with correct routing

## Example Configuration Flow

Here's how the configuration flows in the complete setup:

1. **User Configuration**:
   - User provides domain name: `yourdomain.com`
   - Setup script updates all configurations

2. **Client Build**:
   - Environment variables set to `https://yourdomain.com`
   - Client built with these variables baked in

3. **HAProxy Configuration**:
   - Listens on ports 80/443
   - Routes `/api` and `/socket.io` to backend
   - Routes everything else to frontend

4. **Nginx Configuration**:
   - Proxies `/api` and `/socket.io` to `http://backend:3001`
   - Serves static files for everything else

5. **Backend Configuration**:
   - Listens on port 3001
   - Handles API requests and WebSocket connections

## Local Development vs. Production

It's important to note the difference between local development and production:

### Local Development
- Client directly accesses backend on specific port (e.g., `http://localhost:3001`)
- No HAProxy involved
- Environment variables set to include port: `VITE_API_URL=http://localhost:3001`

### Production
- Client accesses backend through HAProxy (e.g., `https://yourdomain.com`)
- HAProxy routes requests to appropriate container
- Environment variables set to domain without port: `VITE_API_URL=https://yourdomain.com`

## Conclusion

By understanding this configuration flow and ensuring synchronization across all components, we can create a Docker setup that works seamlessly with HAProxy. The template-based approach will make this configuration process simple and error-free.

When we switch to Code mode, we'll implement these configurations with sensible defaults and a setup script that ensures everything is properly synchronized.