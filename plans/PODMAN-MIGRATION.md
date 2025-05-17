# Docker to Podman Migration Plan

This document outlines the steps taken to migrate the ShareThings application from Docker to Podman.

## Background

Podman is a daemonless container engine for developing, managing, and running OCI Containers. It provides a Docker-compatible command line interface, making it a suitable replacement for Docker.

## Migration Steps

### 1. Clean Up PostgreSQL Dependencies

The application had leftover references to PostgreSQL in the compiled JavaScript files, which were causing issues when running with Podman. We took the following steps to clean up these dependencies:

1. Identified that the server was trying to import a non-existent `SessionManagerFactory` module that referenced PostgreSQL
2. Updated the `server.ts` file to directly use the in-memory `SessionManager` without any PostgreSQL dependencies
3. Rebuilt the TypeScript code to generate new JavaScript files without PostgreSQL references
4. Verified that the compiled code no longer had references to PostgreSQL

### 2. Container Cleanup

To ensure a clean migration, we performed the following cleanup steps:

1. Stopped all running containers
2. Removed all containers, images, and volumes using `podman system prune -a --volumes -f`
3. Rebuilt the containers from scratch

### 3. Podman Configuration

We created the following Podman configuration files:

1. `podman-compose.yml` - The main Podman Compose file for development
2. `podman-compose.prod.yml` - Podman Compose file for production
3. `podman-compose.test.yml` - Podman Compose file for testing

### 4. Testing

After the migration, we verified that:

1. Both backend and frontend containers start successfully
2. The backend container uses in-memory session storage
3. The API endpoints are accessible
4. The frontend can connect to the backend

## Benefits of Podman

1. **Daemonless Architecture**: Podman doesn't require a daemon to run, which improves security and resource usage
2. **Rootless Containers**: Podman can run containers without root privileges
3. **OCI Compliance**: Podman is fully compliant with OCI standards
4. **Docker Compatibility**: Podman provides a Docker-compatible CLI, making migration easier

## CI/CD Integration

We've updated the CI/CD pipeline to use Podman instead of Docker:

1. Modified GitHub Actions workflow file (`.github/workflows/share-things-ci-cd.yml`):
   - Removed Docker Buildx setup and caching
   - Updated environment debugging to show Podman version information
   - Removed Docker-specific environment variables (DOCKER_BUILDKIT)
   - Added Podman installation verification steps to each job
   - Added `PODMAN_USERNS=keep-id` environment variable to maintain proper user permissions

2. Updated build scripts:
   - Both `build-and-test.sh` and `build-production.sh` now check for Podman and Podman Compose
   - Scripts use Podman commands instead of Docker commands
   - Container verification is compatible with Podman's output format

3. Self-hosted Runner Configuration:
   - All jobs run on self-hosted runners with Rocky Linux
   - Runners must have Podman and Podman Compose installed
   - No Docker daemon is required on the runners
   - Proper permissions must be configured for the runner user to use Podman
   - The workflow verifies Podman installation before proceeding with each job
   - See [GitHub Actions Podman Setup](github-actions-podman-setup.md) for detailed instructions

## Next Steps

1. ✅ Update CI/CD pipelines to use Podman instead of Docker
2. Update documentation to reflect the use of Podman
3. Train team members on Podman-specific features and commands
4. Consider implementing Podman-specific optimizations