# Executive Summary: GitHub Actions Container Issues

## Problem Overview

The ShareThings project is experiencing an issue where containers start successfully but then crash in the GitHub Actions environment. This issue is specific to the `setup-test-install.sh` script, while the `build-and-test.sh` script works correctly.

## Investigation Process

To identify the root cause, we followed a systematic approach:

1. **Code Analysis**: Examined the codebase to identify potential issues
2. **Test Execution**: Ran the test scripts in sequence to observe behavior
3. **Issue Identification**: Identified specific issues causing the problems
4. **Solution Development**: Created a detailed implementation plan

## Key Findings

After running the test sequence (`setup-test-install.sh --skip-cleanup` followed by `setup-test-update.sh`), we identified several issues:

1. **File Renaming Issue**: In setup/operations.sh, the podman-compose.update.yml file is renamed to podman-compose.update.yml.bak at the end of the update process, but it's needed again later in setup-test-update.sh.

2. **Read-Only Volume Mounts**: The `:ro` flags on volume mounts in podman-compose.test.ci.yml prevent containers from writing to these directories.

3. **CI-Specific Code Paths**: The setup-test-install.sh script contains CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

4. **Container Logs Directory Naming Issue**: There's a problem with command substitution in shell scripts, resulting in malformed directory names like `container-logs-++ date +%Y%m%d-%H%M%S`.

5. **Log Files in Root Directory**: Log files are being created directly in the root directory instead of in a logs subfolder.

## Root Cause

The root cause appears to be a combination of these issues:

1. The CI-specific code in `setup-test-install.sh` creates an empty `client/dist` directory with just a health check endpoint
2. The CI-specific podman-compose file mounts this empty directory as a volume with the `:ro` flag
3. When the container tries to write to this directory, it fails because of the read-only flag
4. During the update process, the podman-compose.update.yml file is renamed to .bak, making it unavailable when needed later
5. The command substitution issue with container log directories could be causing path resolution problems
6. Log files scattered throughout the root directory make it difficult to track and manage logs

## Solution Approach

Our solution focuses on creating a unified approach with no special treatment for CI:

1. **Fix the File Renaming Issue**: Keep a copy of the podman-compose.update.yml file instead of renaming it, ensuring it's available when needed

2. **Remove Read-Only Flags**: Edit podman-compose.test.ci.yml to remove the `:ro` flags from volume mounts

3. **Remove CI-Specific Code Paths**: Modify setup-test-install.sh to remove code that creates empty directories and uses a CI-specific podman-compose file

4. **Fix Container Logs Directory Naming**: Use a more robust approach for command substitution to ensure directory names are properly formatted

5. **Move Log Files to logs Directory**: Create a logs directory and move all log files there, with subdirectories as needed

6. **Add Better Debugging**: Add more debugging information to help diagnose any remaining issues

## Implementation Plan

A detailed implementation plan is provided in [revised-implementation-plan.md](revised-implementation-plan.md), which includes:

- Specific code changes for each component
- Testing steps to verify the changes
- Expected outcomes

## Expected Outcome

By implementing these changes, we expect:

1. The podman-compose.update.yml file to remain available when needed
2. Containers to have write access to mounted directories
3. No CI-specific code paths that create different behavior between environments
4. Properly formatted container log directory names
5. All log files organized under the logs directory
6. Better debugging information to help diagnose any remaining issues

This approach adheres to the principle that setup.sh should behave exactly the same way in all environments, with no special treatment for CI mode.