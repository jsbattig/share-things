#!/bin/bash

# Wrapper script to maintain backward compatibility
# This script simply calls the actual test-setup.sh script in its new location

echo "Note: test-setup.sh has been moved to test/setup/test-setup.sh"
echo "Running test/setup/test-setup.sh instead..."
echo ""

# Execute the actual script
./test/setup/test-setup.sh "$@"

# Pass through the exit code
exit $?