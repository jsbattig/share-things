import { Express, Request, Response } from 'express';

/**
 * Sets up Express routes
 * @param app Express application
 */
export function setupRoutes(app: Express): void {
  // API routes
  app.use('/api', apiRoutes());
  
  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });
  
  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Error handler
  app.use((err: Error, req: Request, res: Response, next: Function) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
}

/**
 * API routes
 */
function apiRoutes() {
  const router = require('express').Router();
  
  // Session endpoints
  router.get('/sessions', (req: Request, res: Response) => {
    // This would typically be protected and only return sessions the user has access to
    // For now, just return a placeholder response
    res.json({ 
      message: 'This endpoint would return active sessions',
      note: 'For security reasons, this is just a placeholder'
    });
  });
  
  // Version endpoint
  router.get('/version', (req: Request, res: Response) => {
    res.json({ 
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  return router;
}