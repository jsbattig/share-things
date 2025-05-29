# API Routes

## Overview

ShareThings provides a set of HTTP API endpoints for session management and system information. This document details the available endpoints, request formats, and response structures, as well as how these endpoints are accessed in different deployment environments.

## API Endpoints

All API endpoints are prefixed with `/api`.

### GET /api/sessions

Returns information about active sessions.

**Response:**
```json
{
  "message": "This endpoint would return active sessions",
  "note": "For security reasons, this is just a placeholder"
}
```

**Notes:**
- This endpoint is currently a placeholder and does not return actual session data
- In a future implementation, this endpoint would return sessions the authenticated user has access to
- Authentication would be required to access this endpoint

### GET /api/version

Returns the version of the application and the current environment.

**Response:**
```json
{
  "version": "0.1.0",
  "environment": "development"
}
```

**Notes:**
- The version is determined from the `npm_package_version` environment variable
- The environment is determined from the `NODE_ENV` environment variable

## Health Check Endpoint

### GET /health

Returns a 200 OK response with the text "OK" if the server is running.

**Response:**
```
OK
```

**Notes:**
- This endpoint is used by HAProxy and other monitoring tools to check if the server is running
- It does not require authentication
- It is not prefixed with `/api`

## Error Handling

The API includes error handling middleware:

### 404 Handler

Returns a 404 Not Found response for any route that doesn't exist.

**Response:**
```json
{
  "error": "Not found"
}
```

### 500 Handler

Returns a 500 Internal Server Error response for any unhandled errors.

**Response:**
```json
{
  "error": "Internal server error"
}
```

## API Access in Different Environments

The API endpoints are accessed differently depending on the deployment environment:

### Development Environment

In development, the client directly accesses the API endpoints on the backend server:

```
http://localhost:3001/api/sessions
http://localhost:3001/api/version
http://localhost:3001/health
```

The port (3001) can be configured using the `PORT` environment variable on the server and the `VITE_API_PORT` environment variable on the client.

### Production with HAProxy

In production with HAProxy, the client accesses the API endpoints through HAProxy's `api_front` on port 15001:

```
https://yourdomain.com:15001/api/sessions
https://yourdomain.com:15001/api/version
https://yourdomain.com:15001/health
```

HAProxy routes these requests directly to the backend container on port 3001.

### Production with Podman Containers

In production with Podman containers, the client accesses the API endpoints through the frontend container:

```
https://yourdomain.com/api/sessions
https://yourdomain.com/api/version
https://yourdomain.com/health
```

Nginx proxies these requests to the backend container on port 3001.

## API Implementation

The API routes are implemented in `routes/index.ts`:

```typescript
export function setupRoutes(app: Express): void {
  // API routes
  app.use('/api', apiRoutes());
  
  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });
  
  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Error handler
  app.use((err: Error, req: Request, res: Response, next: Function) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
}

function apiRoutes() {
  const router = require('express').Router();
  
  // Session endpoints
  router.get('/sessions', (req: Request, res: Response) => {
    res.json({ 
      message: 'This endpoint would return active sessions',
      note: 'For security reasons, this is just a placeholder'
    });
  });
  
  // Version endpoint
  router.get('/version', (req: Request, res: Response) => {
    res.json({ 
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  return router;
}
```

## Future API Endpoints

The following API endpoints are planned for future implementation:

### POST /api/sessions

Creates a new session.

**Request:**
```json
{
  "sessionId": "session-123",
  "clientName": "John Doe",
  "fingerprint": {
    "iv": [1, 2, 3, ...],
    "data": [4, 5, 6, ...]
  }
}
```

**Response:**
```json
{
  "success": true,
  "token": "session-token-123"
}
```

### GET /api/sessions/:sessionId

Returns information about a specific session.

**Response:**
```json
{
  "sessionId": "session-123",
  "clients": [
    {
      "id": "client-456",
      "name": "John Doe"
    },
    {
      "id": "client-789",
      "name": "Jane Smith"
    }
  ],
  "createdAt": "2023-01-01T00:00:00.000Z",
  "lastActivity": "2023-01-01T01:00:00.000Z"
}
```

### DELETE /api/sessions/:sessionId

Deletes a session.

**Response:**
```json
{
  "success": true
}
```

## Security Considerations

1. **Authentication**: Future implementations should include authentication for API endpoints
2. **Rate Limiting**: API endpoints should be rate-limited to prevent abuse
3. **Input Validation**: All input should be validated to prevent injection attacks
4. **CORS**: CORS should be properly configured to allow requests only from trusted origins