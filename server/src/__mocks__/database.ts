// Mock implementation of the database module for testing
export class DatabaseManager {
  private static instance: DatabaseManager;
  public db: Record<string, unknown>;
  private isInitialized = false;

  private constructor() {
    // Initialize mock database methods
    this.db = {
      run: jest.fn().mockReturnThis(),
      get: jest.fn(),
      all: jest.fn(),
      exec: jest.fn(),
      prepare: jest.fn().mockReturnThis(),
      finalize: jest.fn(),
    };
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
    return Promise.resolve();
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    return Promise.resolve();
  }

  getDb() {
    return this.db;
  }
}

export function getDatabaseManager(): DatabaseManager {
  return DatabaseManager.getInstance();
}

// Mock the file system module
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('')),
  unlink: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ isFile: () => true }),
  rm: jest.fn().mockResolvedValue(undefined),
}));

// Mock the path module
jest.mock('path', () => ({
  dirname: jest.fn().mockReturnValue(''),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  resolve: jest.fn().mockImplementation((...args) => args.join('/')),
  basename: jest.fn().mockReturnValue('file.txt'),
  extname: jest.fn().mockReturnValue('.txt'),
}));

// Mock the url module
jest.mock('url', () => ({
  fileURLToPath: jest.fn().mockReturnValue(''),
  pathToFileURL: jest.fn().mockReturnValue('file:///mock/path'),
}));

// Mock the crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue(Buffer.from('mock-random-bytes')),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock-hash'),
  }),
}));
