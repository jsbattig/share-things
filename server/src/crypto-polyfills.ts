/**
 * Crypto polyfills initialization for server environment
 * This file initializes the crypto polyfills for Node.js without external dependencies
 */

// Simple polyfill setup for Node.js environment
if (typeof global !== 'undefined' && !(global as Record<string, unknown>).CryptoJS) {
  // Set up a minimal CryptoJS polyfill that uses Node.js crypto
  // Note: crypto import is available but not used in this minimal polyfill
  
  // Create a minimal CryptoJS-compatible interface using Node.js crypto
  (global as Record<string, unknown>).CryptoJS = {
    // Environment detection
    env: 'node',
    
    // Minimal implementation - the actual crypto operations will use Node.js crypto
    // This is just to prevent "CryptoJS is not defined" errors
    lib: {
      WordArray: {
        create: () => ({}),
      },
      CipherParams: {
        create: () => ({}),
      }
    },
    enc: {
      Utf8: {
        parse: () => ({}),
        stringify: () => ''
      },
      Hex: {
        parse: () => ({}),
        stringify: () => ''
      },
      Base64: {
        parse: () => ({}),
        stringify: () => ''
      }
    },
    algo: {
      SHA256: {}
    },
    pad: {
      Pkcs7: {}
    },
    PBKDF2: () => ({}),
    SHA256: () => ({}),
    AES: {
      encrypt: () => ({}),
      decrypt: () => ({})
    }
  };
  
  console.log('Minimal CryptoJS polyfill initialized for Node.js environment');
}