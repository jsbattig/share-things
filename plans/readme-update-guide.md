# README Update Guide for ShareThings

This guide explains how to update the ShareThings README.md file to include CI/CD badges and improve the project documentation.

## Table of Contents

1. [Adding CI/CD Badges](#adding-cicd-badges)
2. [Updated README Structure](#updated-readme-structure)
3. [Sample README](#sample-readme)

## Adding CI/CD Badges

GitHub Actions badges provide a visual indication of the status of your CI/CD workflows. They should be placed at the top of your README.md file, just below the project title.

### Badge Syntax

The basic syntax for a GitHub Actions badge is:

```markdown
[![Workflow Name](https://github.com/username/repository/actions/workflows/workflow-file.yml/badge.svg)](https://github.com/username/repository/actions/workflows/workflow-file.yml)
```

Replace:
- `Workflow Name` with the name of your workflow (e.g., "Lint", "Build", "Integration Tests")
- `username` with your GitHub username
- `repository` with your repository name
- `workflow-file.yml` with the name of your workflow file

### ShareThings Badges

For the ShareThings project, add these job-specific badges:

```markdown
[![Lint](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=lint)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build and Test](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Integration Tests](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=integration)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Deploy to Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=deploy-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
```

Note the important `job=jobname` parameter in each badge URL, which shows the status of a specific job rather than the overall workflow status.

Make sure to replace `jsbattig` with your actual GitHub username if different.

## Updated README Structure

A well-structured README should include:

1. **Project Title and Badges**: The name of the project and CI/CD status badges
2. **Description**: A brief description of what the project does
3. **Features**: Key features of the application
4. **Architecture**: Overview of the system architecture
5. **Getting Started**: Instructions for installation and setup
6. **Development**: Information for developers
7. **Deployment**: Deployment instructions
8. **Testing**: How to run tests
9. **Security**: Security features and considerations
10. **License**: License information

## Sample README

Here's a sample of what the updated README.md should look like:

```markdown
# ShareThings

[![Lint](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=lint)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build and Test](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Integration Tests](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=integration)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Build Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=build-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)
[![Deploy to Production](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=deploy-production)](https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml)

A real-time content sharing application with end-to-end encryption.

## Features

- Real-time content sharing (text, images, files)
- End-to-end encryption
- Session-based sharing
- Secure passphrase authentication
- Chunking for large files
- WebSocket communication

## Architecture

ShareThings consists of:

1. React frontend with Chakra UI
2. Express backend with Socket.IO
3. End-to-end encryption using Web Crypto API

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker and Docker Compose (for containerized deployment)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/share-things.git
cd share-things
```

2. Install dependencies for both server and client:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running the Application

#### Development Mode

```bash
# Start both client and server in development mode
npm start
```

#### Docker Mode

```bash
# Build and start with Docker
./setup.sh
```

## Development

### Project Structure

```
share-things/
├── client/                 # React frontend
│   ├── public/             # Static assets
│   ├── src/                # Source code
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── pages/          # Page components
│   │   ├── utils/          # Utility functions
│   │   └── ...
│   └── ...
├── server/                 # Express backend
│   ├── src/                # Source code
│   │   ├── domain/         # Domain models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.IO handlers
│   │   └── ...
│   └── ...
└── memory-bank/           # Documentation
    ├── architecture/      # Architecture documentation
    ├── technical/         # Technical documentation
    └── ...
```

### Running Tests

#### Server Tests

```bash
cd server
npm test
```

#### Client Tests

```bash
cd client
npm test
```

#### End-to-End Tests

```bash
# Run all tests
./build-and-test.sh
```

## Deployment

### Docker Deployment

For detailed Docker deployment instructions, see [Docker Deployment Guide](./docker-deployment-guide.md).

### CI/CD

This project uses GitHub Actions for continuous integration and deployment. For more information, see:

- [CI/CD Implementation Plan](./ci-cd-implementation-plan.md)
- [GitHub Actions Guide](./github-actions-guide.md)

## Security

ShareThings implements several security measures:

1. **End-to-end Encryption**: All content is encrypted client-side before transmission
2. **Passphrase Fingerprinting**: Allows verification without exposing the passphrase
3. **Token-based Authentication**: Secure session tokens for request authorization
4. **Session Expiration**: Inactive sessions are automatically expired

## License

This project is licensed under the MIT License - see the LICENSE file for details.
```

## Implementation Steps

1. Open the existing README.md file
2. Add the CI/CD badges below the project title
3. Update the rest of the README as needed, following the structure above
4. Ensure all links to other documentation files are correct
5. Update the GitHub username in the badge URLs and clone instructions
6. Commit and push the changes to GitHub