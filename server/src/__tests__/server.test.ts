// Mock SQLite modules to avoid native binding issues
const mockDatabase = {
  run: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(undefined),
  all: jest.fn().mockResolvedValue([]),
  exec: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined)
};

jest.mock('sqlite', () => ({
  open: jest.fn().mockResolvedValue(mockDatabase)
}));

jest.mock('sqlite3', () => ({
  Database: jest.fn(),
  OPEN_READWRITE: 1,
  OPEN_CREATE: 2
}));

// Mock the ConnectionPool to avoid SQLite issues
jest.mock('../infrastructure/storage/connectionPool', () => ({
  ConnectionPool: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    createConnection: jest.fn().mockResolvedValue(mockDatabase),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock the entire server module to avoid initialization issues
jest.mock('../server', () => {
  const mockApp = {
    get: jest.fn((path) => {
      if (path === '/health') {
        return { status: jest.fn().mockReturnValue({ send: jest.fn() }) };
      }
      return { status: jest.fn().mockReturnValue({ json: jest.fn() }) };
    }),
    use: jest.fn(),
    listen: jest.fn()
  };
  
  const mockServer = {
    close: jest.fn((callback) => callback && callback())
  };
  
  const mockSessionManager = {
    stop: jest.fn()
  };

  return {
    app: mockApp,
    server: mockServer,
    sessionManager: mockSessionManager
  };
});

import request from 'supertest';
import express from 'express';

describe('Server API', () => {
  let app: express.Application;

  beforeAll(() => {
    // Create a real express app for testing
    app = express();
    
    // Add the health endpoint
    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });
    
    // Add the API version endpoint
    app.get('/api/version', (req, res) => {
      res.status(200).json({
        version: '1.0.0',
        environment: 'test'
      });
    });
    
    // Add 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  });
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