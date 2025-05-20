# ShareThings Testing Guidelines

## Core Testing Principles

1. **Test the Real Thing**: Tests must always use the full setup.sh process without shortcuts or simplifications. Do not create "minimal" or "simplified" test environments.

2. **No CI-Specific Flags**: Do not attempt to use any CI flags to minimize setup, remove steps, or simplify configuration. The test must always use setup.sh as-is to completely build and test the process.

3. **Use Bridge Networking**: Always use bridge networking instead of host networking for container communication. This ensures proper isolation and more closely resembles real-world deployment scenarios.

4. **Fail on Timeout**: If a test times out, it should fail. Do not implement fallback mechanisms that try a simplified approach when the main test fails.

5. **Complete Verification**: Tests should verify that containers are properly built, started, and accessible. This includes checking that services respond on their expected ports.

6. **User Experience Focus**: The goal is to test the actual setup process as a user would experience it, not to create a simplified version that passes CI but doesn't reflect real usage.

## Implementation Details

- The test-setup-install.sh script follows these principles by running the full setup.sh script with appropriate parameters.
- All container configurations use bridge networking with proper port mappings.
- The script verifies that containers are running and accessible after installation.
- If any part of the process fails, including timeouts, the test fails immediately.

## CI Environment Considerations

While we don't simplify the tests for CI, we do need to consider some CI-specific requirements:

- Increased timeouts may be necessary due to resource constraints in CI environments.
- Non-interactive mode must be used since CI environments don't have user input.
- Environment variables may need to be set to ensure proper operation in CI.

However, these considerations should not change the fundamental testing approach or simplify what's being tested.