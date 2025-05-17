import 'blob-polyfill';

// Add TextEncoder and TextDecoder polyfills for Node.js environment in Jest
if (typeof global.TextEncoder === 'undefined') {
  // Use dynamic import to avoid TypeScript errors during build
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const util = require('util');
  global.TextEncoder = util.TextEncoder;
  global.TextDecoder = util.TextDecoder;
  console.log('TextEncoder and TextDecoder polyfills installed');
}

// Define extended interfaces for our mock crypto implementation
interface MockCryptoKey extends CryptoKey {
  _keyId: string;
}

interface MockAlgorithmParams {
  iv?: Uint8Array | ArrayBuffer | ArrayBufferView;
  [key: string]: unknown;
}

// Enhanced mock for Web Crypto API in test environment
if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
  // Store encryption keys and data for consistent encryption/decryption
  const encryptionStore = new Map<string, string>();
  
  // Create a mock implementation of the crypto.subtle API
  const mockSubtle = {
    // Mock importKey method
    importKey: async (
      format: string,
      keyData: ArrayBuffer | ArrayBufferView,
      algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
      extractable: boolean,
      keyUsages: KeyUsage[]
    ) => {
      console.log('Mock importKey called');
      // Create a unique key identifier
      const keyId = Array.from(new Uint8Array(keyData instanceof ArrayBuffer ? keyData : keyData.buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      return {
        type: 'secret',
        algorithm: algorithm,
        extractable: extractable,
        usages: keyUsages,
        _keyId: keyId // Store key ID for later use
      };
    },
    
    // Mock deriveKey method
    deriveKey: async (
      algorithm: AlgorithmIdentifier | AesDerivedKeyParams | HmacImportParams | HkdfParams | Pbkdf2Params,
      baseKey: CryptoKey,
      derivedKeyAlgorithm: AlgorithmIdentifier | AesDerivedKeyParams | HmacImportParams | HkdfParams | Pbkdf2Params,
      extractable: boolean,
      keyUsages: KeyUsage[]
    ) => {
      console.log('Mock deriveKey called');
      // Use the base key's ID as part of the derived key
      return {
        type: 'secret',
        algorithm: derivedKeyAlgorithm,
        extractable: extractable,
        usages: keyUsages,
        _keyId: (baseKey as MockCryptoKey)._keyId // Pass through the key ID
      };
    },
    
    // Mock encrypt method
    encrypt: async (
      algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
      key: CryptoKey,
      data: ArrayBuffer | ArrayBufferView
    ) => {
      console.log('Mock encrypt called');
      const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
      const dataStr = new TextDecoder().decode(dataArray);
      
      // Store the original data with the key ID
      const mockKey = key as MockCryptoKey;
      // Cast to unknown first to avoid type errors
      const mockAlgorithm = algorithm as unknown as MockAlgorithmParams;
      
      // Handle different types of iv
      let ivString = 'no-iv';
      if (mockAlgorithm.iv) {
        const ivArray = mockAlgorithm.iv instanceof Uint8Array
          ? mockAlgorithm.iv
          : new Uint8Array(mockAlgorithm.iv instanceof ArrayBuffer
              ? mockAlgorithm.iv
              : (mockAlgorithm.iv as ArrayBufferView).buffer);
        ivString = Array.from(ivArray).join(',');
      }
      
      encryptionStore.set(`${mockKey._keyId}-${ivString}`, dataStr);
      
      // Return a dummy encrypted buffer
      return new TextEncoder().encode(dataStr).buffer;
    },
    
    // Mock decrypt method
    decrypt: async (
      algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
      key: CryptoKey,
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
      data: ArrayBuffer | ArrayBufferView
    ) => {
      console.log('Mock decrypt called');
      const mockKey = key as MockCryptoKey;
      // Cast to unknown first to avoid type errors
      const mockAlgorithm = algorithm as unknown as MockAlgorithmParams;
      
      // Handle different types of iv
      let ivString = 'no-iv';
      if (mockAlgorithm.iv) {
        const ivArray = mockAlgorithm.iv instanceof Uint8Array
          ? mockAlgorithm.iv
          : new Uint8Array(mockAlgorithm.iv instanceof ArrayBuffer
              ? mockAlgorithm.iv
              : (mockAlgorithm.iv as ArrayBufferView).buffer);
        ivString = Array.from(ivArray).join(',');
      }
      
      const keyId = `${mockKey._keyId}-${ivString}`;
      
      // If we have stored data for this key and IV, return it
      if (encryptionStore.has(keyId)) {
        const storedData = encryptionStore.get(keyId);
        return new TextEncoder().encode(storedData || '').buffer;
      }
      
      // If wrong passphrase is used (key ID doesn't match), throw an error
      if ((key as MockCryptoKey)._keyId.includes('wrong-passphrase')) {
        throw new Error('Decryption failed');
      }
      
      // Return empty data if not found
      return new TextEncoder().encode('').buffer;
    },
    
    // Mock digest method
    digest: async (
      algorithm: AlgorithmIdentifier,
      data: ArrayBuffer | ArrayBufferView
    ) => {
      console.log('Mock digest called');
      // Create a deterministic hash based on the input data
      const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
      const hash = new Uint8Array(32);
      
      // Simple hash function: sum of bytes modulo 256 for each position
      for (let i = 0; i < dataArray.length; i++) {
        hash[i % 32] = (hash[i % 32] + dataArray[i]) % 256;
      }
      
      return hash.buffer;
    }
  };
  
  // Create a mock crypto object
  const mockCrypto = {
    subtle: mockSubtle,
    getRandomValues: (array: Uint8Array) => {
      // Fill array with deterministic "random" values
      for (let i = 0; i < array.length; i++) {
        array[i] = (i * 13 + 7) % 256; // Simple deterministic pattern
      }
      return array;
    }
  };
  
  // Add mock crypto to global scope
  // Cast to unknown first, then to Crypto to avoid direct any cast
  global.crypto = mockCrypto as unknown as Crypto;
  
  console.log('Enhanced WebCrypto mock installed');
}