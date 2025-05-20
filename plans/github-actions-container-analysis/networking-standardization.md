# Networking Standardization: Host Networking for All Environments

## Problem

We identified inconsistent networking configurations across different environments:

1. **Main compose file (podman-compose.yml)**: Using host networking
2. **Test compose file (podman-compose.test.yml)**: Using host networking
3. **CI test compose file (podman-compose.test.ci.yml)**: Using bridge networking
4. **Update compose file (podman-compose.update.yml)**: Using bridge networking
5. **Dynamically generated compose file**: Using bridge networking despite comment saying "host networking"

This inconsistency was causing container startup failures in GitHub Actions with the error:
```
Error: rootless netns: create netns: open /run/user/1001/containers/networks/rootless-netns/rootless-netns: file exists
```

## Root Cause Analysis

The error occurs because of limitations with rootless Podman in GitHub Actions when using bridge networking. The containers build successfully but remain in "Created" state (not "Running") because they can't properly initialize their network namespaces.

## Solution

We've standardized all environments to use host networking:

1. **Updated podman-compose.test.ci.yml**:
   - Removed bridge networking configuration
   - Added `network_mode: "host"` to all services
   - Kept the named volume for SQLite data persistence
   - Added `:Z` suffix to volume mounts for SELinux compatibility

2. **Updated podman-compose.update.yml**:
   - Removed bridge networking configuration
   - Added `network_mode: "host"` to all services
   - Removed the networks section

3. **Updated setup/containers.sh**:
   - Modified the dynamically generated compose file to use host networking
   - Removed the networks section
   - Made the comment match the actual implementation

## Benefits

1. **Consistency**: All environments now use the same networking approach
2. **Reliability**: Host networking is more reliable in rootless Podman environments
3. **Simplicity**: Removed unnecessary network configuration
4. **Compatibility**: Works in both local development and CI environments

## Potential Drawbacks

1. **Port Conflicts**: With host networking, container ports are directly exposed on the host, which could lead to port conflicts if multiple instances are running
2. **Security**: Host networking provides less isolation than bridge networking

## Testing

This solution should be tested by:

1. Running the containers in GitHub Actions
2. Verifying that the containers start successfully
3. Checking that SQLite data persists between container restarts
4. Confirming that no networking errors occur in the logs

## Future Considerations

If bridge networking is required in the future for specific use cases, we should:

1. Create a separate compose file specifically for that use case
2. Document the limitations of bridge networking in rootless Podman
3. Consider using Podman in root mode for those specific cases