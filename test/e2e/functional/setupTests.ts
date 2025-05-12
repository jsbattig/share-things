import 'blob-polyfill';

// Enhanced mock for Web Crypto API in test environment
if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
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
      keyUsages: string[]
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
      algorithm: any, 
      baseKey: any, 
      derivedKeyAlgorithm: any, 
      extractable: boolean, 
      keyUsages: string[]
    ) => {
      console.log('Mock deriveKey called');
      // Use the base key's ID as part of the derived key
      return {
        type: 'secret',
        algorithm: derivedKeyAlgorithm,
        extractable: extractable,
        usages: keyUsages,
        _keyId: baseKey._keyId // Pass through the key ID
      };
    },
    
    // Mock encrypt method
    encrypt: async (
      algorithm: any, 
      key: any, 
      data: ArrayBuffer | ArrayBufferView
    ) => {
      console.log('Mock encrypt called');
      const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
      let dataStr = '';
      
      try {
        // Try to decode as UTF-8 text
        dataStr = new TextDecoder().decode(dataArray);
      } catch (e) {
        // If it's not valid UTF-8, use a hex representation
        dataStr = Array.from(dataArray)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
      
      // Store the original data with the key ID
      const keyId = `${key._keyId}-${algorithm.iv ? Array.from(algorithm.iv).join(',') : 'no-iv'}`;
      encryptionStore.set(keyId, dataStr);
      
      // Return a dummy encrypted buffer
      return dataArray.buffer;
    },
    
    // Mock decrypt method
    decrypt: async (
      algorithm: any, 
      key: any, 
      data: ArrayBuffer | ArrayBufferView
    ) => {
      console.log('Mock decrypt called');
      const keyId = `${key._keyId}-${algorithm.iv ? Array.from(algorithm.iv).join(',') : 'no-iv'}`;
      
      // If we have stored data for this key and IV, return it
      if (encryptionStore.has(keyId)) {
        const originalData = encryptionStore.get(keyId);
        try {
          return new TextEncoder().encode(originalData || '').buffer;
        } catch (e) {
          // If encoding fails, return the original data buffer
          return data instanceof ArrayBuffer ? data : data.buffer;
        }
      }
      
      // If wrong passphrase is used (key ID doesn't match), throw an error
      if (key._keyId.includes('wrong-passphrase')) {
        throw new Error('Decryption failed');
      }
      
      // Return the original data if not found in store
      return data instanceof ArrayBuffer ? data : data.buffer;
    },
    
    // Mock digest method
    digest: async (
      algorithm: string, 
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
  global.crypto = mockCrypto as any;
  
  console.log('Enhanced WebCrypto mock installed for Node.js environment');
}