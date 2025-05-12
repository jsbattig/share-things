# ShareThings

[![Lint](https://github.com/yourusername/share-things/actions/workflows/lint.yml/badge.svg)](https://github.com/yourusername/share-things/actions/workflows/lint.yml)
[![Build](https://github.com/yourusername/share-things/actions/workflows/build.yml/badge.svg)](https://github.com/yourusername/share-things/actions/workflows/build.yml)
[![Integration Tests](https://github.com/yourusername/share-things/actions/workflows/integration.yml/badge.svg)](https://github.com/yourusername/share-things/actions/workflows/integration.yml)

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

- Node.js 16+
- npm or yarn

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

1. Start the server:

```bash
cd server
npm run dev
```

2. In a separate terminal, start the client:

```bash
cd client
npm run dev
```

3. Open your browser and navigate to http://localhost:3000

### Running as Linux Services

To run the ShareThings server and client applications as services in a Linux environment (using systemd), follow these steps:

#### Prerequisites

- Linux system with systemd (Ubuntu, Debian, CentOS, etc.)
- Node.js 16+ installed
- Application code deployed to the server

#### Server Service Setup

1. Create a systemd service file for the server:

```bash
sudo nano /etc/systemd/system/sharethings-server.service
```

2. Add the following configuration (adjust paths and user as needed):

```
[Unit]
Description=ShareThings Server
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/share-things/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production
# Add any other environment variables needed
# Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

3. Build the server application:

```bash
cd /path/to/share-things/server
npm install
npm run build
```

4. Create a .env file with your production settings:

```bash
cp .env.example .env
nano .env
```

5. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sharethings-server
sudo systemctl start sharethings-server
```

#### Client Service Setup

For the client application, you have two options:

**Option 1: Build and serve as static files (Recommended)**

1. Build the client application:

```bash
cd /path/to/share-things/client
npm install
npm run build
```

2. Serve the built files using Nginx or Apache. Example Nginx configuration:

```
server {
    listen 80;
    server_name your-domain.com;
    
    root /path/to/share-things/client/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Option 2: Run the development server as a service**

1. Create a systemd service file for the client:

```bash
sudo nano /etc/systemd/system/sharethings-client.service
```

2. Add the following configuration:

```
[Unit]
Description=ShareThings Client
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/share-things/client
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0
Restart=on-failure
Environment=NODE_ENV=production
# Add any other environment variables needed

[Install]
WantedBy=multi-user.target
```

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sharethings-client
sudo systemctl start sharethings-client
```

#### Managing the Services

**Check service status:**

```bash
sudo systemctl status sharethings-server
sudo systemctl status sharethings-client
```

**Restart services:**

```bash
sudo systemctl restart sharethings-server
sudo systemctl restart sharethings-client
```

**Stop services:**

```bash
sudo systemctl stop sharethings-server
sudo systemctl stop sharethings-client
```

**View logs:**

```bash
sudo journalctl -u sharethings-server -f
sudo journalctl -u sharethings-client -f
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

## Docker Deployment

ShareThings can be deployed using Docker for both development and production environments.

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/share-things.git
cd share-things

# Run the setup script
chmod +x setup.sh
./setup.sh
```

For detailed Docker deployment instructions, see [Docker Deployment Guide](./plans/docker-deployment-guide.md).

## Continuous Integration and Deployment

ShareThings uses GitHub Actions for continuous integration and deployment:

- **Lint**: Runs linting checks on the codebase
- **Build**: Builds the application and runs unit tests
- **Integration Tests**: Runs functional and end-to-end tests

To run all tests locally:

```bash
# Make the script executable
chmod +x build-and-test.sh

# Run the tests
./build-and-test.sh
```

For more information, see [CI/CD Implementation Plan](./plans/ci-cd-implementation-plan.md).

## Security

ShareThings implements several security measures:

1. **End-to-end Encryption**: All content is encrypted client-side before transmission
2. **Passphrase Fingerprinting**: Allows verification without exposing the passphrase
3. **Token-based Authentication**: Secure session tokens for request authorization
4. **Session Expiration**: Inactive sessions are automatically expired

## License

This project is licensed under the MIT License - see the LICENSE file for details.