# Executive Summary: GitHub Actions Container Issues

## Problem Overview

The ShareThings project is experiencing an issue where containers start successfully but then crash in the GitHub Actions environment. This issue is specific to the `setup-test-install.sh` script, while the `build-and-test.sh` script works correctly.

## Root Cause Analysis

After a thorough analysis of the codebase, we've identified several potential causes:

1. **Read-Only Volume Mounts**: The volume mounts in `podman-compose.test.ci.yml` are configured with the `:ro` (read-only) flag, which prevents the container from writing to these directories during runtime.

2. **Permission Issues**: The GitHub Actions runner may have different permissions for the mounted files compared to local development environments.

3. **Missing Build Artifacts**: The `client/dist` directory might not contain the necessary files when the container starts.

4. **Container Configuration Differences**: The working script uses a different approach to container creation and configuration compared to the failing script.

## Primary Recommendation

**Remove the `:ro` (read-only) flags from volume mounts** in the `podman-compose.test.ci.yml` file to allow the container to write to these directories if needed during runtime.

This simple change addresses the most likely cause of the container crashes and should be implemented first.

## Implementation Plan

We've created three documents to guide the implementation:

1. **[podman-compose-modifications.md](podman-compose-modifications.md)**: Specific changes needed for the `podman-compose.test.ci.yml` file.

2. **[github-actions-container-analysis.md](github-actions-container-analysis.md)**: Detailed analysis of the issues and potential solutions.

3. **[implementation-plan.md](implementation-plan.md)**: Step-by-step guide for implementing all recommended changes.

## Expected Outcome

By implementing these changes, we expect:

1. Containers to start and remain running in the GitHub Actions environment
2. Successful completion of the `setup-test-install.sh` script
3. Consistent behavior between local development and CI environments

## Next Steps

1. Implement the changes outlined in the implementation plan
2. Test the changes by triggering the GitHub Actions workflow
3. Monitor the results and collect logs if issues persist
4. If needed, implement the additional recommendations in the implementation plan

## Additional Considerations

- The registry URL `linner.ddns.net:4443/docker.io.proxy` is intentionally used for caching Docker Hub requests to avoid rate limiting and should be maintained.
- SELinux is already set to permissive, which should be sufficient for container operations.
- If the initial changes don't resolve the issue, the additional logging steps will help identify the exact cause of the container crashes.