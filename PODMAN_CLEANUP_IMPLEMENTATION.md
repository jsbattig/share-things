# Podman Cleanup and State Reset Implementation

## Overview
This document describes the comprehensive Podman cleanup and state reset implementation applied to resolve CI/CD pipeline issues caused by Podman state corruption.

## Problem Solved
The CI/CD pipeline was failing with the error:
```
"invalid internal status, try resetting the pause process with \"podman system migrate\": could not find any running process: no such process"
```

This error occurs when Podman's internal state becomes corrupted in CI/CD environments, typically due to:
- Process cleanup by CI/CD runners
- Rootless Podman complexity in automated environments
- Resource constraints causing unexpected process termination

## Solution Implemented

### 1. Created Centralized Cleanup Functions (`setup/podman-cleanup.sh`)

**Three main functions:**

#### `podman_hard_cleanup_and_reset()`
- **Purpose**: Comprehensive cleanup for CI/CD environments
- **Actions**:
  - Force stops and removes all containers
  - Removes all images
  - Cleans up networks and volumes
  - Performs system prune
  - Resets Podman state (`podman system migrate` and `podman system reset`)
  - Cleans up storage directories
  - Restarts Podman service
  - Verifies functionality

#### `podman_light_cleanup_and_reset()`
- **Purpose**: Less aggressive cleanup for normal operations
- **Actions**:
  - Resets Podman state first
  - Cleans up dangling resources only
  - Restarts Podman service
  - Falls back to hard cleanup if issues persist

#### `podman_pre_operation_check()`
- **Purpose**: Pre-operation verification and cleanup
- **Actions**:
  - Checks if Podman is working
  - Performs light cleanup if needed
  - Ensures Podman is ready for operations

### 2. Applied Cleanup Functions to Key Scripts

#### Modified Scripts:
1. **`setup.sh`** - Added pre-operation check at startup
2. **`setup/containers.sh`** - Added pre-operation checks to all major functions
3. **`setup/common.sh`** - Replaced manual Podman checks with centralized function
4. **`build/scripts/build-and-test.sh`** - Added hard cleanup for CI/CD reliability
5. **`test/setup/setup-test-install.sh`** - Added hard cleanup before installation
6. **`test/setup/setup-test-update.sh`** - Added pre-operation check

#### Integration Points:
- **Before container operations**: `podman_pre_operation_check()`
- **CI/CD environments**: `podman_hard_cleanup_and_reset()`
- **Normal operations**: `podman_light_cleanup_and_reset()`

## Benefits

### 1. **Reliability**
- Eliminates Podman state corruption issues
- Provides consistent starting state for all operations
- Handles CI/CD environment quirks automatically

### 2. **Maintainability**
- Centralized cleanup logic (DRY principle)
- Consistent error handling across all scripts
- Easy to update cleanup procedures

### 3. **Debugging**
- Clear logging with color-coded messages
- Step-by-step cleanup process visibility
- Verification of Podman functionality

### 4. **Flexibility**
- Three levels of cleanup (pre-check, light, hard)
- Automatic fallback from light to hard cleanup
- Configurable for different environments

## Usage Examples

### In CI/CD Scripts:
```bash
# Source the cleanup functions
source setup/podman-cleanup.sh

# Perform hard cleanup for reliability
podman_hard_cleanup_and_reset

# Continue with container operations...
```

### In Regular Scripts:
```bash
# Source the cleanup functions
source setup/podman-cleanup.sh

# Check and fix if needed
podman_pre_operation_check

# Continue with container operations...
```

### Manual Cleanup:
```bash
# Source and run cleanup manually
source setup/podman-cleanup.sh
podman_hard_cleanup_and_reset
```

## Files Modified

1. **Created**: `setup/podman-cleanup.sh` - Centralized cleanup functions
2. **Modified**: `setup.sh` - Added pre-operation check
3. **Modified**: `setup/containers.sh` - Integrated cleanup functions
4. **Modified**: `setup/common.sh` - Replaced manual checks
5. **Modified**: `build/scripts/build-and-test.sh` - Added CI/CD cleanup
6. **Modified**: `test/setup/setup-test-install.sh` - Added pre-installation cleanup
7. **Modified**: `test/setup/setup-test-update.sh` - Added pre-operation check

## Testing

The implementation has been tested and verified:
- ✅ Cleanup functions load correctly
- ✅ Pre-operation check works when Podman is healthy
- ✅ Functions are properly exported and accessible
- ✅ Integration with existing scripts is seamless

## Expected CI/CD Impact

With this implementation, the CI/CD pipeline should:
1. **Start with a clean Podman state** every time
2. **Automatically recover** from state corruption
3. **Provide clear logging** of cleanup operations
4. **Eliminate** the "invalid internal status" error
5. **Improve reliability** of container operations

## Maintenance

To maintain this system:
1. **Monitor CI/CD logs** for cleanup messages
2. **Update cleanup procedures** in `setup/podman-cleanup.sh` as needed
3. **Add cleanup calls** to any new scripts that use Podman
4. **Test cleanup functions** periodically to ensure they work correctly

## Conclusion

This comprehensive Podman cleanup implementation provides a robust solution to CI/CD state corruption issues while maintaining code quality principles (DRY, KISS, Single Responsibility). The centralized approach ensures consistent behavior across all scripts and environments.