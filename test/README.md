# ShareThings Testing

This directory contains tests for the ShareThings application.

## Test Structure

- `setup.ts`: Global test setup and utilities
- `tsconfig.json`: TypeScript configuration for tests
- `e2e/`: End-to-end tests
  - `functional/`: Functional tests that verify end-to-end behavior

## Running Tests

### Unit Tests

To run unit tests for the client:

```bash
cd client
npm test
```

To run unit tests for the server:

```bash
cd server
npm test
```

### End-to-End Functional Tests

The functional tests verify that the entire system works correctly by simulating real user interactions. These tests:

1. Start the server
2. Connect multiple client emulators
3. Test sharing different types of content
4. Verify that content is received correctly

To run the functional tests:

```bash
# From the project root
npm run test:e2e
```

Or to run a specific test:

```bash
npx jest test/e2e/functional/simple-test.test.ts
```

## Test Components

### Server Controller

The `ServerController` manages the lifecycle of the server process during tests.

### Client Emulator

The `ClientEmulator` simulates browser clients connecting to the server and sharing content.

### Content Generator

The `ContentGenerator` creates test content (text, images, files) for testing.

### Test Orchestrator

The `TestOrchestrator` coordinates the test flow and assertions.

## Adding New Tests

To add a new functional test:

1. Add a new test method to `TestOrchestrator` class
2. Add a new test case to `functional-tests.test.ts`
3. Run the test to verify it works

Example:

```typescript
// In TestOrchestrator
async testNewFeature(): Promise<void> {
  console.log('Testing new feature...');
  
  try {
    // Test implementation
    console.log('New feature test passed');
  } catch (error) {
    console.error('New feature test failed:', error);
    throw error;
  }
}

// In functional-tests.test.ts
test('New feature', async () => {
  await orchestrator.testNewFeature();
}, 60000);
```

## Troubleshooting

If tests are failing, check:

1. Server logs for errors
2. Network connectivity between clients and server
3. Test timeouts (increase if necessary)
4. Mock implementations of browser APIs