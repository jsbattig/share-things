/**
 * Environment detection for crypto library
 */

export enum CryptoEnvironment {
  Browser = 'browser',
  Node = 'node',
  Test = 'test'
}

/**
 * Detect the current runtime environment
 */
export function detectEnvironment(): CryptoEnvironment {
  // Check if we're in a test environment
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return CryptoEnvironment.Test;
  }
  
  // Check if we're in Jest
  if (typeof global !== 'undefined' && (global as any).jest) {
    return CryptoEnvironment.Test;
  }
  
  // Check if we're in Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return CryptoEnvironment.Node;
  }
  
  // Check if we're in a browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return CryptoEnvironment.Browser;
  }
  
  // Default to Node if we can't determine
  return CryptoEnvironment.Node;
}

/**
 * Check if we're in a browser environment
 */
export function isBrowser(): boolean {
  return detectEnvironment() === CryptoEnvironment.Browser;
}

/**
 * Check if we're in a Node.js environment
 */
export function isNode(): boolean {
  const env = detectEnvironment();
  return env === CryptoEnvironment.Node || env === CryptoEnvironment.Test;
}

/**
 * Check if we're in a test environment
 */
export function isTest(): boolean {
  return detectEnvironment() === CryptoEnvironment.Test;
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig() {
  const environment = detectEnvironment();
  
  return {
    environment,
    isBrowser: environment === CryptoEnvironment.Browser,
    isNode: environment === CryptoEnvironment.Node || environment === CryptoEnvironment.Test,
    isTest: environment === CryptoEnvironment.Test,
    supportsWebCrypto: typeof crypto !== 'undefined' && crypto.subtle !== undefined,
    supportsNodeCrypto: typeof require !== 'undefined' && (() => {
      try {
        require('crypto');
        return true;
      } catch {
        return false;
      }
    })()
  };
}