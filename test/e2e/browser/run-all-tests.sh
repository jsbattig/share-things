#!/bin/bash

# Run all E2E browser tests

# Create test results directory if it doesn't exist
mkdir -p test-results

# Set colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to print section header
print_header() {
  echo -e "\n${YELLOW}=======================================${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${YELLOW}=======================================${NC}\n"
}

# Run simple test
print_header "Running Simple Page Load Test"
./test/e2e/browser/run-nonblocking.sh
SIMPLE_RESULT=$?

# Run session tests
print_header "Running Session Management Tests"
./test/e2e/browser/run-session-tests.sh
SESSION_RESULT=$?

# Run content sharing tests
print_header "Running Content Sharing Tests"
./test/e2e/browser/run-content-tests.sh
CONTENT_RESULT=$?

# Print summary
print_header "Test Summary"
echo -e "Simple Page Load Test: $([ $SIMPLE_RESULT -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "Session Management Tests: $([ $SESSION_RESULT -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "Content Sharing Tests: $([ $CONTENT_RESULT -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"

# Calculate overall result
if [ $SIMPLE_RESULT -eq 0 ] && [ $SESSION_RESULT -eq 0 ] && [ $CONTENT_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed successfully!${NC}"
  exit 0
else
  echo -e "\n${RED}Some tests failed!${NC}"
  exit 1
fi