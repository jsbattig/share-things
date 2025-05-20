# Log Directory Changes

After reviewing the codebase, I've identified several places where log files are being created directly in the root folder. According to your requirements, all logs should be created under a `logs` subfolder on the root, with additional subfolders as needed to keep things clean.

## Identified Log File Locations

1. **Container Logs in setup/containers.sh**:
   ```bash
   CONTAINER_LOG_DIR="container-logs-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$CONTAINER_LOG_DIR"
   ```

2. **Debug Log in setup.sh**:
   ```bash
   DEBUG_LOG_FILE="setup-debug.log"
   # Remove any existing log file
   rm -f "$DEBUG_LOG_FILE"
   # Create a new log file with a header
   echo "=== Debug Log Started ===" > "$DEBUG_LOG_FILE"
   # Redirect output to the log file and console
   exec > >(tee -a "$DEBUG_LOG_FILE") 2>&1
   ```

3. **Temporary Log File in test/setup/setup-test-install.sh**:
   ```bash
   TEMP_LOG_FILE="setup-cleanup-output.log"
   ./setup.sh --uninstall --non-interactive > "$TEMP_LOG_FILE" 2>&1
   ```

## Recommended Changes

### 1. Container Logs in setup/containers.sh

```diff
if [ "$DEBUG_MODE" = "true" ]; then
-   CONTAINER_LOG_DIR="container-logs-$(date +%Y%m%d-%H%M%S)"
+   # Create logs directory if it doesn't exist
+   mkdir -p "logs"
+   # Get the date in a separate step to avoid command substitution issues
+   CURRENT_DATE=$(date +%Y%m%d-%H%M%S)
+   # Add error handling to detect and report when command substitution fails
+   if [[ ! $CURRENT_DATE =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
+       log_warning "Failed to get properly formatted date. Using fallback."
+       CURRENT_DATE="fallback-$(date +%s)"  # Use Unix timestamp as fallback
+   fi
+   # Use the variable to create the directory name under logs/container-logs
+   CONTAINER_LOG_DIR="logs/container-logs/${CURRENT_DATE}"
    mkdir -p "$CONTAINER_LOG_DIR"
    
    echo "Saving container logs to $CONTAINER_LOG_DIR directory..."
    podman logs share-things-frontend > "$CONTAINER_LOG_DIR/frontend.log" 2>&1 || echo "Could not save frontend logs"
    podman logs share-things-backend > "$CONTAINER_LOG_DIR/backend.log" 2>&1 || echo "Could not save backend logs"
    podman ps -a > "$CONTAINER_LOG_DIR/container-list.txt" 2>&1 || echo "Could not save container list"
    podman images > "$CONTAINER_LOG_DIR/images.txt" 2>&1 || echo "Could not save image list"
    
    echo "Container logs saved to $CONTAINER_LOG_DIR directory"
fi
```

### 2. Debug Log in setup.sh

```diff
# Create a debug log file with a fixed name to avoid command substitution issues
- DEBUG_LOG_FILE="setup-debug.log"
+ # Create logs directory if it doesn't exist
+ mkdir -p "logs"
+ DEBUG_LOG_FILE="logs/setup-debug.log"
# Remove any existing log file
rm -f "$DEBUG_LOG_FILE"
# Create a new log file with a header
echo "=== Debug Log Started ===" > "$DEBUG_LOG_FILE"
# Redirect output to the log file and console
exec > >(tee -a "$DEBUG_LOG_FILE") 2>&1
```

### 3. Temporary Log File in test/setup/setup-test-install.sh

```diff
# Create a temporary log file for cleanup output
- TEMP_LOG_FILE="setup-cleanup-output.log"
+ # Create logs directory if it doesn't exist
+ mkdir -p "logs/test"
+ TEMP_LOG_FILE="logs/test/setup-cleanup-output.log"
./setup.sh --uninstall --non-interactive > "$TEMP_LOG_FILE" 2>&1
```

### 4. Update .gitignore

To ensure that log files are not committed to the repository, update the .gitignore file:

```diff
- test-logs-*
- container-logs-*
+ logs/
```

## Implementation Plan

1. Create the `logs` directory in the root folder if it doesn't already exist
2. Create subdirectories under `logs` for different types of logs:
   - `logs/container-logs/` for container logs
   - `logs/test/` for test-related logs
3. Modify the files as described above to create log files in the appropriate directories
4. Update the .gitignore file to ignore the entire `logs` directory

This approach will keep all logs organized under the `logs` directory, making it easier to manage and clean up log files.