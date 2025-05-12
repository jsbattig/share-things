# HAProxy Configuration for ShareThings

This document provides detailed instructions for configuring HAProxy to work with the ShareThings application, with special attention to WebSocket support.

## Overview

HAProxy will be used for:
1. SSL termination
2. WebSocket proxying
3. Load balancing (if multiple backend servers are used)
4. Session persistence

## Basic HAProxy Configuration

Here's a complete configuration example for HAProxy with ShareThings:

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
    
    # Route all traffic to backend
    default_backend sharethings_back

backend sharethings_back
    balance roundrobin
    option httpchk GET /health
    
    # WebSocket handling
    option http-server-close
    http-reuse safe
    
    # Sticky sessions
    stick-table type ip size 200k expire 30m
    stick on src
    
    # Server definition
    server sharethings_1 127.0.0.1:3000 check inter 2000 rise 3 fall 3 maxconn 1000
```

## HAProxy WebSocket Configuration

WebSocket connections require special handling in HAProxy because they:
1. Start as HTTP connections and then upgrade to the WebSocket protocol
2. Remain open for long periods, requiring different timeout settings
3. Need proper header handling for the upgrade process

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

### Frontend Section

The frontend section needs to detect WebSocket connections and handle them appropriately:

```
frontend https_front
    # Binding configuration
    bind *:443 ssl crt /etc/ssl/private/combined-cert.pem
    
    # Forward client IP
    option forwardfor
    
    # Set X-Forwarded-Proto header
    http-request set-header X-Forwarded-Proto https
    
    # WebSocket detection - CRITICAL for WebSocket support
    # These ACLs identify WebSocket connection requests
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_websocket hdr_beg(Host) -i ws
    acl is_websocket path_beg /socket.io/
    
    # If using Socket.IO, add specific path detection
    acl is_socketio path_beg /socket.io/
    
    # Special handling for WebSocket connections
    # This ensures the Upgrade header is properly passed to the backend
    use_backend sharethings_back if is_websocket
    
    # Default backend for non-WebSocket traffic
    default_backend sharethings_back
```

### Backend Section

The backend section needs specific options for WebSocket handling:

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
    # Increase inter (check interval) for production
    server sharethings_1 127.0.0.1:3000 check inter 2000 rise 3 fall 3 maxconn 1000
    
    # If you have multiple backend servers
    # server sharethings_2 127.0.0.1:3001 check inter 2000 rise 3 fall 3 maxconn 1000
```

## Socket.IO Path Configuration

The "path configuration" refers to the URL path that Socket.IO uses for its connections. This is a critical configuration point that must be consistent across three components:

1. Socket.IO server
2. Socket.IO client
3. HAProxy configuration

### What is the Socket.IO Path?

The Socket.IO path is the base URL path that Socket.IO uses for all its HTTP/WebSocket communications. By default, Socket.IO uses `/socket.io/` as its path. This means all Socket.IO traffic will use URLs that start with this prefix, such as:

- `/socket.io/?EIO=4&transport=polling` (for HTTP long-polling)
- `/socket.io/?EIO=4&transport=websocket` (for WebSocket connections)
- `/socket.io/[namespace]/` (for specific namespaces)

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
server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
```

### Configuring the Path in Socket.IO Client

On the client side, you must use the same path when connecting:

```javascript
// Using default path
const socket = io({
  // Default path is '/socket.io/', so no need to specify
});

// OR using custom path (must match server)
const socket = io({
  path: '/ws/',  // Must match the server configuration
});
```

### Configuring HAProxy to Match Socket.IO Path

In your HAProxy configuration, you need to create ACLs (Access Control Lists) that match the Socket.IO path pattern:

```
frontend https_front
    # Other frontend settings...
    
    # ACL to detect Socket.IO traffic
    acl is_socketio path_beg /socket.io/
    
    # ACL to detect WebSocket upgrade requests for Socket.IO
    acl is_websocket hdr(Upgrade) -i WebSocket
    acl is_socketio_ws path_beg /socket.io/ hdr(Upgrade) -i WebSocket
    
    # You can use these ACLs for specific routing or handling
    use_backend socketio_backend if is_socketio
    
    # Or include them in your default backend routing
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

3. Update your HAProxy configuration to use the combined certificate:

```
frontend https_front
    bind *:443 ssl crt /etc/ssl/private/combined-cert.pem
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
    server sharethings_1 10.0.0.1:3000 check inter 2000 rise 3 fall 3 maxconn 1000
    server sharethings_2 10.0.0.2:3000 check inter 2000 rise 3 fall 3 maxconn 1000
    server sharethings_3 10.0.0.3:3000 check inter 2000 rise 3 fall 3 maxconn 1000
```

## Troubleshooting

### Common Issues

1. **WebSocket connections fail to establish**:
   - Check that the `Upgrade` header is being properly passed
   - Verify timeout settings are appropriate
   - Ensure the Socket.IO path is correctly configured in all components

2. **Connections drop after a period of inactivity**:
   - Increase the `timeout tunnel` setting
   - Implement heartbeats in the Socket.IO configuration

3. **Load balancing issues**:
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

Test WebSocket connections:

```bash
# Using wscat
wscat -c wss://yourdomain.com/socket.io/?EIO=4&transport=websocket
```

## Security Considerations

1. **TLS Configuration**:
   - Use strong ciphers
   - Disable outdated protocols (SSL, TLS 1.0, TLS 1.1)
   - Regularly update certificates

2. **Rate Limiting**:
   - Add rate limiting to prevent abuse:
   ```
   frontend https_front
       # Rate limiting
       stick-table type ip size 200k expire 30m store http_req_rate(10s)
       http-request deny if { sc_http_req_rate(0) gt 100 }
       # Other settings...
   ```

3. **Access Control**:
   - Restrict access to sensitive endpoints:
   ```
   frontend https_front
       # Block access to admin endpoints
       acl is_admin path_beg /admin
       http-request deny if is_admin !{ src 10.0.0.0/24 }
       # Other settings...
   ```

## Conclusion

This HAProxy configuration provides a robust setup for the ShareThings application, with proper handling of WebSocket connections and Socket.IO traffic. Adjust the settings based on your specific deployment environment and requirements.