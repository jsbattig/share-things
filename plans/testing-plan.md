# Testing Plan for Auto Hostname Detection

## Overview

This testing plan outlines the steps to verify that the auto hostname detection feature works correctly in various scenarios.

## Unit Testing

### SocketContext.tsx

1. Test the `getBackendUrl()` function with different scenarios:
   - Environment variable set to a specific URL
   - Environment variable set to 'auto'
   - Environment variable not set
   - Different port scenarios (standard ports, custom ports)
   - Different protocols (http/https)

2. Create test cases:
   ```typescript
   describe('getBackendUrl', () => {
     it('should use environment variable when set to a specific URL', () => {
       // Mock environment variable
       window.env = { VITE_SOCKET_URL: 'http://example.com:3001' };
       
       // Call function
       const result = getBackendUrl();
       
       // Assert result
       expect(result).toBe('http://example.com:3001');
     });
     
     it('should use auto-detection when environment variable is set to auto', () => {
       // Mock environment variable and window.location
       window.env = { VITE_SOCKET_URL: 'auto' };
       window.location.href = 'http://localhost:8080';
       
       // Call function
       const result = getBackendUrl();
       
       // Assert result
       expect(result).toBe('http://localhost:3001');
     });
     
     // Additional test cases...
   });
   ```

### Server CORS Configuration

1. Test the CORS configuration with different scenarios:
   - CORS_ORIGIN set to '*'
   - CORS_ORIGIN set to a specific value
   - CORS_ORIGIN set to multiple values
   - Different client origins

2. Create test cases:
   ```typescript
   describe('CORS Configuration', () => {
     it('should allow all origins when CORS_ORIGIN is *', () => {
       // Mock environment variable
       process.env.CORS_ORIGIN = '*';
       
       // Mock request with origin
       const req = { headers: { origin: 'http://example.com' } };
       
       // Mock callback
       const callback = jest.fn();
       
       // Call function
       corsOptions.origin(req.headers.origin, callback);
       
       // Assert callback was called with true
       expect(callback).toHaveBeenCalledWith(null, true);
     });
     
     // Additional test cases...
   });
   ```

## Integration Testing

### Setup Script

1. Test the setup.sh script with different scenarios:
   - No hostname provided (should use auto-detection)
   - Hostname provided (should use the provided hostname)
   - Custom ports (should correctly configure the ports)
   - HTTPS (should correctly configure the protocol)

2. Create test cases:
   ```bash
   # Test with no hostname
   echo "" | ./setup.sh
   # Verify .env files contain 'auto'
   
   # Test with hostname
   echo "example.com" | ./setup.sh
   # Verify .env files contain 'example.com'
   
   # Test with custom ports
   echo -e "example.com\ny\n15000\n15001\nn" | ./setup.sh
   # Verify .env files contain correct ports
   
   # Test with HTTPS
   echo -e "example.com\nn\ny" | ./setup.sh
   # Verify .env files contain 'https://'
   ```

### End-to-End Testing

1. Test the application in different deployment scenarios:
   - Local development with auto-detection
   - Local development with manual hostname
   - Production with auto-detection
   - Production with manual hostname
   - Custom ports with auto-detection
   - Custom ports with manual hostname
   - HTTPS with auto-detection
   - HTTPS with manual hostname

2. Create test cases:
   ```
   # Test local development with auto-detection
   1. Run setup.sh with no hostname
   2. Start the application
   3. Verify the application correctly determines the hostname
   
   # Test local development with manual hostname
   1. Run setup.sh with hostname 'localhost'
   2. Start the application
   3. Verify the application uses 'localhost'
   
   # Additional test cases...
   ```

## Automated Testing

1. Run the build-and-test.sh script to verify all unit, functional, and integration tests pass:
   ```bash
   ./build-and-test.sh
   ```

2. Run the build-production.sh script to ensure the production build works correctly:
   ```bash
   ./build-production.sh
   ```

## Manual Verification

1. Verify the application works correctly in a browser:
   - Open the application in a browser
   - Check the console logs to verify the backend URL is correctly determined
   - Verify API requests and WebSocket connections work correctly

2. Verify the application works with different hostnames:
   - localhost
   - IP address
   - Domain name

3. Verify the application works with different port configurations:
   - Standard ports (80/443)
   - Custom ports

4. Verify the application works with different protocols:
   - HTTP
   - HTTPS

## Regression Testing

1. Verify existing functionality still works:
   - Content sharing
   - WebSocket connections
   - API requests
   - CORS handling

## Documentation

1. Update documentation to reflect the new auto-detection feature:
   - README.md
   - DOCKER.md
   - Any other relevant documentation

## Conclusion

This testing plan provides a comprehensive approach to verify that the auto hostname detection feature works correctly in various scenarios. By following this plan, we can ensure that the feature is reliable, secure, and compatible with existing deployment scenarios.