# HAProxy Configuration for ShareThings

This document provides detailed instructions for configuring HAProxy to work with the ShareThings application, using a dual-port approach for web application and API/WebSocket traffic.

## Overview

HAProxy will be used for:
1. SSL termination for both web application and API/WebSocket traffic
2. Separate port handling for web application and API/WebSockets
3. WebSocket proxying on the API port
4. Load balancing (if multiple backend servers are used)
5. Session persistence

## Architecture Diagram

```
                             +-----------------+
                             |                 |
                         +-->| Frontend Server |
                         |   | (Nginx/Static)  |
+----------------+       |   +-----------------+
|                |       |
| HAProxy        |       |
| Port 15000 ----|-------+
| (Web App)      |
|                |       |   +-----------------+
| Port 15001 ----|-------+-->|                 |
| (API/WebSocket)|           | Backend Server  |
+----------------+           | (API/WebSockets)|
                             +-----------------+
```

## Basic HAProxy Configuration

Here's a complete configuration example for HAProxy with ShareThings using the dual-port approach:

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

# Frontend for client app (port 15000)
frontend client_front
    # For SSL termination:
    bind *:15000 ssl crt /etc/ssl/private/combined-cert.pem
    # For non-SSL:
    # bind *:15000
    
    # Forward client IP
    option forwardfor
    http-request set-header X-Forwarded-Proto https
    # For non-SSL:
    # http-request set-header X-Forwarded-Proto http
    
    # Route all traffic to frontend container
    default_backend sharethings_front

# Frontend for API (port 15001)
frontend api_front
    # For SSL termination:
    bind *:15001 ssl crt /etc/ssl/private/combined-cert.pem
    # For non-SSL:
    # bind *:15001
    
    # Forward client IP
    option forwardfor
    http-request set-header X-Forwarded-Proto https
    # For non-SSL:
    # http-request set-header X-Forwarded-Proto http
    
    # WebSocket detection for Socket.IO
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_socketio path_beg /socket.io/
    
    # Route all traffic to backend container
    default_backend sharethings_back

backend sharethings_front
    balance roundrobin
    option httpchk GET /
    
    # Server definition - point to frontend container
    server frontend 127.0.0.1:8080 check

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
    server backend 127.0.0.1:3001 check inter 2000 rise 3 fall 3 maxconn 1000
```

## HAProxy WebSocket Configuration

WebSocket connections require special handling in HAProxy and are configured on the API port (15001):

### Global Section

The global section doesn't require WebSocket-specific settings, but ensure you have adequate resources configured:

```
global
    log /dev/log local0
    log /dev/log local1 notice
    maxconn 4096                  # Increase for high-traffic scenarios
    user haproxy
    group haproxy
    daemon
    
    # SSL settings if terminating SSL in HAProxy
    ssl-default-bind-options no-sslv3 no-tlsv10 no-tlsv11
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...
```

### Defaults Section

The defaults section needs timeout adjustments for WebSockets:

```
defaults
    log global
    mode http
    option httplog
    option dontlognull
    
    # Standard timeouts
    timeout connect 5s
    
    # Client/Server timeouts - increase for WebSockets
    timeout client 30s
    timeout server 30s
    
    # HTTP keep-alive timeout
    timeout http-keep-alive 1s
    
    # Important for WebSockets - tunnel timeout for upgraded connections
    # This controls how long an idle WebSocket connection stays open
    timeout tunnel 3600s        # 1 hour for WebSocket connections
    
    # Properly close connections
    option http-server-close
```

### Frontend Sections

With the dual-port approach, we have two separate frontend sections:

#### Web Application Frontend (Port 15000)

```
frontend client_front
    # Binding configuration with SSL
    bind *:15000 ssl crt /etc/ssl/private/combined-cert.pem
    
    # Forward client IP
    option forwardfor
    
    # Set X-Forwarded-Proto header
    http-request set-header X-Forwarded-Proto https
    
    # No WebSocket handling needed here
    
    # Default backend for web application traffic
    default_backend sharethings_front
```

#### API/WebSocket Frontend (Port 15001)

```
frontend api_front
    # Binding configuration with SSL (using the same certificate)
    bind *:15001 ssl crt /etc/ssl/private/combined-cert.pem
    
    # Forward client IP
    option forwardfor
    
    # Set X-Forwarded-Proto header
    http-request set-header X-Forwarded-Proto https
    
    # WebSocket detection - CRITICAL for WebSocket support
    # These ACLs identify WebSocket connection requests
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_websocket hdr_beg(Host) -i ws
    
    # If using Socket.IO, add specific path detection
    acl is_socketio path_beg /socket.io/
    
    # All traffic on this port goes to the backend
    default_backend sharethings_back
```

### Backend Sections

We have separate backend sections for the web application and API/WebSockets:

#### Web Application Backend

```
backend sharethings_front
    balance roundrobin
    
    # Health check
    option httpchk GET /
    
    # Server definition with appropriate check interval
    server frontend 127.0.0.1:8080 check
    
    # If you have multiple frontend servers
    # server frontend_2 127.0.0.1:8081 check
```

#### API/WebSocket Backend

```
backend sharethings_back
    balance roundrobin
    
    # Health check
    option httpchk GET /health
    
    # WebSocket specific options - CRITICAL
    # These ensure proper WebSocket protocol handling
    option http-server-close     # Proper connection handling
    http-reuse safe              # Safe connection reuse
    
    # Disable compression for WebSockets to avoid buffering
    compression algo none
    
    # Sticky sessions - important for WebSockets to maintain connection to same server
    stick-table type ip size 200k expire 30m
    stick on src
    
    # Server definition with appropriate check interval
    server backend 127.0.0.1:3001 check inter 2000 rise 3 fall 3 maxconn 1000
    
    # If you have multiple backend servers
    # server backend_2 127.0.0.1:3002 check inter 2000 rise 3 fall 3 maxconn 1000
```

## Socket.IO Configuration

Socket.IO works with the dual-port approach, requiring configuration on the API port.

### Socket.IO Path Configuration

The "path configuration" refers to the URL path that Socket.IO uses for its connections. This must be consistent across:

1. Socket.IO server
2. Socket.IO client
3. HAProxy configuration (on the API port)

### Configuring the Path in Socket.IO Server

In your Node.js server code, you configure the Socket.IO path when initializing the Socket.IO server:

```javascript
// Import dependencies
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with path configuration
const io = new Server(server, {
  path: '/socket.io/',  // This is the default, but you can change it
  // Other Socket.IO options...
});

// Start the server
server.listen(3001, () => {
  console.log('Server listening on port 3001');
});
```

### Configuring the Path in Socket.IO Client

On the client side, you must use the same path when connecting, and specify the correct port:

```javascript
// Connect to the API/WebSocket port
const socket = io('https://yourdomain.com:15001', {
  // Default path is '/socket.io/', so no need to specify if using default
  path: '/socket.io/',
});

// OR using custom path (must match server)
const socket = io('https://yourdomain.com:15001', {
  path: '/ws/',  // Must match the server configuration
});
```

### Configuring HAProxy for Socket.IO on the API Port

In your HAProxy configuration, create ACLs for the Socket.IO path on the API frontend:

```
frontend api_front
    # Other frontend settings...
    
    # ACL to detect Socket.IO traffic
    acl is_socketio path_beg /socket.io/
    
    # ACL to detect WebSocket upgrade requests for Socket.IO
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_socketio_ws path_beg /socket.io/ hdr(Upgrade) -i WebSocket
    
    # All traffic on this port goes to the backend
    default_backend sharethings_back
```

## SSL Certificate Setup

To set up SSL certificates for HAProxy:

1. Combine your certificate and private key into a single PEM file:

```bash
cat your_certificate.crt your_private_key.key > /etc/ssl/private/combined-cert.pem
chmod 600 /etc/ssl/private/combined-cert.pem
```

2. If you have intermediate certificates, include them as well:

```bash
cat your_certificate.crt intermediate.crt root.crt your_private_key.key > /etc/ssl/private/combined-cert.pem
chmod 600 /etc/ssl/private/combined-cert.pem
```

3. Update your HAProxy configuration to use the same combined certificate for both frontends:

```
frontend client_front
    bind *:15000 ssl crt /etc/ssl/private/combined-cert.pem
    # Other settings...

frontend api_front
    bind *:15001 ssl crt /etc/ssl/private/combined-cert.pem
    # Other settings...
```

## Monitoring and Statistics

Add HAProxy statistics for monitoring:

```
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats admin if LOCALHOST
    stats auth admin:your-secure-password
```

## Load Balancing Multiple Backends

If you have multiple ShareThings servers:

```
backend sharethings_front
    balance roundrobin
    option httpchk GET /
    
    # Multiple server definitions
    server frontend_1 10.0.0.1:8080 check
    server frontend_2 10.0.0.2:8080 check

backend sharethings_back
    balance roundrobin
    option httpchk GET /health
    
    # WebSocket specific options
    option http-server-close
    http-reuse safe
    
    # Sticky sessions
    stick-table type ip size 200k expire 30m
    stick on src
    
    # Multiple server definitions
    server backend_1 10.0.0.1:3001 check inter 2000 rise 3 fall 3 maxconn 1000
    server backend_2 10.0.0.2:3001 check inter 2000 rise 3 fall 3 maxconn 1000
```

## Troubleshooting

### Common Issues

1. **WebSocket connections fail to establish**:
   - Check that the `Upgrade` header is being properly passed on the API port (15001)
   - Verify timeout settings are appropriate
   - Ensure the Socket.IO client is connecting to the correct port
   - Verify the Socket.IO path is correctly configured in all components

2. **Connections drop after a period of inactivity**:
   - Increase the `timeout tunnel` setting
   - Implement heartbeats in the Socket.IO configuration

3. **Client can't connect to API**:
   - Verify that the client environment variables specify the correct API port:
     ```
     VITE_API_URL=https://yourdomain.com:15001
     VITE_SOCKET_URL=https://yourdomain.com:15001
     ```
   - Check that HAProxy is listening on both ports
   - Ensure SSL certificates are properly configured for both frontends

4. **Load balancing issues**:
   - Verify sticky sessions are working correctly
   - Check that all backend servers are healthy

### Debugging

Enable more verbose logging:

```
global
    log /dev/log local0 debug
    # Other settings...
```

Check HAProxy logs:

```bash
tail -f /var/log/haproxy.log
```

Test WebSocket connections (note the port 15001):

```bash
# Using wscat
wscat -c wss://yourdomain.com:15001/socket.io/?EIO=4&transport=websocket
```

## Security Considerations

1. **TLS Configuration**:
   - Use strong ciphers
   - Disable outdated protocols (SSL, TLS 1.0, TLS 1.1)
   - Regularly update certificates
   - Use the same certificate for both frontends

2. **Rate Limiting**:
   - Add rate limiting to prevent abuse:
   ```
   frontend client_front
       # Rate limiting
       stick-table type ip size 200k expire 30m store http_req_rate(10s)
       http-request deny if { sc_http_req_rate(0) gt 100 }
       # Other settings...
   
   frontend api_front
       # Rate limiting (may need different thresholds for API)
       stick-table type ip size 200k expire 30m store http_req_rate(10s)
       http-request deny if { sc_http_req_rate(0) gt 200 }
       # Other settings...
   ```

3. **Port Security**:
   - Ensure firewall rules only expose the necessary ports (15000, 15001, 8404)
   - Consider restricting admin statistics access:
   ```
   listen stats
       bind *:8404
       stats enable
       stats uri /stats
       stats refresh 10s
       stats admin if LOCALHOST
       stats auth admin:your-secure-password
       acl internal src 10.0.0.0/8 192.168.0.0/16 172.16.0.0/12 127.0.0.0/8
       http-request deny unless internal
   ```

## Environment Variable Configuration

For the dual-port approach to work correctly, your client application must be configured with the correct environment variables:

```
# Production with SSL
VITE_API_URL=https://yourdomain.com:15001
VITE_SOCKET_URL=https://yourdomain.com:15001

# Production without SSL
VITE_API_URL=http://yourdomain.com:15001
VITE_SOCKET_URL=http://yourdomain.com:15001

# Development/local
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

## Benefits of the Dual-Port Approach

1. **Clearer separation of concerns**:
   - Web application traffic is isolated from API/WebSocket traffic
   - Easier to apply different security policies and rate limits to each

2. **More flexible scaling**:
   - Frontend and backend services can be scaled independently
   - Load balancing can be configured differently for each type of traffic

3. **Improved troubleshooting**:
   - Issues with API or WebSockets can be isolated from web application issues
   - Port-specific monitoring is possible

4. **Enhanced security**:
   - Different security policies can be applied to each port
   - API-specific rate limiting without affecting web application traffic

## Conclusion

This HAProxy configuration provides a robust setup for the ShareThings application using a dual-port approach:
- Port 15000 for the web application frontend
- Port 15001 for the API and WebSocket connections

Both frontends use the same SSL certificate for termination, simplifying certificate management while maintaining proper separation of concerns between frontend and backend traffic.

Adjust the settings based on your specific deployment environment and requirements.