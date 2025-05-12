#!/bin/bash

# Run servers in the background and then run tests without waiting for user input

# Create a trap to ensure we clean up processes on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Kill any existing processes
echo "Stopping any existing processes..."
pkill -f "npm run dev" || true

# Wait for processes to terminate
sleep 2

# Start the server in the background
echo "Starting server in the background..."
(cd server && npm run dev) &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

# Start the client in the background
echo "Starting client in the background..."
(cd client && npm run dev) &
CLIENT_PID=$!
echo "Client started with PID: $CLIENT_PID"

# Wait for servers to be ready
echo "Waiting for servers to be ready..."
echo "Checking if port 3000 (client) is available..."
while ! nc -z localhost 3000 >/dev/null 2>&1; do
  echo "Waiting for client to start..."
  sleep 1
done
echo "Client is running on port 3000"

echo "Checking if port 3001 (API server) is available..."
while ! nc -z localhost 3001 >/dev/null 2>&1; do
  echo "Waiting for API server to start..."
  sleep 1
done
echo "API server is running on port 3001"

# Run the simple test
echo "Running simple E2E browser test..."
npx playwright test test/e2e/browser/tests/simple.test.ts --config=test/e2e/browser/playwright.config.ts --project=chromium --reporter=list

# Capture the test result
TEST_RESULT=$?

# Clean up processes
echo "Cleaning up processes..."
kill $SERVER_PID $CLIENT_PID 2>/dev/null

# Wait for processes to terminate
sleep 2

# Show the test result
if [ $TEST_RESULT -eq 0 ]; then
  echo "Tests passed successfully!"
else
  echo "Tests failed with exit code $TEST_RESULT"
fi

# Exit with the test result
exit $TEST_RESULT