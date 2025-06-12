#!/bin/bash

# Comprehensive Test Runner for ShareThings
# This script runs all types of tests and provides a complete status report

set -e

echo "🧪 ShareThings Comprehensive Test Suite"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test and track results
run_test() {
    local test_name="$1"
    local test_command="$2"
    local test_dir="${3:-$(pwd)}"
    
    echo -e "${BLUE}Running: $test_name${NC}"
    echo "Command: $test_command"
    echo "Directory: $test_dir"
    echo ""
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Create a temporary file to capture output
    local temp_output=$(mktemp)
    
    if (cd "$test_dir" && eval "$test_command" > "$temp_output" 2>&1); then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        # Show last few lines of successful output for context
        echo -e "${YELLOW}Last few lines of output:${NC}"
        tail -5 "$temp_output"
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        # Show the actual error with more context
        echo -e "${YELLOW}Error details:${NC}"
        tail -30 "$temp_output"
    fi
    
    # Clean up temp file
    rm -f "$temp_output"
    echo ""
}

# 1. Server Unit Tests
run_test "Server Unit Tests" "npm test" "server"

# 2. Server Integration Tests (already included in server tests)
echo -e "${BLUE}Server Integration Tests: Included in Server Unit Tests${NC}"
echo ""

# 3. Functional Tests (in their own environment with ES module support)
run_test "Functional Tests (ES Module Environment)" "node --experimental-vm-modules ../../../node_modules/jest/bin/jest.js --testTimeout=8000" "test/e2e/functional"

# 4. Root Jest Tests (CommonJS only)
run_test "Root Jest Tests (CommonJS)" "npm test" "."

# 5. Dockerized Build and Test
run_test "Dockerized Build & Test" "bash build/scripts/build-and-test.sh" "."

# 6. Setup Script Tests
run_test "Setup Install Test" "bash test/setup/setup-test-install.sh" "."

# Clean up any containers from setup test
echo -e "${YELLOW}Cleaning up containers from setup test...${NC}"
./setup.sh --uninstall --non-interactive > /dev/null 2>&1 || true

# 7. Data Persistence Test - REMOVED
# Note: Data persistence testing was removed when we eliminated the --update functionality.
# Data persistence is now validated as part of the main setup test (setup-test-install.sh)
# which tests the complete fresh install workflow including data directory creation.

# Summary
echo ""
echo "🏁 TEST SUMMARY"
echo "==============="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILED_TESTS TEST(S) FAILED${NC}"
    exit 1
fi