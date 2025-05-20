# GitHub Actions Container Analysis

This directory contains the analysis and implementation plan for fixing container crashing issues in GitHub Actions.

## Problem Statement

The ShareThings project is experiencing an issue where containers start successfully but then crash in the GitHub Actions environment. This issue is specific to the `setup-test-install.sh` script, while the `build-and-test.sh` script works correctly.

## Investigation Process

To identify the root cause, we followed a systematic approach:

1. Analyzed the codebase to identify potential issues
2. Ran the test scripts in sequence to observe behavior
3. Identified specific issues causing the problems
4. Created a detailed implementation plan

## Documents in this Directory

### 1. [executive-summary.md](executive-summary.md)

High-level overview of the problem, root causes, and recommendations. Start here for a quick understanding of the issues and proposed solutions.

### 2. [test-results-summary.md](test-results-summary.md)

Detailed results from running the test sequence (`setup-test-install.sh --skip-cleanup` followed by `setup-test-update.sh`). This document identifies the specific issues observed during testing.

### 3. [revised-implementation-plan.md](revised-implementation-plan.md)

Updated implementation plan focusing on the file renaming issue and other key problems. This is the most current plan based on our latest findings.

### 4. [specific-code-changes.md](specific-code-changes.md)

Exact code changes needed to fix the container crashing issues. This document provides diff-style code snippets for each file that needs to be modified.

### 5. [container-logs-issue.md](container-logs-issue.md)

Analysis of the issue with container log directory naming, which could be affecting container behavior in GitHub Actions.

### 6. [log-directory-changes.md](log-directory-changes.md)

Analysis and recommendations for moving log files to the logs directory to keep the root directory clean.

### 7. [final-implementation-plan.md](final-implementation-plan.md)

Original comprehensive implementation plan (superseded by the revised plan).

## Key Findings

After running the test sequence and analyzing the codebase, we identified several issues:

1. **File Renaming Issue**: In setup/operations.sh, the podman-compose.update.yml file is renamed to podman-compose.update.yml.bak at the end of the update process, but it's needed again later in setup-test-update.sh.

2. **Read-Only Volume Mounts**: The `:ro` flags on volume mounts in podman-compose.test.ci.yml prevent containers from writing to these directories.

3. **CI-Specific Code Paths**: The setup-test-install.sh script contains CI-specific code that creates empty directories and uses a CI-specific podman-compose file.

4. **Container Logs Directory Naming Issue**: There's a problem with command substitution in shell scripts, resulting in malformed directory names like `container-logs-++ date +%Y%m%d-%H%M%S`.

5. **Log Files in Root Directory**: Log files are being created directly in the root directory instead of in a logs subfolder.

## Solution Approach

Our solution focuses on creating a unified approach with no special treatment for CI:

1. **Fix the File Renaming Issue**: Keep a copy of the podman-compose.update.yml file instead of renaming it, ensuring it's available when needed

2. **Remove Read-Only Flags**: Edit podman-compose.test.ci.yml to remove the `:ro` flags from volume mounts

3. **Remove CI-Specific Code Paths**: Modify setup-test-install.sh to remove code that creates empty directories and uses a CI-specific podman-compose file

4. **Fix Container Logs Directory Naming**: Use a more robust approach for command substitution to ensure directory names are properly formatted

5. **Move Log Files to logs Directory**: Create a logs directory and move all log files there, with subdirectories as needed

6. **Add Better Debugging**: Add more debugging information to help diagnose any remaining issues

## Implementation Steps

1. Create the `logs` directory and subdirectories in the root folder
2. Make the changes to `setup/containers.sh` to fix the container logs directory naming issue and move logs to the logs directory
3. Make the changes to `setup.sh` to move the debug log to the logs directory
4. Make the changes to `test/setup/setup-test-install.sh` to move the temporary log file to the logs directory
5. Update the `.gitignore` file to ignore the logs directory
6. Make the changes to `setup/operations.sh` to keep a copy of the file instead of renaming it
7. Make the changes to `build/config/podman-compose.test.ci.yml` to remove the `:ro` flags
8. Make the changes to `test/setup/setup-test-install.sh` to remove CI-specific code paths
9. Make the changes to `.github/workflows/share-things-ci-cd.yml` to add debugging information

## Testing

After making these changes, test them by:

1. Running the test sequence locally:
   ```bash
   ./test/setup/setup-test-install.sh --skip-cleanup
   ./test/setup/setup-test-update.sh
   ```

2. Pushing the changes to trigger the GitHub Actions workflow

3. Monitoring the GitHub Actions workflow execution to see if the containers remain running

## Expected Outcome

By implementing these changes, we expect:

1. Consistent behavior between local development and CI environments
2. No special treatment for CI mode
3. Containers to remain running in the GitHub Actions environment
4. Properly formatted container log directory names
5. All log files organized under the logs directory
6. Successful completion of the test scripts

This approach adheres to the principle that setup.sh should behave exactly the same way in all environments, with no special treatment for CI mode.