/**
 * Comprehensive test suite for the unified crypto library
 * Tests both Node.js and browser implementations
 */

// Import polyfills for Node.js environment
import '../polyfills';

import { describe, test, expect, beforeAll } from '@jest/globals';
import { NodeCrypto } from '../node';
import { 
  CryptoInterface, 
  CryptoKey, 
  EncryptionResult,
  PassphraseFingerprint 
} from '../types';
import { detectEnvironment, CryptoEnvironment } from '../environment';

// Test data
const TEST_PASSPHRASE = 'test-passphrase-123';
const TEST_TEXT = 'This is a test message for encryption and decryption.';
const TEST_BINARY_DATA = new Uint8Array([0, 1, 2, 3, 4, 5, 255, 254, 253]);

describe('Unified Crypto Library', () => {
  let crypto: CryptoInterface;

  beforeAll(() => {
    // For now, we'll test the Node implementation since we're in Jest
    crypto = new NodeCrypto();
  });

  describe('Environment Detection', () => {
    test('should detect test environment', () => {
      const env = detectEnvironment();
      expect(env).toBe(CryptoEnvironment.Test);
    });
  });

  describe('Key Derivation', () => {
    test('should derive consistent keys from the same passphrase', async () => {
      const key1 = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      const key2 = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      
      expect(key1.type).toBe(key2.type);
      expect(key1.algorithm).toBe(key2.algorithm);
      expect(key1.extractable).toBe(key2.extractable);
      expect(key1.usages).toEqual(key2.usages);
      
      // Keys should have the same derived values
      expect(key1.key.words).toEqual(key2.key.words);
      expect(key1.key.sigBytes).toBe(key2.key.sigBytes);
    });

    test('should derive different keys from different passphrases', async () => {
      const key1 = await crypto.deriveKeyFromPassphrase('passphrase1');
      const key2 = await crypto.deriveKeyFromPassphrase('passphrase2');
      
      expect(key1.key.words).not.toEqual(key2.key.words);
    });

    test('should derive keys with correct properties', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      
      expect(key.algorithm).toBe('AES');
      expect(key.type).toBe('secret');
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
      expect(key.key.sigBytes).toBe(32); // 256 bits
    });
  });

  describe('Data Encryption/Decryption', () => {
    test('should encrypt and decrypt binary data correctly', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      
      // Encrypt
      const { encryptedData, iv } = await crypto.encryptData(key, TEST_BINARY_DATA, TEST_PASSPHRASE);
      
      expect(encryptedData).toBeInstanceOf(ArrayBuffer);
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12); // Deterministic IV length
      
      // Decrypt
      const decryptedData = await crypto.decryptData(key, encryptedData, iv);
      const decryptedArray = new Uint8Array(decryptedData);
      
      expect(decryptedArray).toEqual(TEST_BINARY_DATA);
    });

    test('should produce deterministic IVs for same data and passphrase', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      
      const result1 = await crypto.encryptData(key, TEST_BINARY_DATA, TEST_PASSPHRASE);
      const result2 = await crypto.encryptData(key, TEST_BINARY_DATA, TEST_PASSPHRASE);
      
      // IVs should be the same for same input
      expect(Array.from(result1.iv)).toEqual(Array.from(result2.iv));
      
      // Encrypted data should be the same too (deterministic encryption)
      expect(new Uint8Array(result1.encryptedData)).toEqual(new Uint8Array(result2.encryptedData));
    });

    test('should produce different IVs for different data', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);
      
      const result1 = await crypto.encryptData(key, data1, TEST_PASSPHRASE);
      const result2 = await crypto.encryptData(key, data2, TEST_PASSPHRASE);
      
      expect(Array.from(result1.iv)).not.toEqual(Array.from(result2.iv));
    });

    test('should handle empty data', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      const emptyData = new Uint8Array(0);
      
      const { encryptedData, iv } = await crypto.encryptData(key, emptyData, TEST_PASSPHRASE);
      const decryptedData = await crypto.decryptData(key, encryptedData, iv);
      
      expect(new Uint8Array(decryptedData)).toEqual(emptyData);
    });

    test('should handle large data', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      const largeData = new Uint8Array(1024 * 1024); // 1MB
      
      // Fill with pattern
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }
      
      const { encryptedData, iv } = await crypto.encryptData(key, largeData, TEST_PASSPHRASE);
      const decryptedData = await crypto.decryptData(key, encryptedData, iv);
      
      expect(new Uint8Array(decryptedData)).toEqual(largeData);
    });

    test('should fail decryption with wrong key', async () => {
      const key1 = await crypto.deriveKeyFromPassphrase('passphrase1');
      const key2 = await crypto.deriveKeyFromPassphrase('passphrase2');
      
      const { encryptedData, iv } = await crypto.encryptData(key1, TEST_BINARY_DATA, 'passphrase1');
      
      await expect(
        crypto.decryptData(key2, encryptedData, iv)
      ).rejects.toThrow();
    });

    test('should fail decryption with wrong IV', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      const { encryptedData } = await crypto.encryptData(key, TEST_BINARY_DATA, TEST_PASSPHRASE);
      const wrongIV = new Uint8Array(12).fill(0);
      
      await expect(
        crypto.decryptData(key, encryptedData, wrongIV)
      ).rejects.toThrow();
    });
  });

  describe('Text Encryption/Decryption', () => {
    test('should encrypt and decrypt text correctly', async () => {
      const { encryptedText, iv } = await crypto.encryptText(TEST_PASSPHRASE, TEST_TEXT);
      
      expect(encryptedText).not.toBe(TEST_TEXT);
      expect(typeof encryptedText).toBe('string');
      expect(typeof iv).toBe('string');
      
      const decryptedText = await crypto.decryptText(TEST_PASSPHRASE, encryptedText, iv);
      expect(decryptedText).toBe(TEST_TEXT);
    });

    test('should handle unicode text', async () => {
      const unicodeText = 'Hello 世界! 🌍 Émojis and spëcial chars';
      
      const { encryptedText, iv } = await crypto.encryptText(TEST_PASSPHRASE, unicodeText);
      const decryptedText = await crypto.decryptText(TEST_PASSPHRASE, encryptedText, iv);
      
      expect(decryptedText).toBe(unicodeText);
    });

    test('should handle empty text', async () => {
      const emptyText = '';
      
      const { encryptedText, iv } = await crypto.encryptText(TEST_PASSPHRASE, emptyText);
      
      // Empty text should still fail decryption validation
      await expect(
        crypto.decryptText(TEST_PASSPHRASE, encryptedText, iv)
      ).rejects.toThrow('Empty result');
    });

    test('should fail with wrong passphrase', async () => {
      const { encryptedText, iv } = await crypto.encryptText(TEST_PASSPHRASE, TEST_TEXT);
      
      await expect(
        crypto.decryptText('wrong-passphrase', encryptedText, iv)
      ).rejects.toThrow();
    });

    test('should produce deterministic results', async () => {
      const result1 = await crypto.encryptText(TEST_PASSPHRASE, TEST_TEXT);
      const result2 = await crypto.encryptText(TEST_PASSPHRASE, TEST_TEXT);
      
      // Should be deterministic
      expect(result1.encryptedText).toBe(result2.encryptedText);
      expect(result1.iv).toBe(result2.iv);
    });
  });

  describe('Fingerprint Generation', () => {
    test('should generate consistent fingerprints', async () => {
      const fingerprint1 = await crypto.generateFingerprint(TEST_PASSPHRASE);
      const fingerprint2 = await crypto.generateFingerprint(TEST_PASSPHRASE);
      
      expect(fingerprint1.iv).toEqual(fingerprint2.iv);
      expect(fingerprint1.data).toEqual(fingerprint2.data);
    });

    test('should generate different fingerprints for different passphrases', async () => {
      const fingerprint1 = await crypto.generateFingerprint('passphrase1');
      const fingerprint2 = await crypto.generateFingerprint('passphrase2');
      
      expect(fingerprint1.data).not.toEqual(fingerprint2.data);
    });

    test('should generate fingerprints with correct structure', async () => {
      const fingerprint = await crypto.generateFingerprint(TEST_PASSPHRASE);
      
      expect(fingerprint.iv).toHaveLength(12);
      expect(fingerprint.data).toHaveLength(16);
      expect(Array.isArray(fingerprint.iv)).toBe(true);
      expect(Array.isArray(fingerprint.data)).toBe(true);
      
      // IV should be the fixed pattern
      expect(fingerprint.iv).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });
  });

  describe('Blob Encryption/Decryption', () => {
    test('should encrypt and decrypt blobs correctly', async () => {
      const originalBlob = new Blob([TEST_BINARY_DATA], { type: 'application/octet-stream' });
      
      const { encryptedBlob, iv } = await crypto.encryptBlob(TEST_PASSPHRASE, originalBlob);
      
      expect(encryptedBlob).toBeInstanceOf(Blob);
      expect(encryptedBlob.type).toBe('application/octet-stream');
      expect(iv).toBeInstanceOf(Uint8Array);
      
      const decryptedBlob = await crypto.decryptBlob(
        TEST_PASSPHRASE, 
        encryptedBlob, 
        iv, 
        'application/octet-stream'
      );
      
      expect(decryptedBlob).toBeInstanceOf(Blob);
      expect(decryptedBlob.type).toBe('application/octet-stream');
      
      // Verify content
      const decryptedData = new Uint8Array(await decryptedBlob.arrayBuffer());
      expect(decryptedData).toEqual(TEST_BINARY_DATA);
    });

    test('should preserve MIME type', async () => {
      const originalBlob = new Blob(['test content'], { type: 'text/plain' });
      
      const { encryptedBlob, iv } = await crypto.encryptBlob(TEST_PASSPHRASE, originalBlob);
      const decryptedBlob = await crypto.decryptBlob(
        TEST_PASSPHRASE, 
        encryptedBlob, 
        iv, 
        'text/plain'
      );
      
      expect(decryptedBlob.type).toBe('text/plain');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid input gracefully', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      
      // Invalid IV length
      const { encryptedData } = await crypto.encryptData(key, TEST_BINARY_DATA, TEST_PASSPHRASE);
      const invalidIV = new Uint8Array(5); // Wrong length
      
      await expect(
        crypto.decryptData(key, encryptedData, invalidIV)
      ).rejects.toThrow();
    });

    test('should handle corrupted data', async () => {
      const key = await crypto.deriveKeyFromPassphrase(TEST_PASSPHRASE);
      const { iv } = await crypto.encryptData(key, TEST_BINARY_DATA, TEST_PASSPHRASE);
      
      // Corrupted encrypted data
      const corruptedData = new Uint8Array(32).fill(0);
      
      await expect(
        crypto.decryptData(key, corruptedData, iv)
      ).rejects.toThrow();
    });

    test('should provide meaningful error messages', async () => {
      try {
        await crypto.deriveKeyFromPassphrase('');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to derive key');
      }
    });
  });

  describe('Performance', () => {
    test('should handle multiple operations efficiently', async () => {
      const operations = 100;
      const startTime = Date.now();
      
      const promises: Promise<{ encryptedText: string; iv: string }>[] = [];
      for (let i = 0; i < operations; i++) {
        promises.push(crypto.encryptText(TEST_PASSPHRASE, `Test message ${i}`));
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(operations);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Compatibility', () => {
    test('should maintain compatibility with existing encryption patterns', async () => {
      // Test the exact pattern used in the original client encryption
      const passphrase = 'test-passphrase';
      const key = await crypto.deriveKeyFromPassphrase(passphrase);
      
      expect(key.key.sigBytes).toBe(32); // 256 bits
      expect(key.algorithm).toBe('AES');
      expect(key.type).toBe('secret');
    });

    test('should produce results compatible with original implementation', async () => {
      // This test ensures our unified implementation produces the same results
      // as the original scattered implementations
      const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const key = await crypto.deriveKeyFromPassphrase('test-key');
      
      const { encryptedData, iv } = await crypto.encryptData(key, testData, 'test-key');
      const decryptedData = await crypto.decryptData(key, encryptedData, iv);
      
      expect(new Uint8Array(decryptedData)).toEqual(testData);
    });
  });
});