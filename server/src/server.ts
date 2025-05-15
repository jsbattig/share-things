import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupSocketHandlers } from './socket';
import { setupRoutes } from './routes';
import { SessionManager } from './services/SessionManager';
import { SessionManagerFactory, SessionStorageType } from './services/SessionManagerFactory';
import { PostgreSQLConfig } from './services/PostgreSQLSessionManager';

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

// Determine session storage type
const storageType = (process.env.SESSION_STORAGE_TYPE || 'memory') as SessionStorageType;
console.log(`Using session storage type: ${storageType}`);

// Create session manager
let sessionManager: SessionManager;

if (storageType === 'postgresql') {
  // Configure PostgreSQL
  const postgresConfig: PostgreSQLConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'sharethings',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    ssl: process.env.PG_SSL === 'true'
  };
  
  console.log(`PostgreSQL configuration: ${postgresConfig.host}:${postgresConfig.port}/${postgresConfig.database}`);
  
  // Create session manager with PostgreSQL
  sessionManager = SessionManagerFactory.createSessionManager({
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '600000'), // Default 10 minutes
    storageType: 'postgresql',
    postgresConfig
  });
} else {
  // Create session manager with in-memory storage
  sessionManager = SessionManagerFactory.createSessionManager({
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '600000'), // Default 10 minutes
    storageType: 'memory'
  });
}

// Set up routes
setupRoutes(app);

// Set up socket handlers with session manager
setupSocketHandlers(io, sessionManager);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
server.listen({
  port: Number(PORT),
  host: '0.0.0.0'
}, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server binding to all network interfaces (0.0.0.0) - accessible from external machines`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  
  // Stop session manager
  sessionManager.stop();
  
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Export for testing
export { app, server, io, sessionManager };