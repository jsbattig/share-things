# GitHub Actions Sequential Workflow Plan

This document outlines how to create a sequential workflow for the ShareThings application, where jobs run in a specific order and each job only runs if the previous job succeeded.

## Current Situation

Currently, we have separate workflow files:
- `lint.yml`: Runs linting checks
- `build.yml`: Builds the application and runs unit tests
- `integration.yml`: Runs dockerized build and tests
- `build-production.yml`: Builds the production Docker configuration
- `deploy-production.yml`: Deploys to production server

These workflows run independently, which makes it difficult to ensure they run in sequence and that later jobs only run if earlier jobs succeed.

## Solution: Combined Workflow

To create a proper sequence where jobs depend on each other, we'll combine all jobs into a single workflow file. This allows us to use the `needs` parameter to establish dependencies between jobs.

### Implementation Steps

1. Create a new workflow file: `.github/workflows/share-things-ci-cd.yml`
2. Define all jobs in this file with proper dependencies
3. Remove or disable the individual workflow files

### New Workflow File Structure

```yaml
name: ShareThings CI/CD Pipeline

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install root dependencies
      run: npm ci
    
    - name: Install client dependencies
      run: cd client && npm ci && npm install crypto-js @types/crypto-js
    
    - name: Install server dependencies
      run: cd server && npm ci
    
    - name: Lint server
      run: cd server && npm run lint
    
    - name: Lint client
      run: cd client && npm run lint

  build:
    name: Build and Test
    needs: [lint]
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install root dependencies
      run: npm ci
    
    - name: Install client dependencies
      run: cd client && npm ci && npm install crypto-js @types/crypto-js
    
    - name: Install server dependencies
      run: cd server && npm ci
    
    - name: Build server
      run: cd server && npm run build
    
    - name: Build client
      run: cd client && npm run build
    
    - name: Test server
      run: cd server && npm test
    
    - name: Test client
      run: cd client && npm test
    
    - name: Upload build artifacts
      uses: actions/upload-artifact@v4
      with:
        name: build-artifacts
        path: |
          server/dist
          client/dist

  integration:
    name: Dockered Build and Tests
    needs: [build]
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Cache Docker layers
      uses: actions/cache@v3
      with:
        path: /tmp/.buildx-cache
        key: ${{ runner.os }}-buildx-${{ github.sha }}
        restore-keys: |
          ${{ runner.os }}-buildx-
    
    - name: Make build-and-test script executable
      run: chmod +x build-and-test.sh
    
    - name: Debug environment
      run: |
        echo "GitHub Actions environment:"
        echo "Working directory: $(pwd)"
        ls -la
        echo "Docker version:"
        docker --version
        echo "Docker Compose version:"
        docker-compose --version || docker compose version
        echo "Docker info:"
        docker info
        echo "Available disk space:"
        df -h
    
    - name: Build and run tests with verbose output
      run: bash -x ./build-and-test.sh
      env:
        CI: true
        DOCKER_BUILDKIT: 1
    
    - name: Upload test results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: test-results
        path: test-results/

  build-production:
    name: Build Production
    needs: [integration]
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Cache Docker layers
      uses: actions/cache@v3
      with:
        path: /tmp/.buildx-cache
        key: ${{ runner.os }}-buildx-${{ github.sha }}
        restore-keys: |
          ${{ runner.os }}-buildx-
    
    - name: Make build-production script executable
      run: |
        chmod +x build-production.sh
    
    - name: Debug environment
      run: |
        echo "GitHub Actions environment:"
        echo "Working directory: $(pwd)"
        ls -la
        echo "Docker version:"
        docker --version
        echo "Docker Compose version:"
        docker-compose --version || docker compose version
        echo "Docker info:"
        docker info
    
    - name: Build production containers
      run: ./build-production.sh
      env:
        CI: true
        DOCKER_BUILDKIT: 1
    
    - name: Upload build artifacts
      uses: actions/upload-artifact@v4
      with:
        name: production-build-artifacts
        path: |
          server/dist
          client/dist

  deploy-production:
    name: Deploy to Production
    needs: [build-production]
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    runs-on: [self-hosted, Rocky Linux]
    
    steps:
      - name: Deploy to production server
        # Use sshpass to handle password authentication
        run: |
          # Install sshpass if not already installed
          if ! command -v sshpass &> /dev/null; then
            sudo yum install -y sshpass
          fi
          
          # Function to check if update-server.sh is running
          check_update_script_running() {
            sshpass -p "${{ secrets.GHRUserPassword }}" ssh -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "pgrep -f update-server.sh" > /dev/null
            return $?
          }
          
          # Wait until any existing update-server.sh process completes
          echo "Checking if update-server.sh is already running on the production server..."
          while check_update_script_running; do
            echo "update-server.sh is currently running. Waiting 30 seconds before checking again..."
            sleep 30
          done
          
          echo "No running update-server.sh process detected. Proceeding with deployment..."
          
          # Set up SSH connection and run the update script, capturing the exit code
          sshpass -p "${{ secrets.GHRUserPassword }}" ssh -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd /share-things && ./update-server.sh"
          DEPLOY_EXIT_CODE=$?
          
          # Check if the deployment was successful
          if [ $DEPLOY_EXIT_CODE -ne 0 ]; then
            echo "Deployment failed with exit code $DEPLOY_EXIT_CODE"
            exit $DEPLOY_EXIT_CODE
          else
            echo "Deployment completed successfully"
          fi
```

### Key Features of This Approach

1. **Sequential Execution**: Jobs run in the specified sequence (Lint → Build → Integration → Build Production → Deploy to Production)

2. **Dependency Chain**: Each job has a `needs` parameter that specifies which job(s) must complete successfully before it can run:
   - `build` needs `lint` to succeed
   - `integration` needs `build` to succeed
   - `build-production` needs `integration` to succeed
   - `deploy-production` needs `build-production` to succeed

3. **Conditional Deployment**: The deployment job only runs on pushes to the master branch, not on pull requests

4. **Badge Status**: Since all jobs are in a single workflow, the badge will accurately reflect the overall status of the pipeline

5. **Failure Handling**: If any job fails, all subsequent jobs will be skipped automatically

### Updating README Badges

After implementing this combined workflow, update the README.md badges to point to the new workflow:

```markdown
[![ShareThings CI/CD Pipeline](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
```

You may also want to add individual job badges if you want to show the status of each step:

```markdown
[![Lint](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=lint)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build and Test](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Integration Tests](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=integration)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Deploy to Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=deploy-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
```

## Implementation Process

1. Create the new workflow file `.github/workflows/share-things-ci-cd.yml` with the content above
2. Test the new workflow to ensure all jobs run correctly
3. Once confirmed working:
   - Delete the individual workflow files completely (do not just disable them)

## Benefits of This Approach

1. **Clear Visualization**: The GitHub Actions UI will show the entire pipeline as a single workflow with multiple jobs
2. **Simplified Management**: All CI/CD configuration is in a single file
3. **Guaranteed Sequence**: Jobs will always run in the specified order
4. **Automatic Skipping**: If an earlier job fails, later jobs are automatically skipped
5. **Accurate Status Reporting**: Badges will accurately reflect the status of the entire pipeline

## Potential Challenges

1. **Longer Workflow File**: The combined file is longer and may be more complex to maintain
2. **Shared Triggers**: All jobs now share the same triggers, which may not be ideal if some jobs should run on different events
3. **Artifact Sharing**: May need to adjust how artifacts are shared between jobs

These challenges are generally outweighed by the benefits of having a properly sequenced workflow.