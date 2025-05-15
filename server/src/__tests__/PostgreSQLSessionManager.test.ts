import { PostgreSQLSessionManager } from '../services/PostgreSQLSessionManager';
import { SessionManagerFactory } from '../services/SessionManagerFactory';
import { Socket } from 'socket.io';
import { PassphraseFingerprint } from '../services/SessionManager';

// Mock pg module
jest.mock('pg', () => {
  const mockQuery = jest.fn().mockImplementation((query) => {
    // Mock schema_version exists query
    if (query.includes('schema_version')) {
      return Promise.resolve({ rows: [{ exists: false }] });
    }
    
    // Mock version query
    if (query.includes('SELECT version')) {
      return Promise.resolve({ rows: [{ version: 0 }] });
    }
    
    // Mock session query
    if (query.includes('SELECT created_at, last_activity, fingerprint_iv, fingerprint_data')) {
      return Promise.resolve({ rows: [] });
    }
    
    // Default mock response
    return Promise.resolve({ rows: [] });
  });
  
  const mockClient = {
    query: mockQuery,
    release: jest.fn(),
  };
  
  const mockConnect = jest.fn().mockResolvedValue(mockClient);
  
  const mockPool = {
    connect: mockConnect,
    query: mockQuery,
    end: jest.fn().mockResolvedValue(undefined),
  };
  
  return {
    Pool: jest.fn(() => mockPool),
  };
});

// Mock Socket.io Socket
const mockSocket = {
  id: 'socket-id',
  data: {},
  emit: jest.fn(),
  on: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  disconnect: jest.fn(),
} as unknown as Socket;

describe('PostgreSQLSessionManager', () => {
  let sessionManager: PostgreSQLSessionManager;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create session manager with test config
    sessionManager = SessionManagerFactory.createSessionManager({
      storageType: 'postgresql',
      postgresConfig: {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }
    }) as PostgreSQLSessionManager;
  });
  
  afterEach(() => {
    // Stop session manager
    sessionManager.stop();
  });
  
  test('should initialize database schema', async () => {
    // This is implicitly tested in beforeEach
    // The constructor calls initialize() which sets up the schema
    
    // Get the mocked Pool
    const pgModule = jest.requireMock('pg');
    
    // Verify Pool was constructed with correct config
    expect(pgModule.Pool).toHaveBeenCalledWith({
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_password'
    });
    
    // Verify connect was called
    expect(pgModule.Pool().connect).toHaveBeenCalled();
  });
  
  test('should create a new session', async () => {
    // Create test data
    const sessionId = 'test-session';
    const clientId = 'test-client';
    const clientName = 'Test Client';
    const fingerprint: PassphraseFingerprint = {
      iv: [1, 2, 3],
      data: [4, 5, 6]
    };
    
    // Join session
    const result = await sessionManager.joinSession(
      sessionId,
      fingerprint,
      clientId,
      clientName,
      mockSocket
    );
    
    // Verify result
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    
    // Verify session was created
    const session = sessionManager.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(sessionId);
    
    // Verify client was added to session
    expect(session?.clients.has(clientId)).toBe(true);
    expect(session?.clients.get(clientId)?.clientName).toBe(clientName);
  });
  
  test('should validate session token', async () => {
    // Create test data
    const sessionId = 'test-session';
    const clientId = 'test-client';
    const clientName = 'Test Client';
    const fingerprint: PassphraseFingerprint = {
      iv: [1, 2, 3],
      data: [4, 5, 6]
    };
    
    // Join session
    const result = await sessionManager.joinSession(
      sessionId,
      fingerprint,
      clientId,
      clientName,
      mockSocket
    );
    
    // Verify token validation
    expect(sessionManager.validateSessionToken(clientId, result.token || '')).toBe(true);
    expect(sessionManager.validateSessionToken(clientId, 'invalid-token')).toBe(false);
    expect(sessionManager.validateSessionToken('invalid-client', result.token || '')).toBe(false);
  });
  
  test('should remove client from session', async () => {
    // Create test data
    const sessionId = 'test-session';
    const clientId = 'test-client';
    const clientName = 'Test Client';
    const fingerprint: PassphraseFingerprint = {
      iv: [1, 2, 3],
      data: [4, 5, 6]
    };
    
    // Join session
    await sessionManager.joinSession(
      sessionId,
      fingerprint,
      clientId,
      clientName,
      mockSocket
    );
    
    // Verify session was created
    const session = sessionManager.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.clients.has(clientId)).toBe(true);
    
    // Remove client
    const result = sessionManager.removeClientFromSession(sessionId, clientId);
    
    // Verify result
    expect(result).toBe(true);
    
    // Verify client was removed
    expect(session?.clients.has(clientId)).toBe(false);
  });
  
  test('should handle database connection errors gracefully', async () => {
    // Mock pg Pool to throw an error
    const pgModule = jest.requireMock('pg');
    const mockPool = pgModule.Pool();
    const originalConnect = mockPool.connect;
    mockPool.connect = jest.fn().mockRejectedValueOnce(new Error('Connection error'));
    
    // Create test data
    const sessionId = 'test-session';
    const clientId = 'test-client';
    const clientName = 'Test Client';
    const fingerprint: PassphraseFingerprint = {
      iv: [1, 2, 3],
      data: [4, 5, 6]
    };
    
    // Join session (should still work despite DB error)
    const result = await sessionManager.joinSession(
      sessionId,
      fingerprint,
      clientId,
      clientName,
      mockSocket
    );
    
    // Restore original connect method
    mockPool.connect = originalConnect;
    
    // Verify result (should fall back to in-memory)
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    
    // Verify session was created in memory
    const session = sessionManager.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(sessionId);
  });
  
  test('should verify fingerprint correctly', async () => {
    // Create test data
    const sessionId = 'test-session';
    const clientId1 = 'test-client-1';
    const clientId2 = 'test-client-2';
    const clientName = 'Test Client';
    const correctFingerprint: PassphraseFingerprint = {
      iv: [1, 2, 3],
      data: [4, 5, 6]
    };
    const incorrectFingerprint: PassphraseFingerprint = {
      iv: [7, 8, 9],
      data: [10, 11, 12]
    };
    
    // Join session with correct fingerprint
    const result1 = await sessionManager.joinSession(
      sessionId,
      correctFingerprint,
      clientId1,
      clientName,
      mockSocket
    );
    
    // Verify result
    expect(result1.success).toBe(true);
    
    // Try to join with incorrect fingerprint
    const result2 = await sessionManager.joinSession(
      sessionId,
      incorrectFingerprint,
      clientId2,
      clientName,
      mockSocket
    );
    
    // Verify result
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('Invalid passphrase');
  });
});