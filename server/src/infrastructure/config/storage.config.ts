/**
 * Default configuration for chunk storage
 */
interface StorageConfig {
  /**
   * Base path for storing chunks
   * @default './data/sessions'
   */
  storagePath: string;

  /**
   * Maximum number of content items to keep per session
   * @default 20
   */
  maxItemsPerSession: number;

  /**
   * Maximum number of items to send to newly connected clients
   * @default 5
   */
  maxItemsToSend: number;

  /**
   * Interval for cleanup in milliseconds
   * @default 3600000 (1 hour)
   */
  cleanupInterval: number;
}

/**
 * Get storage configuration from environment variables with defaults
 */
export function getStorageConfig(): StorageConfig {
  return {
    storagePath: process.env.CHUNK_STORAGE_PATH || './data/sessions',
    maxItemsPerSession: parseInt(process.env.MAX_ITEMS_PER_SESSION || '20', 10),
    maxItemsToSend: parseInt(process.env.MAX_ITEMS_TO_SEND || '5', 10),
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600000', 10)
  };
}

/**
 * Validate storage configuration
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: StorageConfig): void {
  if (config.maxItemsPerSession <= 0) {
    throw new Error('MAX_ITEMS_PER_SESSION must be greater than 0');
  }
  
  if (config.maxItemsToSend <= 0) {
    throw new Error('MAX_ITEMS_TO_SEND must be greater than 0');
  }
  
  if (config.cleanupInterval <= 0) {
    throw new Error('CLEANUP_INTERVAL must be greater than 0');
  }
}

export const storageConfig = getStorageConfig();

// Validate configuration on startup
validateConfig(storageConfig);
