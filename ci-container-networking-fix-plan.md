# Container Networking Fix

## Problem

We were encountering issues with the rootless network namespace when using bridge networking with Podman. The specific error was:

```
time="2025-05-19T15:33:49-05:00" level=error msg="Unable to clean up network for container 21235eb01cf17f8d4fa25d74cb14675b82ffc8e8a0327e3d813e60fec6496ee8: \"rootless netns: create netns: open /run/user/1001/containers/networks/rootless-netns/rootless-netns: file exists\""
```

This issue was preventing the containers from starting properly, particularly in CI environments.

## Solution

The solution was to use host networking instead of bridge networking for all environments. Host networking allows the containers to share the host's network namespace, which avoids the issues with the rootless network namespace.

### Changes Made

1. Modified `setup/containers.sh` to always use host networking:
   - Removed conditional logic based on CI environment variable
   - Used `network_mode: "host"` for all containers in all environments
   - Configured nginx to listen on port 15000 instead of the default port 80 when using host networking

2. Updated all podman-compose configuration files to use host networking:
   - Updated `build/config/podman-compose.test.yml`
   - Updated `build/config/podman-compose.test.ci.yml`
   - Ensured `build/config/podman-compose.yml` uses host networking

3. Fixed YAML syntax issues with the command field in the frontend service:
   - Used YAML's multi-line string format for complex commands
   - Properly escaped quotes in the JSON strings

## Implementation Details

### Host Networking Configuration

When using host networking, the containers share the host's network namespace, which means they use the host's network interfaces directly. This avoids the need for port mapping, but it also means that the containers need to be configured to listen on different ports to avoid conflicts.

For the frontend container, we configured nginx to listen on port 15000 instead of the default port 80. This was done by creating a custom nginx configuration file at runtime using a command in the container.

### Consistent Configuration

By using the same networking model across all environments, we ensure consistent behavior and avoid environment-specific issues. This simplifies testing and deployment, as the same configuration works everywhere.

## Testing

The changes were tested by running the setup script:

```bash
./test/setup/setup-test-install.sh
```

This verifies that the containers start properly with host networking in all environments.

## Benefits

1. Simplified configuration - one networking model for all environments
2. Eliminated environment-specific behavior
3. Resolved rootless network namespace issues
4. Improved reliability of container startup