import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { setupSocketHandlers } from './socket';
import { setupRoutes } from './routes';
import { SessionManager } from './services/SessionManager';

// Load environment variables
dotenv.config();

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
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8 // 100MB
});

// Get database path from environment or use default
const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'sessions.db');
console.log(`Using SQLite database at: ${dbPath}`);

// Create session manager with SQLite storage
const sessionManager = new SessionManager({
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '600000'), // Default 10 minutes
  dbPath
});

// Set up routes
setupRoutes(app);

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
    
    // Set up socket handlers with session manager
    setupSocketHandlers(io, sessionManager);
    
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