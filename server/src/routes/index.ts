import { Express, Request, Response, Router } from 'express';
import { FileSystemChunkStorage } from '../infrastructure/storage/FileSystemChunkStorage';
import { SessionManager } from '../services/SessionManager';

/**
 * Sets up Express routes
 * @param app Express application
 * @param sessionManager Session manager instance
 * @param chunkStorage Chunk storage instance
 */
export function setupRoutes(app: Express, sessionManager?: SessionManager, chunkStorage?: FileSystemChunkStorage): void {
  // API routes
  app.use('/api', apiRoutes(sessionManager, chunkStorage));
  
  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });
  
  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Error handler
  app.use((err: Error, req: Request, res: Response) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
}

/**
 * API routes
 */
function apiRoutes(sessionManager?: SessionManager, chunkStorage?: FileSystemChunkStorage): Router {
  const router = Router();
  
  // Download endpoint for large files
  router.get('/download/:contentId', async (req: Request, res: Response) => {
    try {
      const { contentId } = req.params;
      const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string;
      
      if (!sessionManager || !chunkStorage) {
        return res.status(500).json({ error: 'Server not properly configured' });
      }
      
      if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Get content metadata
      const contentMeta = await chunkStorage.getContentMetadata(contentId);
      if (!contentMeta) {
        return res.status(404).json({ error: 'Content not found' });
      }
      
      // Verify this is a large file
      if (!contentMeta.isLargeFile) {
        return res.status(400).json({ error: 'This endpoint is only for large files' });
      }
      
      // TODO: Verify user has access to the session
      // For now, we'll skip session validation but this should be implemented
      
      // Set headers for file download
      const fileName = contentMeta.additionalMetadata ?
        JSON.parse(contentMeta.additionalMetadata).fileName || `content-${contentId.substring(0, 8)}` :
        `content-${contentId.substring(0, 8)}`;
        
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', contentMeta.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', contentMeta.totalSize.toString());
      
      console.log(`[DOWNLOAD] Streaming large file ${contentId} (${contentMeta.totalSize} bytes) to client`);
      
      // Stream chunks directly to response
      await chunkStorage.streamContentForDownload(contentId, async (chunk) => {
        // Write chunk to response stream
        res.write(chunk);
      });
      
      res.end();
      console.log(`[DOWNLOAD] Completed streaming file ${contentId}`);
      
    } catch (error) {
      console.error('Error in download endpoint:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  });
  
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