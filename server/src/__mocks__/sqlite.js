const Database = jest.fn();

const open = jest.fn().mockImplementation(async (options) => {
  const mockDb = {
    exec: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockImplementation((sql, ...params) => {
      // Handle specific queries
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
        return { changes: params.length / 2 }; // Each ? in IN (?, ?) represents one content ID
      }
      return { changes: 0 };
    }),
    get: jest.fn().mockResolvedValue({}),
    all: jest.fn().mockImplementation((sql, ...params) => {
      // Handle cleanup query
      if (sql.includes('SELECT content_id FROM content_metadata')) {
        return [{ content_id: 'cleanup-test' }];
      }
      return [];
    }),
    close: jest.fn().mockResolvedValue(undefined)
  };
  return mockDb;
});

module.exports = {
  Database,
  open,
};
