#!/bin/bash

# Run E2E browser tests

# Stop any existing processes
echo "Stopping any existing processes..."
pkill -f "npm run dev" || true

# Wait for processes to terminate
sleep 2

# Start the tests
echo "Running E2E browser tests..."
npm run test:e2e:browser -- --project=chromium

# Show the test report
echo "Showing test report..."
npx playwright show-report