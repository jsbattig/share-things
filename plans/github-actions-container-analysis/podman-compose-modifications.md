# Podman Compose Modifications Plan

## Issue: Container Crashing After Startup in GitHub Actions

After analyzing the codebase, we've identified that containers are starting successfully but then crashing in the GitHub Actions environment. One potential cause is the read-only (`:ro`) flag on volume mounts in the `podman-compose.test.ci.yml` file, which might prevent the container from writing necessary files during runtime.

## Proposed Solution

Remove the `:ro` (read-only) flags from volume mounts in the `podman-compose.test.ci.yml` file to allow the container to write to these directories if needed during runtime.

### Current Configuration

```yaml
volumes:
  - ./client/dist:/app/public:ro
  - ./client/static-server.js:/app/static-server.js:ro
```

### Modified Configuration

```yaml
volumes:
  - ./client/dist:/app/public
  - ./client/static-server.js:/app/static-server.js
```

## Implementation Steps

1. Edit the `build/config/podman-compose.test.ci.yml` file
2. Remove the `:ro` suffix from both volume mount lines
3. Save the file
4. Run the setup-test-install.sh script again to test the changes

## Expected Outcome

By removing the read-only restrictions, the containers should be able to write to the mounted directories if needed during runtime, potentially resolving the issue where containers start but then crash in the GitHub Actions environment.

## Additional Considerations

- Ensure the `client/dist` directory exists and contains the necessary files before starting containers
- Check that the GitHub Actions runner has appropriate permissions for these directories
- Consider adding more verbose logging to capture any remaining issues

## Next Steps if This Doesn't Resolve the Issue

If removing the read-only flags doesn't resolve the container crashing issue, we should:

1. Add more detailed logging to capture the exact reason for container crashes
2. Examine container logs immediately after crashes
3. Consider modifying the container command to be more resilient to potential issues
4. Investigate potential race conditions between containers