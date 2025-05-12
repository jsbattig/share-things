# GitHub Actions Guide for ShareThings

This guide provides detailed instructions for setting up and using GitHub Actions with the ShareThings application. It covers how to configure the repository, understand the workflow files, and interpret the results.

## Table of Contents

1. [Introduction to GitHub Actions](#introduction-to-github-actions)
2. [Repository Setup](#repository-setup)
3. [Workflow Configuration](#workflow-configuration)
4. [Understanding the Results](#understanding-the-results)
5. [Troubleshooting](#troubleshooting)
6. [Best Practices](#best-practices)

## Introduction to GitHub Actions

GitHub Actions is a CI/CD (Continuous Integration/Continuous Deployment) platform that allows you to automate your build, test, and deployment pipeline. It provides workflows that can build and test every pull request to your repository, or deploy merged pull requests to production.

For the ShareThings application, we're using GitHub Actions to:

1. Run linting checks on the code
2. Build the application and run unit tests
3. Run integration and end-to-end tests
4. Display the status of these checks using badges in the README

## Repository Setup

### 1. Create the Workflow Directory

GitHub Actions workflows are stored in the `.github/workflows` directory in your repository. Create this directory if it doesn't already exist:

```bash
mkdir -p .github/workflows
```

### 2. Add Workflow Files

Create the three workflow files in the `.github/workflows` directory:

- `lint.yml`: For linting checks
- `build.yml`: For building and unit testing
- `integration.yml`: For integration and end-to-end testing

The content of these files is provided in the [CI/CD Implementation Plan](./ci-cd-implementation-plan.md).

### 3. Configure Repository Secrets

If your workflows need access to sensitive information (like API keys or deployment credentials), you can add them as secrets in your GitHub repository:

1. Go to your repository on GitHub
2. Click on "Settings"
3. Click on "Secrets and variables" in the left sidebar
4. Click on "Actions"
5. Click on "New repository secret"
6. Add your secrets as needed

For the ShareThings application, you might need secrets like:

- `DOCKER_USERNAME` and `DOCKER_PASSWORD` for pushing Docker images
- `DEPLOYMENT_SSH_KEY` for deploying to a server

### 4. Enable GitHub Actions

GitHub Actions should be enabled by default for your repository. If not:

1. Go to your repository on GitHub
2. Click on "Settings"
3. Click on "Actions" in the left sidebar
4. Select "Allow all actions and reusable workflows"
5. Click "Save"

## Workflow Configuration

### Lint Workflow

The `lint.yml` workflow runs linting checks on both the client and server code. It:

1. Checks out the repository
2. Sets up Node.js
3. Installs dependencies
4. Runs the lint scripts for both client and server

This workflow helps ensure code quality and consistency.

### Build Workflow

The `build.yml` workflow builds the application and runs unit tests. It:

1. Checks out the repository
2. Sets up Node.js
3. Installs dependencies
4. Builds the server and client
5. Runs unit tests for both

This workflow helps catch build errors and unit test failures early.

### Integration Workflow

The `integration.yml` workflow runs integration and end-to-end tests using Docker. It:

1. Checks out the repository
2. Sets up Docker Buildx
3. Runs the `build-and-test.sh` script
4. Uploads test results as artifacts

This workflow helps ensure that the application works correctly as a whole.

## Understanding the Results

### Workflow Status

Each workflow run will have one of the following statuses:

- **Success**: All steps completed successfully
- **Failure**: One or more steps failed
- **Cancelled**: The workflow was cancelled
- **Skipped**: The workflow was skipped due to conditions not being met

You can view the status of your workflows in several places:

1. On the "Actions" tab of your repository
2. In pull requests, where the status is shown next to each commit
3. In the README, via the status badges

### Status Badges

The status badges in the README show the current status of each workflow on the default branch (usually `main`). They provide a quick visual indication of the health of your codebase.

The badges are linked to the workflow runs, so you can click on them to see more details.

### Workflow Logs

For more detailed information about a workflow run:

1. Go to the "Actions" tab of your repository
2. Click on the workflow run you want to examine
3. Click on the job you want to see
4. Expand the steps to see the logs

The logs contain detailed output from each step, which can be helpful for troubleshooting.

### Test Results

For the integration workflow, test results are uploaded as artifacts. To view them:

1. Go to the workflow run
2. Scroll down to the "Artifacts" section
3. Download the "test-results" artifact
4. Extract and view the test reports

## Troubleshooting

### Common Issues

1. **Workflow fails with "Command not found"**:
   - Check that the script has the correct path
   - Ensure the script is executable (`chmod +x`)

2. **Docker-related failures**:
   - Ensure Docker is properly set up in the workflow
   - Check that Docker Compose files are valid

3. **Test failures**:
   - Examine the test logs to identify the failing tests
   - Check if the failures are consistent or intermittent

### Debugging Workflows

To debug GitHub Actions workflows:

1. Add debug logging:
   ```yaml
   - name: Debug info
     run: |
       echo "Working directory: $(pwd)"
       ls -la
       env
   ```

2. Enable step debug logging by setting the secret `ACTIONS_STEP_DEBUG` to `true`

3. Use the `actions/upload-artifact` action to save files for inspection

## Best Practices

1. **Keep workflows focused**: Each workflow should have a specific purpose

2. **Use caching**: Cache dependencies to speed up workflows
   ```yaml
   - uses: actions/cache@v3
     with:
       path: ~/.npm
       key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
   ```

3. **Use matrix builds**: Test across multiple environments
   ```yaml
   strategy:
     matrix:
       node-version: [16.x, 18.x, 20.x]
   ```

4. **Set up timeouts**: Prevent workflows from running too long
   ```yaml
   timeout-minutes: 10
   ```

5. **Use concise names**: Make workflow and step names clear and descriptive

6. **Add comments**: Explain complex steps or configurations

7. **Regularly review and update**: Keep workflows up to date with your project's needs

By following these practices, you'll have a robust CI/CD pipeline that helps maintain code quality and catch issues early.