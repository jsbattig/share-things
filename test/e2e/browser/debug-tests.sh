#!/bin/bash

# Debug E2E browser tests

# Print environment information
echo "=== Environment Information ==="
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Current directory: $(pwd)"
echo "==============================="

# Check for running processes
echo "=== Checking for running processes ==="
ps aux | grep "npm run dev" || true
echo "===================================="

# Check available ports
echo "=== Checking port availability ==="
echo "Port 3003 (Server):"
nc -z localhost 3003 && echo "In use" || echo "Available"
echo "Port 5175 (Client):"
nc -z localhost 5175 && echo "In use" || echo "Available"
echo "================================="

# Run the tests in debug mode
echo "=== Running tests in debug mode ==="
npm run test:e2e:browser:debug -- --project=chromium
echo "=================================="

# Show the test report
echo "=== Test Report ==="
npx playwright show-report
echo "=================="