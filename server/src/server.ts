import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Initialize crypto-js polyfill for Node.js environment BEFORE any other imports
import './__mocks__/crypto-js';

import { setupSocketHandlers } from './socket';
import { setupRoutes } from './routes';
import { SessionManager } from './services/SessionManager';
import { FileSystemChunkStorage } from './infrastructure/storage/FileSystemChunkStorage';
import { storageConfig } from './infrastructure/config/storage.config';

// Load environment variables
dotenv.config();

// Set NODE_ENV if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}
console.log(`Running in ${process.env.NODE_ENV} mode`);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // Reduced from 120000 to 60000 (1 minute) for faster timeout detection
  pingInterval: 10000, // Reduced from 15000 to 10000 (10 seconds) for more responsive connection status
  connectTimeout: 20000, // Reduced from 60000 to 20000 (20 seconds) for faster connection establishment
  maxHttpBufferSize: 1e8, // 100MB
  allowUpgrades: true, // Allow transport upgrades for better performance
  upgradeTimeout: 10000, // 10 seconds timeout for upgrades
  perMessageDeflate: {
    threshold: 1024 // Only compress messages larger than 1KB
  }
});

// Get database path from environment or use default
const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'sessions.db');
console.log(`Using SQLite database at: ${dbPath}`);

// Create session manager with SQLite storage
const sessionManager = new SessionManager({
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '600000'), // Default 10 minutes
  dbPath
});

// Create shared chunk storage instance
const chunkStorage = new FileSystemChunkStorage({
  storagePath: storageConfig.storagePath
});

// Set up routes with dependencies
setupRoutes(app, sessionManager, chunkStorage);

// Health check endpoint
app.get('/health', (req, res) => {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '0.1.0',
    memory: process.memoryUsage()
  };
  res.status(200).json(healthData);
});

// Initialize session manager and start server
async function startServer() {
  try {
    // Initialize session manager
    await sessionManager.initialize();
    
    // Initialize chunk storage
    await chunkStorage.initialize();
    
    // Set up socket handlers with session manager and chunk storage
    const { cleanup: cleanupSocketHandlers } = setupSocketHandlers(io, sessionManager, chunkStorage);
    
    // Start server
    server.listen({
      port: Number(PORT),
      host: '0.0.0.0'
    }, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server binding to all network interfaces (0.0.0.0) - accessible from external machines`);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      
      // Stop session manager
      await sessionManager.stop();
      
      // Clean up socket handlers and storage
      await cleanupSocketHandlers();
      
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { app, server, io, sessionManager };