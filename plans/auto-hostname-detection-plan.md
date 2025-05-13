# Auto Hostname Detection Implementation Plan

## Overview

This plan outlines the changes needed to make the ShareThings application automatically determine the hostname without requiring user input, while still allowing manual hostname configuration as an optional override.

## Current Implementation

1. The setup.sh script currently requires users to enter a hostname
2. The client code (SocketContext.tsx) has auto-detection capability but only uses it as a fallback
3. Environment variables are set during build time and take precedence over auto-detection

## Proposed Changes

### 1. Client-Side Changes (SocketContext.tsx)

Update the `getBackendUrl()` function to prioritize auto-detection while still respecting environment variables if explicitly set:

```typescript
// Dynamically determine the backend URL based on the current window location
const getBackendUrl = () => {
  // If an environment variable is set to a specific value (not 'auto'), use it
  if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL !== 'auto') {
    return import.meta.env.VITE_SOCKET_URL;
  }
  
  // Otherwise, derive from the current URL
  const currentUrl = new URL(window.location.href);
  
  // Determine the appropriate port based on the current URL and context
  let port = '3001'; // Default API port
  
  // If we're on a non-standard port, we might be behind a proxy that's routing based on path
  if (currentUrl.port && currentUrl.port !== '80' && currentUrl.port !== '443') {
    // We're on a custom port, so we might be using the same port for API
    // Check if we have an environment variable that specifies a different port
    if (import.meta.env.VITE_API_PORT) {
      port = import.meta.env.VITE_API_PORT;
    }
  }
  
  // Construct the backend URL
  const backendUrl = `${currentUrl.protocol}//${currentUrl.hostname}${port ? ':' + port : ''}`;
  console.log(`[Socket] Automatically determined backend URL: ${backendUrl}`);
  
  return backendUrl;
};
```

### 2. Setup Script Changes (setup.sh)

Modify the hostname prompt section to make it optional:

```bash
# Hostname Configuration with explanation
echo -e "${BLUE}=== Hostname Configuration ===${NC}"
echo "The hostname can be provided manually or automatically determined at runtime."
echo ""
echo "1. If you provide a hostname, it will be used for all configurations"
echo "2. If you leave it blank, the application will auto-detect the hostname"
echo ""
echo "Use cases for different hostname values:"
echo "- 'localhost': For local development only"
echo "- IP address: For accessing from other machines on your network"
echo "- Domain name: For production deployments with a real domain"
echo "- Leave blank: For automatic detection (recommended)"
echo ""
read -p "Enter your hostname (or leave blank for auto-detection): " HOSTNAME

if [ -z "$HOSTNAME" ]; then
    echo -e "${GREEN}Using automatic hostname detection${NC}"
    HOSTNAME="auto"
else
    echo -e "${GREEN}Using hostname: ${HOSTNAME}${NC}"
fi
```

Update the environment variable configuration sections to handle the 'auto' value:

```bash
# Update .env file
if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|API_URL=http://localhost|API_URL=auto|g" .env
    $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=auto|g" .env
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" .env
else
    # Original behavior for manual hostname
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" .env
    else
        $SED_CMD "s|API_URL=http://localhost|API_URL=${PROTOCOL}://${HOSTNAME}|g" .env
        $SED_CMD "s|SOCKET_URL=http://localhost|SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" .env
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" .env
    fi
fi

# Update client/.env file
if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=auto|g" client/.env
    $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=auto|g" client/.env
else
    # Original behavior for manual hostname
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}:${API_PORT}|g" client/.env
    else
        $SED_CMD "s|VITE_API_URL=http://localhost|VITE_API_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
        $SED_CMD "s|VITE_SOCKET_URL=http://localhost|VITE_SOCKET_URL=${PROTOCOL}://${HOSTNAME}|g" client/.env
    fi
fi

# Update server/.env file
if [ "$HOSTNAME" = "auto" ]; then
    $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=*|g" server/.env
else
    # Original behavior for manual hostname
    if [[ $USE_CUSTOM_PORTS =~ ^[Yy]$ ]]; then
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}:${CLIENT_PORT}|g" server/.env
    else
        $SED_CMD "s|CORS_ORIGIN=http://localhost|CORS_ORIGIN=${PROTOCOL}://${HOSTNAME}|g" server/.env
    fi
fi
```

### 3. Server-Side Changes

Update the server's CORS configuration to handle wildcard origins or dynamically determine allowed origins:

```typescript
// In server/src/server.ts or similar file
app.use(cors({
  origin: (origin, callback) => {
    // If CORS_ORIGIN is set to *, allow all origins
    if (process.env.CORS_ORIGIN === '*') {
      callback(null, true);
      return;
    }
    
    // Otherwise, use the configured CORS_ORIGIN
    const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

## Testing Plan

### 1. Unit Testing

1. Create unit tests for the updated `getBackendUrl()` function
2. Test with different URL scenarios:
   - Standard ports (80/443)
   - Custom ports
   - Different protocols (http/https)
   - With and without environment variables

### 2. Integration Testing

1. Test the application with the updated setup.sh script
2. Verify that the application correctly determines the hostname when no input is provided
3. Verify that the application uses the provided hostname when one is entered
4. Test with different deployment scenarios:
   - Local development
   - Production with standard ports
   - Production with custom ports

### 3. Automated Testing

1. Run the build-and-test.sh script to verify all unit, functional, and integration tests pass
2. Run the build-production.sh script to ensure the production build works correctly

## Implementation Steps

1. Update the SocketContext.tsx file
2. Update the setup.sh script
3. Update the server's CORS configuration
4. Run unit tests
5. Run integration tests
6. Run the build-and-test.sh script
7. Run the build-production.sh script
8. Manually verify the application works in different deployment scenarios

## Potential Challenges and Mitigations

### 1. CORS Issues

**Challenge**: The server needs to know allowed CORS origins for security.

**Mitigation**: Update the server to dynamically determine allowed origins based on the request origin, or use a wildcard for development environments.

### 2. WebSocket Connection Issues

**Challenge**: WebSocket connections require full URLs.

**Mitigation**: Ensure the WebSocket connection URL is correctly determined at runtime.

### 3. HAProxy Configuration

**Challenge**: HAProxy configuration may need adjustments to work with auto-detection.

**Mitigation**: Update the HAProxy configuration to handle requests properly regardless of the hostname.

## Benefits of this Approach

1. **Simplified Setup**: Users can choose auto-detection for a simpler experience
2. **Flexibility**: Manual hostname configuration is still available for specific use cases
3. **Automatic Adaptation**: The application will automatically adapt to different environments
4. **Reduced Configuration Errors**: Eliminates potential errors from mistyped hostnames
5. **Better User Experience**: Makes the setup process more streamlined and user-friendly

## Conclusion

This implementation plan provides a balanced approach that makes hostname configuration optional while prioritizing auto-detection. It maintains compatibility with existing deployment scenarios while simplifying the default experience.