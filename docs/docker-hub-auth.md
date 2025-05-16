# Docker Hub Authentication for GitHub Actions

This guide explains how to set up Docker Hub authentication for GitHub Actions to avoid rate limits when pulling images.

## Prerequisites

- A Docker Hub account (free or paid)
- Access to your GitHub repository settings

## Step 1: Create a Docker Hub Access Token

1. Log in to your Docker Hub account at [hub.docker.com](https://hub.docker.com/)
2. Click on your username in the top-right corner and select "Account Settings"
3. In the left sidebar, click on "Security"
4. Under "Access Tokens", click "New Access Token"
5. Give your token a descriptive name (e.g., "GitHub Actions")
6. Select "Read-only" permissions (since we only need to pull images)
7. Click "Generate" to create the token
8. **Important**: Copy the token immediately, as you won't be able to see it again

## Step 2: Add Docker Hub Credentials to GitHub Secrets

1. Go to your GitHub repository
2. Click on "Settings" > "Secrets and variables" > "Actions"
3. Click "New repository secret"
4. Add the following secrets:
   - Name: `DOCKERHUB_USERNAME`
   - Value: Your Docker Hub username
5. Click "Add secret"
6. Click "New repository secret" again
7. Add the following secret:
   - Name: `DOCKERHUB_TOKEN`
   - Value: The access token you created in Step 1
8. Click "Add secret"

## Step 3: Verify the Setup

The GitHub Actions workflow is already configured to use these secrets. When you push changes to the repository, the workflow will automatically use your Docker Hub credentials to authenticate before pulling images.

You can verify that authentication is working by checking the logs of the GitHub Actions workflow. Look for messages like:

```
Docker Hub credentials found. Configuring authentication...
Docker Hub authentication configured successfully.
```

## Troubleshooting

If you encounter issues with Docker Hub authentication:

1. Check that the secrets are correctly set in your GitHub repository
2. Verify that your Docker Hub access token is still valid
3. Check the GitHub Actions logs for any error messages related to Docker Hub authentication

For more information, see the [Docker Hub Rate Limits documentation](https://docs.docker.com/docker-hub/download-rate-limit/).