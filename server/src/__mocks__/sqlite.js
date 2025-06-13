// Create a mock database instance with all required methods
const createMockDatabase = () => ({
  exec: jest.fn().mockResolvedValue(undefined),
  run: jest.fn().mockImplementation(function(sql, paramsOrCallback, callback) {
    // Handle both (sql, params, callback) and (sql, callback) patterns
    const actualCallback = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    
    // Simulate async behavior
    if (actualCallback) {
      process.nextTick(() => actualCallback(null));
    }
    
    // Return result for synchronous usage
    if (sql.includes('INSERT INTO content_metadata')) {
      return { lastID: 1, changes: 1 };
    }
    if (sql.includes('INSERT INTO chunk_metadata')) {
      return { lastID: 1, changes: 1 };
    }
    if (sql.includes('INSERT INTO sessions')) {
      return { lastID: 1, changes: 1 };
    }
    if (sql.includes('UPDATE content_metadata')) {
      return { changes: 1 };
    }
    if (sql.includes('DELETE FROM content_metadata')) {
      return { changes: Array.isArray(paramsOrCallback) ? paramsOrCallback.length / 2 : 0 };
    }
    return { changes: 0 };
  }),
  get: jest.fn().mockImplementation((sql, paramsOrCallback, callback) => {
    // Handle both (sql, params, callback) and (sql, callback) patterns
    const actualCallback = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    
    // Simulate async behavior
    if (actualCallback) {
      process.nextTick(() => {
        if (sql.includes('SELECT MAX(version)')) {
          actualCallback(null, { version: 0 });
        } else {
          actualCallback(null, undefined);
        }
      });
    }
    
    return {};
  }),
  all: jest.fn().mockImplementation((sql, paramsOrCallback, callback) => {
    // Handle both (sql, params, callback) and (sql, callback) patterns
    const actualCallback = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    
    // Simulate async behavior
    if (actualCallback) {
      process.nextTick(() => {
        if (sql.includes('SELECT content_id FROM content_metadata')) {
          actualCallback(null, [{ content_id: 'cleanup-test' }]);
        } else {
          actualCallback(null, []);
        }
      });
    }
    
    return [];
  }),
  close: jest.fn().mockImplementation((callback) => {
    // Simulate async behavior
    if (callback) {
      process.nextTick(() => callback(null));
    }
  })
});

// Mock Database constructor
const Database = jest.fn().mockImplementation((path, mode, callback) => {
  const mockDb = createMockDatabase();
  
  // Handle different constructor patterns
  if (typeof mode === 'function') {
    // (path, callback) pattern
    process.nextTick(() => mode(null));
  } else if (typeof callback === 'function') {
    // (path, mode, callback) pattern
    process.nextTick(() => callback(null));
  }
  
  return mockDb;
});

const open = jest.fn().mockImplementation(async (options) => {
  return createMockDatabase();
});

module.exports = {
  Database,
  open,
  OPEN_READWRITE: 1,
  OPEN_CREATE: 2,
};
