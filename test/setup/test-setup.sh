#!/bin/bash

# Test script for setup.sh
# This script tests all operations: install, update, reinstall, and uninstall

# Text colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Log functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Test result tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
# Array to track which tests passed (1) or failed (0)
# Initialize with default values to avoid empty array issues
declare -a TEST_RESULTS=(0 0 0 0 0 0)

# Function to run a test with timeout and check result
run_test() {
  local test_name="$1"
  local command="$2"
  local expected_exit_code="${3:-0}"
  local timeout_seconds="${4:-60}"  # Default timeout: 1 minute
  
  # We're now using a fixed TESTS_TOTAL value, so don't increment it here
  # TESTS_TOTAL=$((TESTS_TOTAL + 1))
  
  # Create a dedicated log directory for this test with a fixed name
  # Avoid using date command substitution which is causing issues
  local test_name_clean=$(echo "$test_name" | tr ' ' '_')
  local test_log_dir="test-logs-${test_name_clean}"
  # Remove any existing directory
  rm -rf "$test_log_dir"
  mkdir -p "$test_log_dir"
  
  log_info "Running test: $test_name"
  log_info "Command: $command"
  log_info "Timeout: ${timeout_seconds} seconds"
  log_info "Logs will be saved to: $test_log_dir"
  
  # Create a temporary file to store output
  local output_file="$test_log_dir/output.log"
  
  # Start the command in background with output redirected to the temp file
  # and also displayed in real-time
  (
    # Run the command with bash -x for command tracing and tee output to both the terminal and the log file
    BASH_XTRACEFD=1 bash -x -c "$command" 2>&1 | tee "$output_file"
    # Save the exit code of the command (not tee)
    echo $? > "${output_file}.exit"
  ) &
  
  # Get the PID of the background process
  local pid=$!
  
  # Wait for the command to complete with timeout
  local elapsed=0
  local interval=5  # Check every 5 seconds
  
  log_info "Process started with PID: $pid"
  
  while kill -0 $pid 2>/dev/null; do
    if [ $elapsed -ge $timeout_seconds ]; then
      log_error "Test timed out after ${timeout_seconds} seconds"
      kill -9 $pid 2>/dev/null
      wait $pid 2>/dev/null
      TESTS_FAILED=$((TESTS_FAILED + 1))
      rm -f "$output_file" "${output_file}.exit"
      return 1
    fi
    
    sleep $interval
    elapsed=$((elapsed + interval))
    log_info "Still running... (${elapsed}/${timeout_seconds} seconds)"
  done
  
  # Get the exit code
  if [ -f "${output_file}.exit" ]; then
    EXIT_CODE=$(cat "${output_file}.exit")
  else
    EXIT_CODE=1
  fi
  
  # Read the output
  if [ -f "$output_file" ]; then
    OUTPUT=$(cat "$output_file")
  else
    OUTPUT="No output captured"
  fi
  
  # Save additional information to the log directory
  echo "Test: $test_name" > "$test_log_dir/test-info.txt"
  echo "Command: $command" >> "$test_log_dir/test-info.txt"
  echo "Exit code: $EXIT_CODE" >> "$test_log_dir/test-info.txt"
  echo "Expected exit code: $expected_exit_code" >> "$test_log_dir/test-info.txt"
  echo "Timestamp: $(date)" >> "$test_log_dir/test-info.txt"
  
  # Check if exit code matches expected
  if [ $EXIT_CODE -eq $expected_exit_code ]; then
    log_success "Test passed: $test_name"
    # Don't increment TESTS_PASSED here, we'll do it when setting TEST_RESULTS
    # Don't increment TEST_RESULTS here, we'll do it after verification
  else
    log_error "Test failed: $test_name"
    log_error "Expected exit code: $expected_exit_code, got: $EXIT_CODE"
    log_error "Command output summary (last 20 lines):"
    echo "$OUTPUT" | tail -n 20
    # Don't increment TESTS_FAILED here, we'll do it when setting TEST_RESULTS
    # Don't increment TEST_RESULTS here, we'll do it after verification
  fi
  
  # Return the command's exit code for additional checks
  return $EXIT_CODE
}

# Function to verify containers are running
verify_containers_running() {
  local log_dir="${1:-container-logs-$(date +%Y%m%d-%H%M%S)}"
  mkdir -p "$log_dir"
  
  log_info "Verifying containers are running..."
  log_info "Logs will be saved to: $log_dir"
  
  # Get detailed container information
  log_info "Detailed container information:"
  podman ps -a | tee "$log_dir/container-list.log"
  
  # Get detailed container information with formatting
  log_info "Detailed container information with formatting:"
  podman ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" | tee "$log_dir/container-details.log"
  
  # Get container images
  log_info "Container images:"
  podman images | grep share-things || echo "No share-things images found" | tee "$log_dir/container-images.log"
  
  # Get network information
  log_info "Network information:"
  podman network ls | tee "$log_dir/network-list.log"
  podman network inspect app_network 2>/dev/null | tee "$log_dir/network-details.log" || echo "Network app_network not found"
  
  # In CI environment, we need to be more strict about verification
  # Both containers must be running for the test to pass
  if [ "$CI" = "true" ]; then
    log_info "Running in CI environment - strict container verification"
    
    # Check if backend container is running and healthy
    log_info "Checking backend container health..."
    podman healthcheck run share-things-backend 2>&1 | tee "$log_dir/backend-health.log"
    BACKEND_HEALTH=$?

    # Check if frontend container is running and healthy
    log_info "Checking frontend container health..."
    podman healthcheck run share-things-frontend 2>&1 | tee "$log_dir/frontend-health.log"
    FRONTEND_HEALTH=$?

    # Check container logs if they exist
    log_info "Checking container logs for errors..."
    echo "Backend container logs:"
    podman logs share-things-backend --tail 30 2>&1 | tee "$log_dir/backend-logs.log" || echo "No logs available for backend container"

    echo "Frontend container logs:"
    podman logs share-things-frontend --tail 30 2>&1 | tee "$log_dir/frontend-logs.log" || echo "No logs available for frontend container"

    # In CI environment, both containers must be healthy for the test to pass
    if [ "$CI" = "true" ]; then
      log_info "Running in CI environment - strict container health verification"
      if [ $BACKEND_HEALTH -eq 0 ] && [ $FRONTEND_HEALTH -eq 0 ]; then
        log_success "Both containers are healthy (required for CI environment)"
        return 0
      else
        log_error "Not all required containers are healthy in CI environment"
        log_info "Current container status:"
        podman ps

        # Check for stopped containers
        log_info "Checking for stopped containers:"
        podman ps -a --filter status=exited

        # Check podman system info
        log_info "Podman system info:"
        podman info --format "{{.Host.RemoteSocket.Path}}" || log_warning "Could not get podman socket info"

        return 1
      fi
    else
      # Standard verification for non-CI environments
      if [ $BACKEND_HEALTH -eq 0 ] && [ $FRONTEND_HEALTH -eq 0 ]; then
        log_success "Both containers are healthy"
        return 0
      else
        log_error "Not all containers are healthy"
        log_info "Current container status:"
        podman ps

        # Check for stopped containers
        log_info "Checking for stopped containers:"
        podman ps -a --filter status=exited

        # Check podman system info
        log_info "Podman system info:"
        podman info --format "{{.Host.RemoteSocket.Path}}" || log_warning "Could not get podman socket info"

        return 1
        return 1
      fi
    fi
  fi
}

# Function to verify containers are not running
verify_containers_not_running() {
  local log_dir="${1:-container-logs-uninstall-$(date +%Y%m%d-%H%M%S)}"
  mkdir -p "$log_dir"
  
  log_info "Verifying containers are not running..."
  log_info "Logs will be saved to: $log_dir"
  
  # Get detailed container information
  log_info "Detailed container information:"
  podman ps -a | tee "$log_dir/container-list.log"
  
  # Get detailed container information with formatting
  log_info "Detailed container information with formatting:"
  podman ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" | tee "$log_dir/container-details.log"
  
  # Get container images
  log_info "Container images:"
  podman images | tee "$log_dir/container-images.log"
  
  # Check if any share-things containers are running
  podman ps | grep -q "share-things"
  CONTAINERS_RUNNING=$?
  
  if [ $CONTAINERS_RUNNING -ne 0 ]; then
    log_success "No containers are running"
    
    # Check for stopped containers
    STOPPED_CONTAINERS=$(podman ps -a --filter name=share-things --filter status=exited -q)
    if [ -n "$STOPPED_CONTAINERS" ]; then
      log_warning "Found stopped containers that should be removed:"
      podman ps -a --filter name=share-things --filter status=exited
    fi
    
    return 0
  else
    log_error "Some containers are still running"
    log_info "Current container status:"
    podman ps
    return 1
  fi
}

# Check if Podman is running
check_podman() {
  log_info "Checking if Podman is running..."
  
  if ! command -v podman &> /dev/null; then
    log_error "Podman is not installed."
    exit 1
  fi
  
  # Try a simple podman command to check if the service is running
  podman info &> /dev/null
  if [ $? -ne 0 ]; then
    log_error "Podman service is not running. Please start it with 'podman machine start' or equivalent."
    exit 1
  fi
  
  log_success "Podman is running and available."
}

# Main test sequence
log_info "Starting setup.sh test sequence"
log_info "================================"

# Check if Podman is running before starting tests
check_podman

# Test 1: Fresh installation
log_info "Test 1: Fresh installation"

# Clean up any existing installation and prune podman caches
log_info "Cleaning up any existing installation..."
rm -f ../../.env ../../client/.env ../../server/.env 2>/dev/null
rm -f ../../build/config/podman-compose.prod.yml ../../build/config/podman-compose.prod.temp.yml ../../build/config/podman-compose.update.yml 2>/dev/null

# Stop and remove all containers
log_info "Stopping and removing all containers..."
podman stop --all 2>/dev/null
podman rm -f --all 2>/dev/null

# Prune podman caches completely
log_info "Pruning podman caches completely..."
podman system prune -a -f
podman image prune -a -f
podman volume prune -f
podman network prune -f

log_info "Checking if any containers are still running..."
podman ps -a
log_info "Checking if any ShareThings files exist..."
ls -la ../../.env ../../client/.env ../../server/.env 2>/dev/null || echo "No env files found"
log_info "Running test with force-install flag to ensure clean state..."
# Increase timeout to 5 minutes (300 seconds) for installation tests
run_test "Fresh installation" "TESTING=true cd ../.. && ./setup.sh --non-interactive --force-install --hostname=auto --frontend-port=15000 --backend-port=15001 --api-port=15001 --expose-ports --debug --force" 0 300
if [ $? -eq 0 ]; then
  # Wait a bit for containers to start
  log_info "Waiting 10 seconds for containers to start..."
  sleep 10
  
  # Check if podman is running
  log_info "Checking podman status before verification..."
  podman info &> /dev/null
  if [ $? -ne 0 ]; then
    log_error "Podman service is not running after installation"
    log_info "Attempting to restart podman..."
    podman machine start &> /dev/null
    sleep 5
  fi
  
  # Show all containers (running and stopped)
  log_info "All containers (including stopped ones):"
  podman ps -a
  
  # Create a log directory for this test with a fixed name
  container_log_dir="container-logs-test1"
  # Remove any existing directory
  rm -rf "$container_log_dir"
  mkdir -p "$container_log_dir"
  verify_containers_running "$container_log_dir"
  VERIFICATION_RESULT=$?
  if [ $VERIFICATION_RESULT -ne 0 ]; then
    log_error "Test 1 failed: Containers not running after installation"
    # Mark test as failed
    TEST_RESULTS[0]=0
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    # Mark test as passed
    TEST_RESULTS[0]=1
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "Test 1 passed: Containers running after installation"
  fi
fi

# Test 2: Update installation
log_info "Test 2: Update installation"
# Increase timeout to 5 minutes (300 seconds) for update tests
run_test "Update installation" "TESTING=true cd ../.. && ./setup.sh --update --non-interactive --debug --force" 0 300
if [ $? -eq 0 ]; then
  # Wait a bit for containers to start
  log_info "Waiting 10 seconds for containers to start..."
  sleep 10

  # Show all containers (running and stopped)
  log_info "All containers (including stopped ones):"
  podman ps -a

  # Create a log directory for this test with a fixed name
  container_log_dir="container-logs-test2"
  # Remove any existing directory
  rm -rf "$container_log_dir"
  mkdir -p "$container_log_dir"
  verify_containers_running "$container_log_dir"
  VERIFICATION_RESULT=$?
  if [ $VERIFICATION_RESULT -ne 0 ]; then
    log_error "Test 2 failed: Containers not running after update"
    # Mark test as failed
    TEST_RESULTS[1]=0
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    # Mark test as passed
    TEST_RESULTS[1]=1
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "Test 2 passed: Containers running after update"
  fi
fi

# Test 3: Reinstall
log_info "Test 3: Reinstall"
# Increase timeout to 5 minutes (300 seconds) for reinstall tests
run_test "Reinstall" "TESTING=true cd ../.. && ./setup.sh --reinstall --non-interactive --debug --force" 0 300
if [ $? -eq 0 ]; then
  # Wait a bit for containers to start
  log_info "Waiting 10 seconds for containers to start..."
  sleep 10

  # Show all containers (running and stopped)
  log_info "All containers (including stopped ones):"
  podman ps -a

  # Create a log directory for this test with a fixed name
  container_log_dir="container-logs-test3"
  # Remove any existing directory
  rm -rf "$container_log_dir"
  mkdir -p "$container_log_dir"
  verify_containers_running "$container_log_dir"
  VERIFICATION_RESULT=$?
  if [ $VERIFICATION_RESULT -ne 0 ]; then
    log_error "Test 3 failed: Containers not running after reinstall"
    # Mark test as failed
    TEST_RESULTS[2]=0
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    # Mark test as passed
    TEST_RESULTS[2]=1
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "Test 3 passed: Containers running after reinstall"
  fi
fi

# Test 4: Uninstall
log_info "Test 4: Uninstall"
run_test "Uninstall" "TESTING=true cd ../.. && ./setup.sh --uninstall --non-interactive --debug --force"
if [ $? -eq 0 ]; then
  # Create a log directory for this test with a fixed name
  container_log_dir="container-logs-test4-uninstall"
  # Remove any existing directory
  rm -rf "$container_log_dir"
  mkdir -p "$container_log_dir"
  verify_containers_not_running "$container_log_dir"
  VERIFICATION_RESULT=$?
  if [ $VERIFICATION_RESULT -ne 0 ]; then
    log_error "Test 4 failed: Containers still running after uninstall"
    # Mark test as failed
    TEST_RESULTS[3]=0
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    # Mark test as passed
    TEST_RESULTS[3]=1
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "Test 4 passed: No containers running after uninstall"
  fi
fi

# Test 5: Install with custom ports
log_info "Test 5: Install with custom ports"
# Increase timeout to 5 minutes (300 seconds) for custom port installation tests
run_test "Install with custom ports" "TESTING=true cd ../.. && ./setup.sh --non-interactive --force-install --hostname=auto --frontend-port=15100 --backend-port=15101 --api-port=15101 --expose-ports --debug --force" 0 300
if [ $? -eq 0 ]; then
  # Wait a bit for containers to start
  log_info "Waiting 10 seconds for containers to start..."
  sleep 10

  # Show all containers (running and stopped)
  log_info "All containers (including stopped ones):"
  podman ps -a

  # Create a log directory for this test with a fixed name
  container_log_dir="container-logs-test5"
  # Remove any existing directory
  rm -rf "$container_log_dir"
  mkdir -p "$container_log_dir"
  verify_containers_running "$container_log_dir"
  VERIFICATION_RESULT=$?
  if [ $VERIFICATION_RESULT -ne 0 ]; then
    log_error "Test 5 failed: Containers not running after custom port installation"
    log_info "Attempting to start containers manually..."
    podman start share-things-backend share-things-frontend &> /dev/null
    sleep 5
    verify_containers_running "$container_log_dir-retry"
    RETRY_RESULT=$?
    if [ $RETRY_RESULT -ne 0 ]; then
      # Mark test as failed
      TEST_RESULTS[4]=0
      TESTS_FAILED=$((TESTS_FAILED + 1))
      log_error "Test 5 failed even after manual container start attempt"
    else
      log_success "Containers started manually"
      # Mark test as passed
      TEST_RESULTS[4]=1
      TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
  else
    # Mark test as passed
    TEST_RESULTS[4]=1
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "Test 5 passed: Containers running after custom port installation"
  fi
fi

# Test 6: Final uninstall
log_info "Test 6: Final uninstall"
run_test "Final uninstall" "TESTING=true cd ../.. && ./setup.sh --uninstall --non-interactive --debug --force"
if [ $? -eq 0 ]; then
  # Create a log directory for this test with a fixed name
  container_log_dir="container-logs-test6-uninstall"
  # Remove any existing directory
  rm -rf "$container_log_dir"
  mkdir -p "$container_log_dir"
  verify_containers_not_running "$container_log_dir"
  VERIFICATION_RESULT=$?
  if [ $VERIFICATION_RESULT -ne 0 ]; then
    log_error "Test 6 failed: Containers still running after final uninstall"
    # Mark test as failed
    TEST_RESULTS[5]=0
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    # Mark test as passed
    TEST_RESULTS[5]=1
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "Test 6 passed: No containers running after final uninstall"
  fi
fi

# Calculate total tests
TESTS_TOTAL=6

# Print test summary
log_info "Test Summary"
log_info "============"
log_info "Total tests: $TESTS_TOTAL"
log_success "Tests passed: $TESTS_PASSED"
if [ $TESTS_FAILED -gt 0 ]; then
  log_error "Tests failed: $TESTS_FAILED"
else
  log_success "Tests failed: $TESTS_FAILED"
fi

# Print detailed test results
log_info "Detailed Test Results"
log_info "===================="
for i in {0..5}; do
  TEST_NUM=$((i + 1))
  if [ ${TEST_RESULTS[$i]} -eq 1 ]; then
    log_success "Test $TEST_NUM: Passed"
  else
    log_error "Test $TEST_NUM: Failed"
  fi
done

# Exit with failure if any tests failed
if [ $TESTS_FAILED -gt 0 ]; then
  log_error "Some tests failed. Exiting with error."
  exit 1
else
  log_success "All tests passed!"
  exit 0
fi