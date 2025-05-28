#!/bin/bash

# Script to clean up all content and restart the server
# This is useful for testing and debugging

echo "Stopping the server..."
# Find and kill the Node.js server process
pkill -f "node.*server/src/index.js" || echo "Server was not running"

echo "Cleaning up all content..."
# Run the cleanup script
cd server && node scripts/cleanup-all-content.js

echo "Waiting for cleanup to complete..."
sleep 2

echo "Starting the server..."
# Start the server in the foreground
npm start

# Return to the original directory
cd ..

echo "Server stopped."