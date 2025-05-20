# GitHub Actions Impact Analysis for File Reorganization

This document provides a detailed analysis of how the proposed file reorganization will impact the planned GitHub Actions workflow.

## Current GitHub Actions Plan

Based on the project documentation, there are plans to implement a GitHub Actions workflow file at `.github/workflows/share-things-ci-cd.yml`. This workflow will include several sequential jobs:

1. **Lint**: Code linting checks
2. **Build and Test**: Building the application and running unit tests
3. **Integration**: Running dockerized build and tests
4. **Build Production**: Building the production Docker configuration
5. **Deploy to Production**: Deploying to the production server

The workflow is designed to run these jobs sequentially, with each job depending on the success of the previous job.

## Key Files Referenced in the Workflow

The planned GitHub Actions workflow references several files that will be moved as part of our reorganization:

1. **build-and-test.sh**: Referenced in the Integration job
   ```yaml
   - name: Make build-and-test script executable
     run: chmod +x build-and-test.sh
   
   - name: Build and run tests with verbose output
     run: bash -x ./build-and-test.sh
   ```

2. **build-production.sh**: Referenced in the Build Production job
   ```yaml
   - name: Make build-production script executable
     run: |
       chmod +x build-production.sh
   
   - name: Build production containers
     run: ./build-production.sh
   ```

3. **Docker/Podman Compose Files**: Referenced indirectly through the build scripts

## Impact of File Reorganization

### 1. Path Updates Required in Workflow File

When the GitHub Actions workflow file is created, it will need to reference the new locations of the build scripts:

```yaml
# Current (planned)
- name: Make build-and-test script executable
  run: chmod +x build-and-test.sh

- name: Build and run tests with verbose output
  run: bash -x ./build-and-test.sh
```

```yaml
# Updated (after reorganization)
- name: Make build-and-test script executable
  run: chmod +x build/scripts/build-and-test.sh

- name: Build and run tests with verbose output
  run: bash -x ./build/scripts/build-and-test.sh
```

Similarly for the build-production.sh script:

```yaml
# Current (planned)
- name: Make build-production script executable
  run: |
    chmod +x build-production.sh

- name: Build production containers
  run: ./build-production.sh
```

```yaml
# Updated (after reorganization)
- name: Make build-production script executable
  run: |
    chmod +x build/scripts/build-production.sh

- name: Build production containers
  run: ./build/scripts/build-production.sh
```

### 2. Working Directory Considerations

There are two approaches to handle the new file locations in the GitHub Actions workflow:

#### Option 1: Update the file paths directly

Simply update the paths in the workflow file to point to the new locations, as shown above.

#### Option 2: Use working-directory parameter

Alternatively, set the working directory for specific steps:

```yaml
- name: Make build-and-test script executable
  working-directory: ./build/scripts
  run: chmod +x build-and-test.sh

- name: Build and run tests with verbose output
  working-directory: ./build/scripts
  run: bash -x ./build-and-test.sh
```

However, this approach may cause issues if the scripts expect to be run from the project root directory, as they may reference files using relative paths.

### 3. Updates Required in Build Scripts

The build scripts themselves will need to be updated to reference the new locations of the Docker/Podman compose files:

```bash
# Current (in build-and-test.sh)
$DOCKER_COMPOSE_CMD -f docker-compose.test.yml down
$DOCKER_COMPOSE_CMD -f docker-compose.test.yml build
```

```bash
# Updated (in build/scripts/build-and-test.sh)
$DOCKER_COMPOSE_CMD -f ../config/docker-compose.test.yml down
$DOCKER_COMPOSE_CMD -f ../config/docker-compose.test.yml build
```

Or alternatively, using absolute paths from the project root:

```bash
# Alternative approach
$DOCKER_COMPOSE_CMD -f $PROJECT_ROOT/build/config/docker-compose.test.yml down
$DOCKER_COMPOSE_CMD -f $PROJECT_ROOT/build/config/docker-compose.test.yml build
```

Where `$PROJECT_ROOT` would be determined at the start of the script.

### 4. Podman-Specific Considerations

The project has migrated from Docker to Podman, and the GitHub Actions workflow will need to account for this. The workflow will:

1. Run on self-hosted runners with Rocky Linux
2. Verify Podman and Podman Compose installation
3. Use the `PODMAN_USERNS=keep-id` environment variable

These considerations are independent of the file reorganization but should be kept in mind when updating the workflow file.

## Implementation Strategy

To ensure a smooth transition with the file reorganization, we recommend the following approach for GitHub Actions:

1. **Create the directory structure** and move files as outlined in the cleanup plan
2. **Update the build scripts** to reference the new locations of the Docker/Podman compose files
3. **Create a template GitHub Actions workflow file** at `.github/workflows/share-things-ci-cd.yml` that references the new file locations
4. **Document the changes** in the README.md and other relevant documentation

## Example Updated Workflow File Sections

Here's how the relevant sections of the GitHub Actions workflow file should look after the reorganization:

```yaml
# Integration job
integration:
  name: Dockered Build and Tests
  needs: [build]
  runs-on: [self-hosted, Rocky Linux]
  
  steps:
  - uses: actions/checkout@v3
  
  - name: Verify Podman installation
    run: |
      podman --version
      podman-compose --version
  
  - name: Make build-and-test script executable
    run: chmod +x build/scripts/build-and-test.sh
  
  - name: Debug environment
    run: |
      echo "GitHub Actions environment:"
      echo "Working directory: $(pwd)"
      ls -la
      echo "Podman version:"
      podman --version
      echo "Podman Compose version:"
      podman-compose --version
      echo "Podman info:"
      podman info
      echo "Available disk space:"
      df -h
  
  - name: Build and run tests with verbose output
    run: bash -x ./build/scripts/build-and-test.sh
    env:
      CI: true
      PODMAN_USERNS: keep-id
  
  - name: Upload test results
    uses: actions/upload-artifact@v4
    if: always()
    with:
      name: test-results
      path: test-results/

# Build Production job
build-production:
  name: Build Production
  needs: [integration]
  runs-on: [self-hosted, Rocky Linux]
  
  steps:
  - uses: actions/checkout@v3
  
  - name: Verify Podman installation
    run: |
      podman --version
      podman-compose --version
  
  - name: Make build-production script executable
    run: |
      chmod +x build/scripts/build-production.sh
  
  - name: Debug environment
    run: |
      echo "GitHub Actions environment:"
      echo "Working directory: $(pwd)"
      ls -la
      echo "Podman version:"
      podman --version
      echo "Podman Compose version:"
      podman-compose --version
      echo "Podman info:"
      podman info
  
  - name: Build production containers
    run: ./build/scripts/build-production.sh
    env:
      CI: true
      PODMAN_USERNS: keep-id
  
  - name: Upload build artifacts
    uses: actions/upload-artifact@v4
    with:
      name: production-build-artifacts
      path: |
        server/dist
        client/dist
```

## Conclusion

The file reorganization will require updates to the GitHub Actions workflow file, but these changes are straightforward and well-defined. By following the implementation strategy outlined above, we can ensure that the GitHub Actions workflow continues to function correctly after the reorganization.

The main benefits of this approach are:
1. **Improved organization**: Build scripts and configuration files are logically grouped
2. **Cleaner root directory**: Only essential files remain in the root directory
3. **Maintainable structure**: The new structure is more maintainable and scalable

These benefits outweigh the one-time cost of updating the GitHub Actions workflow file.