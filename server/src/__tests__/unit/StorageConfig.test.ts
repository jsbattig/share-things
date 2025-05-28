import { storageConfig, validateConfig } from '../../infrastructure/config/storage.config';

describe('StorageConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  it('should have default values', () => {
    expect(storageConfig.storagePath).toBe('./data/sessions');
    expect(storageConfig.maxItemsPerSession).toBe(20);
    expect(storageConfig.maxItemsToSend).toBe(5);
    expect(storageConfig.cleanupInterval).toBe(3600000);
  });

  it('should use environment variables when set', () => {
    process.env.CHUNK_STORAGE_PATH = '/custom/path';
    process.env.MAX_ITEMS_PER_SESSION = '50';
    process.env.MAX_ITEMS_TO_SEND = '10';
    process.env.CLEANUP_INTERVAL = '60000';

    // Reload the config to get the new environment variables
    const testConfig = jest.requireActual('../../infrastructure/config/storage.config');
    
    expect(testConfig.storageConfig.storagePath).toBe('/custom/path');
    expect(testConfig.storageConfig.maxItemsPerSession).toBe(50);
    expect(testConfig.storageConfig.maxItemsToSend).toBe(10);
    expect(testConfig.storageConfig.cleanupInterval).toBe(60000);
  });

  it('should validate valid configuration', () => {
    const validConfig = {
      storagePath: '/path',
      maxItemsPerSession: 1,
      maxItemsToSend: 1,
      cleanupInterval: 1000
    };

    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it('should throw error for invalid maxItemsPerSession', () => {
    const invalidConfig = {
      storagePath: '/path',
      maxItemsPerSession: 0,
      maxItemsToSend: 1,
      cleanupInterval: 1000
    };

    expect(() => validateConfig(invalidConfig)).toThrow('MAX_ITEMS_PER_SESSION must be greater than 0');
  });

  it('should throw error for invalid maxItemsToSend', () => {
    const invalidConfig = {
      storagePath: '/path',
      maxItemsPerSession: 10,
      maxItemsToSend: 0,
      cleanupInterval: 1000
    };

    expect(() => validateConfig(invalidConfig)).toThrow('MAX_ITEMS_TO_SEND must be greater than 0');
  });

  it('should throw error for invalid cleanupInterval', () => {
    const invalidConfig = {
      storagePath: '/path',
      maxItemsPerSession: 10,
      maxItemsToSend: 5,
      cleanupInterval: 0
    };

    expect(() => validateConfig(invalidConfig)).toThrow('CLEANUP_INTERVAL must be greater than 0');
  });
});
