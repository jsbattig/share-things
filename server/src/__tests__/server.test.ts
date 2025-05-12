import request from 'supertest';
import { app, server, sessionManager } from '../server';

// Close the server after all tests
afterAll((done) => {
  // Stop the session manager
  sessionManager.stop();
  
  // Close the server
  server.close(() => {
    done();
  });
});

describe('Server API', () => {
  // Test health endpoint
  test('GET /health should return 200 OK', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });
  
  // Test 404 for non-existent route
  test('GET /non-existent-route should return 404', async () => {
    const response = await request(app).get('/non-existent-route');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
  });
  
  // Test API version endpoint
  test('GET /api/version should return version info', async () => {
    const response = await request(app).get('/api/version');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('environment');
  });
});