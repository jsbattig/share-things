#!/bin/bash

# Run simple E2E browser test

# Create test results directory if it doesn't exist
mkdir -p test-results

# Run the simple test
echo "Running simple E2E browser test..."
npx playwright test test/e2e/browser/tests/simple.test.ts --config=test/e2e/browser/playwright.config.ts --project=chromium

# Show the test report
echo "Showing test report..."
npx playwright show-report