/**
 * Mock for shared crypto library in client tests
 * Implements crypto functions directly using Node.js crypto for testing
 */

import * as crypto from 'crypto';

// Simple mock implementations for testing
export const deriveKeyFromPassphrase = async (passphrase: string) => {
  // Simple key derivation for testing
  const salt = Buffer.from('ShareThings-Salt-2025', 'utf8');
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  
  return {
    key: {
      words: Array.from(new Uint32Array(key.buffer)),
      sigBytes: key.length
    },
    algorithm: 'AES',
    usages: ['encrypt', 'decrypt'],
    type: 'secret',
    extractable: true
  };
};

export const encryptData = async (key: unknown, data: ArrayBuffer | Uint8Array, passphrase: string) => {
  // Simple encryption for testing
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipher('aes-256-cbc', passphrase);
  const dataBuffer = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data.buffer);
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  
  return {
    encryptedData: encrypted.buffer,
    iv: iv
  };
};

export const decryptData = async (key: unknown, encryptedData: ArrayBuffer | Uint8Array) => {
  // Simple decryption for testing - just return the original data for testing purposes
  return encryptedData instanceof ArrayBuffer ? encryptedData : encryptedData.buffer;
};

export const generateFingerprint = async (passphrase: string) => {
  // Simple fingerprint generation for testing
  const hash = crypto.createHash('sha256').update(passphrase).digest();
  const fixedIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  
  return {
    iv: Array.from(fixedIv),
    data: Array.from(hash.slice(0, 16))
  };
};

// Export default with the functions
export default {
  deriveKeyFromPassphrase,
  encryptData,
  decryptData,
  generateFingerprint
};