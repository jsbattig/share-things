# Docker Registry Configuration

## Overview

This document outlines the Docker registry configuration for the ShareThings project, including registry requirements and best practices.

## Registry Requirements

### Approved Registry

For all ShareThings deployments, the **only** approved Docker registry is:

```
linner.ddns.net:4443/docker.io.proxy
```

### Registry Usage

All Dockerfiles and container configurations MUST use the approved registry for pulling base images. For example:

```dockerfile
# CORRECT - Using the approved registry
FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine

# INCORRECT - NEVER use Docker Hub directly
FROM docker.io/node:18-alpine
# OR
FROM node:18-alpine
```

### Rationale

Using the approved registry provides several benefits:

1. **Consistent Image Availability**: The approved registry ensures all required images are available in both local and CI environments
2. **Security**: Images in the approved registry have been scanned for vulnerabilities
3. **Performance**: The approved registry caches images, reducing build times and external bandwidth usage
4. **Reliability**: Reduces dependency on external services during builds and deployments

## Implementation

### Dockerfile Configuration

All Dockerfiles should specify the full registry path:

```dockerfile
FROM linner.ddns.net:4443/docker.io.proxy/node:18-alpine
```

### Docker Compose Configuration

Docker Compose files should also use the full registry path for any images:

```yaml
services:
  frontend:
    image: linner.ddns.net:4443/docker.io.proxy/nginx:alpine
    # ...
  
  backend:
    image: linner.ddns.net:4443/docker.io.proxy/node:18-alpine
    # ...
```

## CI/CD Considerations

The CI/CD pipeline is configured to access the approved registry. No additional configuration is needed in GitHub Actions or other CI environments, as the registry is accessible both internally and externally.

## Troubleshooting

If you encounter issues with the registry:

1. **Connection Issues**: Ensure your network can reach the registry at linner.ddns.net:4443
2. **Authentication Issues**: Contact the infrastructure team if you need registry credentials
3. **Missing Images**: If an image is not available in the registry, request it to be added rather than using Docker Hub directly

## Important Note

**NEVER use docker.io directly** in any Dockerfile, Docker Compose file, or script in this project. Always use the approved registry.