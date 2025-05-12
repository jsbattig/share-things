# ShareThings E2E Browser Tests

This directory contains end-to-end browser tests for the ShareThings application using Playwright. These tests automate real browsers to test the application's functionality from the user's perspective.

## Overview

The E2E browser tests verify that the ShareThings application works correctly by:

1. Starting both the server and client applications
2. Launching real browser instances
3. Automating user interactions
4. Verifying that the application behaves as expected

## Directory Structure

```
test/e2e/browser/
├── fixtures/              # Test files (images, documents)
├── helpers/               # Helper functions
│   ├── app-launcher.ts    # Handles starting/stopping applications
│   └── browser-utils.ts   # Browser interaction utilities
├── tests/                 # Test files
│   ├── simple.test.ts     # Basic page load test
│   ├── session.test.ts    # Session management tests
│   └── content-sharing.test.ts # Content sharing tests
├── playwright.config.ts   # Playwright configuration
├── run-nonblocking.sh     # Script to run simple tests
├── run-session-tests.sh   # Script to run session tests
├── run-content-tests.sh   # Script to run content sharing tests
├── run-all-tests.sh       # Script to run all tests
└── README.md              # This file
```

## Prerequisites

Before running the tests, ensure you have:

1. Node.js (v16 or later)
2. npm (v7 or later)
3. Playwright installed: `npm run test:e2e:browser:install`

## Running the Tests

You can run the tests using the following npm scripts:

```bash
# Run all tests
npm run test:e2e:browser:all

# Run simple page load test
npm run test:e2e:browser:simple

# Run session management tests
npm run test:e2e:browser:session

# Run content sharing tests
npm run test:e2e:browser:content
```

Or you can run the scripts directly:

```bash
# Run all tests
./test/e2e/browser/run-all-tests.sh

# Run simple page load test
./test/e2e/browser/run-nonblocking.sh

# Run session management tests
./test/e2e/browser/run-session-tests.sh

# Run content sharing tests
./test/e2e/browser/run-content-tests.sh
```

## Test Scenarios

### Simple Page Load Test

Verifies that the application loads correctly and displays the expected elements on the home page.

### Session Management Tests

1. **Session Creation**: Verifies that a user can create a new session.
2. **Session Joining**: Verifies that a second user can join an existing session.

### Content Sharing Tests

1. **Text Sharing**: Verifies that text can be shared between users in a session.
2. **File Sharing**: Verifies that files can be shared between users in a session.

## How It Works

Each test script:

1. Starts the server and client applications in the background
2. Waits for the applications to be ready
3. Runs the tests using Playwright
4. Cleans up the processes when the tests are complete

The tests use real browser instances to interact with the application, simulating user actions like clicking buttons, filling forms, and sharing content.

## Troubleshooting

If the tests fail, check:

1. **Port conflicts**: Ensure ports 3000 and 3001 are available.
2. **Application errors**: Check the server and client logs for errors.
3. **Test timeouts**: Increase timeouts in the Playwright configuration if needed.
4. **Selector issues**: Update selectors if the UI has changed.

## Adding New Tests

To add a new test:

1. Create a new test file in the `tests` directory
2. Use the existing tests as a template
3. Run the test using the appropriate script

## Screenshots and Videos

Test results, including screenshots and videos, are saved in the `test-results` directory. These can be useful for debugging test failures.