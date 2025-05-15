import { SessionManager } from './SessionManager';
import { PostgreSQLSessionManager, PostgreSQLConfig } from './PostgreSQLSessionManager';

/**
 * Session storage type
 */
export type SessionStorageType = 'memory' | 'postgresql';

/**
 * Session manager factory configuration
 */
export interface SessionManagerFactoryConfig {
  /**
   * Session timeout in milliseconds
   */
  sessionTimeout?: number;
  
  /**
   * Storage type
   */
  storageType: SessionStorageType;
  
  /**
   * PostgreSQL configuration (required if storageType is 'postgresql')
   */
  postgresConfig?: PostgreSQLConfig;
}

/**
 * Factory for creating session managers
 */
export class SessionManagerFactory {
  /**
   * Creates a session manager based on configuration
   * @param config Session manager factory configuration
   * @returns Session manager instance
   */
  static createSessionManager(config: SessionManagerFactoryConfig): SessionManager {
    console.log(`[SessionManagerFactory] Creating session manager with storage type: ${config.storageType}`);
    
    switch (config.storageType) {
      case 'memory':
        console.log('[SessionManagerFactory] Using in-memory session storage');
        return new SessionManager({
          sessionTimeout: config.sessionTimeout
        });
      
      case 'postgresql':
        if (!config.postgresConfig) {
          throw new Error('PostgreSQL configuration is required for postgresql storage type');
        }
        
        console.log('[SessionManagerFactory] Using PostgreSQL session storage');
        return new PostgreSQLSessionManager({
          sessionTimeout: config.sessionTimeout,
          postgresConfig: config.postgresConfig
        });
      
      default:
        throw new Error(`Unsupported storage type: ${config.storageType}`);
    }
  }
}