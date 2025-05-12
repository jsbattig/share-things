import { app, server } from './server';

// This file serves as the entry point for the application
// The actual server setup is in server.ts

// Log startup
console.log('Starting ShareThings server...');

// Export for testing
export { app, server };