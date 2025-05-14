# Production Deployment GitHub Action Plan

This document outlines the implementation plan for a GitHub Action that handles production deployment for the ShareThings application. This action will run after all other GitHub Actions succeed and will deploy the application to the production server.

## Requirements

1. The action should run only if all other GitHub Actions succeed
2. It should use the "Rocky" runner (a self-hosted runner on Rocky Linux)
3. It should connect via SSH to the deployment server
4. It should run the `update-server.sh` command on the deployment server
5. It should use the following secrets:
   - `DeploymentServerIP`: The IP address of the deployment server
   - `GHRUserName`: The username for SSH authentication
   - `GHRUserPassword`: The password for SSH authentication

## Implementation

### 1. Create the GitHub Actions Workflow File

Create a new file at `.github/workflows/deploy-production.yml` with the following content:

```yaml
name: Deploy to Production

on:
  workflow_run:
    workflows: ["Lint", "Build", "Dockered Build and Tests", "Build Production"]
    types:
      - completed
    branches:
      - master

jobs:
  deploy:
    # Only run if all dependent workflows succeeded
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    
    # Use the self-hosted Rocky Linux runner
    runs-on: [self-hosted, Rocky]
    
    steps:
      - name: Deploy to production server
        # Use sshpass to handle password authentication
        run: |
          # Install sshpass if not already installed
          if ! command -v sshpass &> /dev/null; then
            sudo yum install -y sshpass
          fi
          
          # Set up SSH connection and run the update script
          sshpass -p "${{ secrets.GHRUserPassword }}" ssh -o StrictHostKeyChecking=no ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd ~/share-things && ./update-server.sh"
```

### 2. Workflow Explanation

1. **Trigger Condition**: The workflow will run only after all specified workflows have completed successfully on the master branch.

2. **Job Condition**: The `if` statement ensures the workflow only runs if all dependent workflows succeeded.

3. **Runner Selection**: The `runs-on` parameter specifies the self-hosted Rocky Linux runner.

4. **Deployment Step**:
   - Installs `sshpass` if not already installed (to handle password authentication)
   - Uses `sshpass` to establish an SSH connection to the deployment server
   - Runs the `update-server.sh` script in the `~/share-things` directory

### 3. Security Considerations

1. **Secret Management**: The workflow uses GitHub repository secrets for sensitive information:
   - `DeploymentServerIP`: The IP address of the deployment server
   - `GHRUserName`: The username for SSH authentication
   - `GHRUserPassword`: The password for SSH authentication

2. **SSH Security**:
   - The `-o StrictHostKeyChecking=no` option is used to avoid host key verification prompts
   - While this is convenient for automation, it does bypass a security check
   - A more secure approach would be to use SSH keys instead of password authentication

### 4. Alternative Approach: SSH Key Authentication

If you prefer to use SSH key authentication instead of password authentication, you can modify the workflow as follows:

```yaml
name: Deploy to Production

on:
  workflow_run:
    workflows: ["Lint", "Build", "Dockered Build and Tests", "Build Production"]
    types:
      - completed
    branches:
      - master

jobs:
  deploy:
    # Only run if all dependent workflows succeeded
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    
    # Use the self-hosted Rocky Linux runner
    runs-on: [self-hosted, Rocky]
    
    steps:
      - name: Set up SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh-keyscan ${{ secrets.DeploymentServerIP }} >> ~/.ssh/known_hosts
      
      - name: Deploy to production server
        run: |
          ssh ${{ secrets.GHRUserName }}@${{ secrets.DeploymentServerIP }} "cd ~/share-things && ./update-server.sh"
```

This approach requires setting up an SSH key pair and adding the private key as a GitHub secret named `SSH_PRIVATE_KEY`.

### 5. Implementation Steps

1. Switch to Code mode to implement the actual workflow file
2. Create the `.github/workflows/deploy-production.yml` file with the content provided above
3. Configure the required secrets in the GitHub repository:
   - `DeploymentServerIP`
   - `GHRUserName`
   - `GHRUserPassword`
4. Ensure the Rocky Linux self-hosted runner is set up and connected to the GitHub repository
5. Push the changes to the repository
6. Verify that the workflow runs correctly after all other workflows succeed

## Workflow Diagram

```mermaid
graph TD
    A[GitHub Push to master] --> B[Lint Workflow]
    A --> C[Build Workflow]
    A --> D[Integration Workflow]
    A --> E[Build Production Workflow]
    
    B --> F{All Workflows Succeeded?}
    C --> F
    D --> F
    E --> F
    
    F -->|Yes| G[Deploy to Production Workflow]
    F -->|No| H[Deployment Skipped]
    
    G --> I[Connect to Deployment Server via SSH]
    I --> J[Run update-server.sh]
    J --> K[Deployment Complete]