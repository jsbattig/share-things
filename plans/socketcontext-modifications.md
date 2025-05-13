# SocketContext.tsx Modifications for Auto Hostname Detection

## Current Implementation

The current implementation in SocketContext.tsx has a `getBackendUrl()` function that:

1. First checks if the environment variable VITE_SOCKET_URL is set, and uses it if available
2. Otherwise, derives the backend URL from the current window location

```typescript
// Dynamically determine the backend URL based on the current window location
const getBackendUrl = () => {
  // If an environment variable is set, use it
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  
  // Otherwise, derive from the current URL
  const currentUrl = new URL(window.location.href);
  // Use the same hostname but with port 3001
  return `${currentUrl.protocol}//${currentUrl.hostname}:3001`;
};
```

## Proposed Changes

We'll modify the `getBackendUrl()` function to:

1. Check if the environment variable is set to a specific value (not 'auto')
2. If it's set to 'auto' or not set at all, use auto-detection
3. Add better handling for different port scenarios
4. Add more detailed logging

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

## Implementation Steps

1. Locate the `getBackendUrl()` function in SocketContext.tsx
2. Replace it with the updated version
3. Add the VITE_API_PORT environment variable to the client's .env.example file
4. Update any related code that might be affected by this change

## Testing

1. Test with environment variable set to a specific URL
2. Test with environment variable set to 'auto'
3. Test with environment variable not set
4. Test with different port scenarios:
   - Standard ports (80/443)
   - Custom ports
   - Different protocols (http/https)

## Edge Cases to Consider

1. **Proxied Environments**: When the application is behind a proxy, the hostname might be different from what the client sees
2. **Custom Port Configurations**: When using custom ports, ensure the correct port is used for the API
3. **HTTPS**: Ensure the protocol is correctly determined when using HTTPS
4. **Development vs. Production**: Ensure the function works correctly in both development and production environments

## Benefits

1. **Automatic Adaptation**: The application will automatically adapt to different environments
2. **Flexibility**: Manual configuration is still available when needed
3. **Better Debugging**: Improved logging helps with troubleshooting
4. **Simplified Setup**: Users don't need to manually configure the hostname in most cases