#!/usr/bin/env node

/**
 * Static file server for ShareThings frontend
 * This replaces Nginx with a simple Node.js Express server
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { createServer } from 'net';

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

const app = express();

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory where static files are located
const STATIC_DIR = process.env.STATIC_DIR || '/app/public';
const PORT = process.env.PORT || 15000;

// Check if the port is already in use (this will be caught by the error handler if it fails)
const portCheckServer = createServer();
portCheckServer.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ERROR: Port ${PORT} is already in use by another process`);
    process.exit(1);
  }
});
portCheckServer.once('listening', () => {
  portCheckServer.close();
  console.log(`Port ${PORT} is available`);
});
portCheckServer.listen(PORT, '0.0.0.0');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Add compression for better performance
app.use(compression());

// Set cache headers for static assets
app.use('/assets', (req, res, next) => {
  // Cache assets for 1 year
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  next();
});

// Serve static files
app.use(express.static(STATIC_DIR));

// SPA routing - serve index.html for any non-file routes
app.get('*', (req, res) => {
  // No cache for HTML files
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Start server with error handling
// Make sure we have a valid port
if (!PORT || isNaN(parseInt(PORT))) {
  console.error(`ERROR: Invalid PORT value: ${PORT}`);
  process.exit(1);
}

// Make sure we have a valid static directory
if (!STATIC_DIR) {
  console.error('ERROR: No STATIC_DIR specified');
  process.exit(1);
}

try {
  // Create a server with a timeout to prevent hanging
  const server = app.listen(PORT, '0.0.0.0', () => {
    // Always log something meaningful to avoid empty console.log issues
    console.log(`[${new Date().toISOString()}] Static file server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Serving files from ${STATIC_DIR}`);
    
    // Log system information for debugging
    console.log(`[${new Date().toISOString()}] Node.js version: ${process.version}`);
    console.log(`[${new Date().toISOString()}] Platform: ${process.platform}`);
  });
  
  // Set a timeout to prevent the server from hanging indefinitely
  server.timeout = 30000; // 30 seconds
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[${new Date().toISOString()}] ERROR: Port ${PORT} is already in use by another process`);
    } else {
      console.error(`[${new Date().toISOString()}] Server error:`, err);
    }
    process.exit(1);
  });
} catch (err) {
  console.error(`[${new Date().toISOString()}] Failed to start server:`, err);
  process.exit(1);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});