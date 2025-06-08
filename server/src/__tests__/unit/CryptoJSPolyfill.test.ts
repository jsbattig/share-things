/**
 * Unit tests for CryptoJS Node.js Compatibility Wrapper
 * These tests ensure the polyfill provides browser-compatible functionality in Node.js
 */

import { describe, test, expect } from '@jest/globals';
import * as crypto from 'crypto';

// Import the Jest mock (which is our new polyfill)
import CryptoJSWrapper, { WordArray, Utf8, Hex, PBKDF2, SHA256, AES } from '../../../../test/mocks/crypto-js';

describe('CryptoJS Node.js Compatibility Wrapper', () => {
  
  describe('WordArray', () => {
    test('should create WordArray with words and sigBytes', () => {
      const words = [0x12345678, 0x9abcdef0];
      const sigBytes = 8;
      const wordArray = new WordArray(words, sigBytes);
      
      expect(wordArray.words).toEqual(words);
      expect(wordArray.sigBytes).toBe(sigBytes);
    });
    
    test('should create WordArray using static create method', () => {
      const words = [0x12345678];
      const wordArray = WordArray.create(words, 4);
      
      expect(wordArray.words).toEqual(words);
      expect(wordArray.sigBytes).toBe(4);
    });
    
    test('should concatenate WordArrays correctly', () => {
      const wa1 = new WordArray([0x12345678], 4);
      const wa2 = new WordArray([0x9abcdef0], 4);
      
      const result = wa1.concat(wa2);
      
      expect(result.words).toEqual([0x12345678, 0x9abcdef0]);
      expect(result.sigBytes).toBe(8);
    });
    
    test('should clone WordArray correctly', () => {
      const original = new WordArray([0x12345678, 0x9abcdef0], 8);
      const cloned = original.clone();
      
      expect(cloned.words).toEqual(original.words);
      expect(cloned.sigBytes).toBe(original.sigBytes);
      expect(cloned).not.toBe(original); // Different instances
    });
    
    test('should convert to string representation', () => {
      const wordArray = new WordArray([0x12345678], 4);
      const str = wordArray.toString();
      
      expect(str).toBe('12345678');
    });
  });
  
  describe('Utf8 Encoding', () => {
    test('should parse UTF-8 string to WordArray', () => {
      const testString = 'Hello';
      const wordArray = Utf8.parse(testString);
      
      expect(wordArray).toBeInstanceOf(WordArray);
      expect(wordArray.sigBytes).toBe(testString.length);
    });
    
    test('should stringify WordArray to UTF-8 string', () => {
      const testString = 'Hello World';
      const wordArray = Utf8.parse(testString);
      const result = Utf8.stringify(wordArray);
      
      expect(result).toBe(testString);
    });
    
    test('should handle empty string', () => {
      const wordArray = Utf8.parse('');
      const result = Utf8.stringify(wordArray);
      
      expect(result).toBe('');
      expect(wordArray.sigBytes).toBe(0);
    });
    
    test('should handle special characters', () => {
      const testString = 'Hello 世界! 🌍';
      const wordArray = Utf8.parse(testString);
      const result = Utf8.stringify(wordArray);
      
      expect(result).toBe(testString);
    });
  });
  
  describe('Hex Encoding', () => {
    test('should parse hex string to WordArray', () => {
      const hexString = '48656c6c6f'; // "Hello" in hex
      const wordArray = Hex.parse(hexString);
      
      expect(wordArray).toBeInstanceOf(WordArray);
      expect(wordArray.sigBytes).toBe(hexString.length / 2);
    });
    
    test('should stringify WordArray to hex string', () => {
      const testString = 'Hello';
      const expectedHex = Buffer.from(testString).toString('hex');
      const wordArray = Utf8.parse(testString);
      const hexResult = Hex.stringify(wordArray);
      
      expect(hexResult).toBe(expectedHex);
    });
    
    test('should handle round-trip conversion', () => {
      const originalHex = '48656c6c6f576f726c64'; // "HelloWorld"
      const wordArray = Hex.parse(originalHex);
      const resultHex = Hex.stringify(wordArray);
      
      expect(resultHex).toBe(originalHex);
    });
  });
  
  describe('PBKDF2', () => {
    test('should derive key from password and salt', () => {
      const password = 'test-password';
      const salt = 'test-salt';
      const config = {
        keySize: 8, // 256 bits
        iterations: 1000
      };
      
      const derivedKey = PBKDF2(password, salt, config);
      
      expect(derivedKey).toBeInstanceOf(WordArray);
      expect(derivedKey.sigBytes).toBe(32); // 256 bits = 32 bytes
      expect(derivedKey.words.length).toBe(8);
    });
    
    test('should produce consistent results for same inputs', () => {
      const password = 'consistent-password';
      const salt = 'consistent-salt';
      const config = {
        keySize: 4,
        iterations: 1000
      };
      
      const key1 = PBKDF2(password, salt, config);
      const key2 = PBKDF2(password, salt, config);
      
      expect(key1.words).toEqual(key2.words);
      expect(key1.sigBytes).toBe(key2.sigBytes);
    });
    
    test('should produce different results for different passwords', () => {
      const salt = 'same-salt';
      const config = {
        keySize: 4,
        iterations: 1000
      };
      
      const key1 = PBKDF2('password1', salt, config);
      const key2 = PBKDF2('password2', salt, config);
      
      expect(key1.words).not.toEqual(key2.words);
    });
    
    test('should work with WordArray salt', () => {
      const password = 'test-password';
      const saltWordArray = Utf8.parse('test-salt');
      const config = {
        keySize: 4,
        iterations: 1000
      };
      
      const derivedKey = PBKDF2(password, saltWordArray, config);
      
      expect(derivedKey).toBeInstanceOf(WordArray);
      expect(derivedKey.sigBytes).toBe(16);
    });
  });
  
  describe('SHA256', () => {
    test('should hash string input', () => {
      const input = 'Hello World';
      const hash = SHA256(input);
      
      expect(hash).toBeInstanceOf(WordArray);
      expect(hash.sigBytes).toBe(32); // SHA256 produces 32 bytes
    });
    
    test('should hash WordArray input', () => {
      const input = Utf8.parse('Hello World');
      const hash = SHA256(input);
      
      expect(hash).toBeInstanceOf(WordArray);
      expect(hash.sigBytes).toBe(32);
    });
    
    test('should produce consistent results', () => {
      const input = 'consistent-input';
      const hash1 = SHA256(input);
      const hash2 = SHA256(input);
      
      expect(hash1.words).toEqual(hash2.words);
    });
    
    test('should match Node.js crypto SHA256', () => {
      const input = 'test-input';
      const ourHash = SHA256(input);
      const nodeHash = crypto.createHash('sha256').update(input).digest();
      
      // Convert our hash to buffer for comparison
      const ourHashBytes: number[] = [];
      for (let i = 0; i < ourHash.sigBytes; i++) {
        const byte = (ourHash.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        ourHashBytes.push(byte);
      }
      const ourHashBuffer = Buffer.from(ourHashBytes);
      
      expect(ourHashBuffer.equals(nodeHash)).toBe(true);
    });
  });
  
  describe('AES Encryption/Decryption', () => {
    test('should encrypt and decrypt data successfully', () => {
      const plaintext = 'Hello World, this is a test message!';
      const password = 'test-password';
      const salt = 'test-salt';
      
      // Derive key
      const key = PBKDF2(password, salt, {
        keySize: 8,
        iterations: 1000
      });
      
      // Encrypt
      const encrypted = AES.encrypt(plaintext, key);
      
      expect(encrypted.ciphertext).toBeInstanceOf(WordArray);
      expect(encrypted.iv).toBeInstanceOf(WordArray);
      
      // Decrypt
      const decrypted = AES.decrypt(encrypted, key);
      const decryptedText = Utf8.stringify(decrypted);
      
      expect(decryptedText).toBe(plaintext);
    });
    
    test('should encrypt WordArray input', () => {
      const plaintextWordArray = Utf8.parse('Test message');
      const key = PBKDF2('password', 'salt', { keySize: 8, iterations: 1000 });
      
      const encrypted = AES.encrypt(plaintextWordArray, key);
      
      expect(encrypted.ciphertext).toBeInstanceOf(WordArray);
      expect(encrypted.iv).toBeInstanceOf(WordArray);
    });
    
    test('should use provided IV', () => {
      const plaintext = 'Test message';
      const key = PBKDF2('password', 'salt', { keySize: 8, iterations: 1000 });
      const customIV = new WordArray([0x12345678, 0x9abcdef0, 0x11111111, 0x22222222], 16);
      
      const encrypted = AES.encrypt(plaintext, key, { iv: customIV });
      
      expect(encrypted.iv.words).toEqual(customIV.words);
    });
    
    test('should produce different ciphertext for same plaintext with different keys', () => {
      const plaintext = 'Same message';
      const key1 = PBKDF2('password1', 'salt', { keySize: 8, iterations: 1000 });
      const key2 = PBKDF2('password2', 'salt', { keySize: 8, iterations: 1000 });
      
      const encrypted1 = AES.encrypt(plaintext, key1);
      const encrypted2 = AES.encrypt(plaintext, key2);
      
      expect(encrypted1.ciphertext.words).not.toEqual(encrypted2.ciphertext.words);
    });
  });
  
  describe('CryptoJS Wrapper Integration', () => {
    test('should provide all required properties', () => {
      expect(CryptoJSWrapper.enc).toBeDefined();
      expect(CryptoJSWrapper.enc.Utf8).toBeDefined();
      expect(CryptoJSWrapper.enc.Hex).toBeDefined();
      expect(CryptoJSWrapper.enc.Base64).toBeDefined();
      
      expect(CryptoJSWrapper.lib).toBeDefined();
      expect(CryptoJSWrapper.lib.WordArray).toBeDefined();
      
      expect(CryptoJSWrapper.algo).toBeDefined();
      expect(CryptoJSWrapper.algo.SHA256).toBeDefined();
      
      expect(CryptoJSWrapper.PBKDF2).toBeDefined();
      expect(CryptoJSWrapper.SHA256).toBeDefined();
      expect(CryptoJSWrapper.AES).toBeDefined();
    });
    
    test('should work with client encryption pattern', () => {
      // Simulate the exact pattern used in client encryption
      const passphrase = 'test-passphrase';
      const salt = CryptoJSWrapper.enc.Utf8.parse('ShareThings-Salt-2025');
      
      const key = CryptoJSWrapper.PBKDF2(passphrase, salt, {
        keySize: 256/32,
        iterations: 100000,
        hasher: CryptoJSWrapper.algo.SHA256
      });
      
      expect(key).toBeInstanceOf(WordArray);
      expect(key.sigBytes).toBe(32); // 256 bits
    });
    
    test('should be available globally', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((global as any).CryptoJS).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((global as any).CryptoJS.enc).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((global as any).CryptoJS.enc.Utf8).toBeDefined();
    });
  });
  
  describe('Base64 Encoding', () => {
    test('should parse base64 string to WordArray', () => {
      const base64String = Buffer.from('Hello World').toString('base64');
      const wordArray = CryptoJSWrapper.enc.Base64.parse(base64String);
      
      expect(wordArray).toBeInstanceOf(WordArray);
    });
    
    test('should stringify WordArray to base64 string', () => {
      const testString = 'Hello World';
      const expectedBase64 = Buffer.from(testString).toString('base64');
      const wordArray = Utf8.parse(testString);
      const base64Result = CryptoJSWrapper.enc.Base64.stringify(wordArray);
      
      expect(base64Result).toBe(expectedBase64);
    });
    
    test('should handle round-trip conversion', () => {
      const originalData = 'This is a test message for base64 encoding!';
      const originalBase64 = Buffer.from(originalData).toString('base64');
      
      const wordArray = CryptoJSWrapper.enc.Base64.parse(originalBase64);
      const resultBase64 = CryptoJSWrapper.enc.Base64.stringify(wordArray);
      
      expect(resultBase64).toBe(originalBase64);
    });
  });
  
  describe('Enhanced Features', () => {
    test('should support WordArray clamp method', () => {
      const wordArray = new WordArray([0x12345678, 0x9abcdef0], 6);
      const clamped = wordArray.clamp();
      
      expect(clamped).toBe(wordArray); // Should return self
      expect(wordArray.sigBytes).toBe(6);
    });

    test('should support CipherParams creation', () => {
      const testData = new WordArray([0x12345678], 4);
      const testIV = new WordArray([0x87654321], 4);
      
      const cipherParams = CryptoJSWrapper.lib.CipherParams.create({
        ciphertext: testData,
        iv: testIV
      });
      
      expect(cipherParams.ciphertext).toBe(testData);
      expect(cipherParams.iv).toBe(testIV);
    });

    test('should support pad.Pkcs7 methods', () => {
      const testData = new WordArray([0x12345678], 4);
      
      // These are no-ops in our polyfill since Node.js handles padding
      expect(() => {
        CryptoJSWrapper.pad.Pkcs7.pad(testData, 4);
        CryptoJSWrapper.pad.Pkcs7.unpad(testData);
      }).not.toThrow();
    });
  });
  
  describe('Error Handling', () => {
    test('should handle invalid hex strings gracefully', () => {
      expect(() => {
        Hex.parse('invalid-hex-string');
      }).not.toThrow();
    });
    
    test('should handle empty inputs', () => {
      expect(() => {
        const emptyWordArray = new WordArray([], 0);
        Utf8.stringify(emptyWordArray);
      }).not.toThrow();
    });
    
    test('should handle malformed WordArrays', () => {
      expect(() => {
        const malformedWordArray = new WordArray([0x12345678], 10); // sigBytes > actual data
        Hex.stringify(malformedWordArray);
      }).not.toThrow();
    });
  });
});