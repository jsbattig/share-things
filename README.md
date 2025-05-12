# ShareThings

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

## Security

ShareThings implements several security measures:

1. **End-to-end Encryption**: All content is encrypted client-side before transmission
2. **Passphrase Fingerprinting**: Allows verification without exposing the passphrase
3. **Token-based Authentication**: Secure session tokens for request authorization
4. **Session Expiration**: Inactive sessions are automatically expired

## License

This project is licensed under the MIT License - see the LICENSE file for details.