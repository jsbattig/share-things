/**
 * CryptoJS Node.js Compatibility Wrapper
 * Creates a wrapper class that provides browser-compatible CryptoJS interface in Node.js
 */

import * as OriginalCryptoJS from 'crypto-js';
import * as nodeCrypto from 'crypto';

// WordArray implementation
class WordArray {
  words: number[];
  sigBytes: number;

  constructor(words: number[] = [], sigBytes?: number) {
    this.words = words.slice();
    this.sigBytes = sigBytes !== undefined ? sigBytes : words.length * 4;
  }

  static create(words: number[] = [], sigBytes?: number): WordArray {
    return new WordArray(words, sigBytes);
  }

  concat(wordArray: WordArray): WordArray {
    const thisClone = this.clone();
    thisClone.words = thisClone.words.concat(wordArray.words);
    thisClone.sigBytes += wordArray.sigBytes;
    return thisClone;
  }

  clone(): WordArray {
    return new WordArray(this.words.slice(), this.sigBytes);
  }

  toString(): string {
    return this.words.map(word => word.toString(16).padStart(8, '0')).join('');
  }

  // Clamp method to adjust sigBytes
  clamp(): this {
    // Ensure sigBytes doesn't exceed the actual data length
    const wordsLength = this.words.length;
    const maxSigBytes = wordsLength * 4;
    if (this.sigBytes > maxSigBytes) {
      this.sigBytes = maxSigBytes;
    }
    
    // Zero out unused bits in the last word
    if (this.sigBytes < maxSigBytes) {
      const lastWordIndex = Math.ceil(this.sigBytes / 4) - 1;
      if (lastWordIndex >= 0 && lastWordIndex < this.words.length) {
        const unusedBytes = 4 - (this.sigBytes % 4 || 4);
        if (unusedBytes > 0) {
          const mask = 0xffffffff << (unusedBytes * 8);
          this.words[lastWordIndex] &= mask;
        }
      }
    }
    
    return this;
  }
}

// Helper function to convert bytes to words correctly
function bytesToWords(bytes: number[]): number[] {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    let word = 0;
    for (let j = 0; j < 4; j++) {
      if (i + j < bytes.length) {
        word = (word << 8) | bytes[i + j];
      } else {
        word = word << 8; // Pad with zeros
      }
    }
    words.push(word);
  }
  return words;
}

// Helper function to convert words to bytes correctly
function wordsToBytes(words: number[], sigBytes: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < sigBytes; i++) {
    const byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    bytes.push(byte);
  }
  return bytes;
}

// Encoding implementations
const Utf8 = {
  parse: function(str: string): WordArray {
    // Convert string to UTF-8 bytes first
    const utf8Bytes = Array.from(Buffer.from(str, 'utf8'));
    const words = bytesToWords(utf8Bytes);
    return new WordArray(words, utf8Bytes.length);
  },
  
  stringify: function(wordArray: WordArray): string {
    const bytes = wordsToBytes(wordArray.words, wordArray.sigBytes);
    return Buffer.from(bytes).toString('utf8');
  }
};

const Hex = {
  parse: function(hexStr: string): WordArray {
    const bytes: number[] = [];
    for (let i = 0; i < hexStr.length; i += 2) {
      const hexByte = hexStr.substr(i, 2);
      bytes.push(parseInt(hexByte, 16));
    }
    const words = bytesToWords(bytes);
    return new WordArray(words, bytes.length);
  },
  
  stringify: function(wordArray: WordArray): string {
    const bytes = wordsToBytes(wordArray.words, wordArray.sigBytes);
    return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
};

// PBKDF2 implementation using Node.js crypto
function pbkdf2Impl(password: string, salt: WordArray | string, cfg: any): WordArray {
  const keySize = cfg.keySize || 4; // Default to 128 bits (4 words)
  const iterations = cfg.iterations || 100000;
  
  // Convert salt to buffer
  let saltBuffer: Buffer;
  if (typeof salt === 'string') {
    saltBuffer = Buffer.from(salt, 'utf8');
  } else if (salt instanceof WordArray) {
    const saltBytes: number[] = [];
    for (let i = 0; i < salt.sigBytes; i++) {
      const byte = (salt.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
      saltBytes.push(byte);
    }
    saltBuffer = Buffer.from(saltBytes);
  } else {
    saltBuffer = Buffer.from(salt);
  }
  
  // Use Node.js PBKDF2
  const keyBuffer = nodeCrypto.pbkdf2Sync(password, saltBuffer, iterations, keySize * 4, 'sha256');
  
  // Convert to WordArray
  const words: number[] = [];
  for (let i = 0; i < keyBuffer.length; i += 4) {
    const word = (keyBuffer[i] << 24) | (keyBuffer[i + 1] << 16) | (keyBuffer[i + 2] << 8) | keyBuffer[i + 3];
    words.push(word);
  }
  
  return new WordArray(words, keyBuffer.length);
}

// SHA256 implementation
function sha256Impl(message: WordArray | string): WordArray {
  let messageBuffer: Buffer;
  
  if (typeof message === 'string') {
    messageBuffer = Buffer.from(message, 'utf8');
  } else if (message instanceof WordArray) {
    const messageBytes: number[] = [];
    for (let i = 0; i < message.sigBytes; i++) {
      const byte = (message.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
      messageBytes.push(byte);
    }
    messageBuffer = Buffer.from(messageBytes);
  } else {
    messageBuffer = Buffer.from(message);
  }
  
  const hash = nodeCrypto.createHash('sha256').update(messageBuffer).digest();
  
  // Convert to WordArray
  const words: number[] = [];
  for (let i = 0; i < hash.length; i += 4) {
    const word = (hash[i] << 24) | (hash[i + 1] << 16) | (hash[i + 2] << 8) | hash[i + 3];
    words.push(word);
  }
  
  return new WordArray(words, hash.length);
}

// AES implementation using Node.js crypto
const aesImpl = {
  encrypt: function(message: WordArray | string, key: WordArray, cfg: any = {}): any {
    // Convert inputs to buffers
    let messageBuffer: Buffer;
    if (typeof message === 'string') {
      messageBuffer = Buffer.from(message, 'utf8');
    } else if (message instanceof WordArray) {
      const messageBytes: number[] = [];
      for (let i = 0; i < message.sigBytes; i++) {
        const byte = (message.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        messageBytes.push(byte);
      }
      messageBuffer = Buffer.from(messageBytes);
    } else {
      messageBuffer = Buffer.from(message);
    }
    
    let keyBuffer: Buffer;
    if (key instanceof WordArray) {
      const keyBytes: number[] = [];
      for (let i = 0; i < key.sigBytes; i++) {
        const byte = (key.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        keyBytes.push(byte);
      }
      keyBuffer = Buffer.from(keyBytes);
    } else {
      keyBuffer = Buffer.from(key);
    }
    
    // Generate IV if not provided
    let ivBuffer: Buffer;
    let providedIV: WordArray | null = null;
    
    if (cfg.iv && cfg.iv instanceof WordArray) {
      providedIV = cfg.iv; // Store the original IV
      const ivBytes = wordsToBytes(cfg.iv.words, cfg.iv.sigBytes);
      ivBuffer = Buffer.from(ivBytes);
    } else if (cfg.iv) {
      ivBuffer = Buffer.from(cfg.iv);
      // Convert buffer back to WordArray for consistency
      const ivBytes = Array.from(ivBuffer);
      const ivWords = bytesToWords(ivBytes);
      providedIV = new WordArray(ivWords, ivBytes.length);
    } else {
      ivBuffer = nodeCrypto.randomBytes(16);
    }
    
    // Encrypt using AES-256-CBC
    const cipher = nodeCrypto.createCipheriv('aes-256-cbc', keyBuffer.slice(0, 32), ivBuffer);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(messageBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Convert result to WordArray
    const encryptedWords: number[] = [];
    for (let i = 0; i < encrypted.length; i += 4) {
      const word = (encrypted[i] << 24) | (encrypted[i + 1] << 16) | (encrypted[i + 2] << 8) | encrypted[i + 3];
      encryptedWords.push(word);
    }
    
    return {
      ciphertext: new WordArray(encryptedWords, encrypted.length),
      iv: providedIV || (() => {
        // Convert IV buffer back to WordArray only if no IV was provided
        const ivBytes = Array.from(ivBuffer);
        const ivWords = bytesToWords(ivBytes);
        return new WordArray(ivWords, ivBytes.length);
      })(),
      salt: null
    };
  },
  
  decrypt: function(cipherParams: any, key: WordArray, cfg: any = {}): WordArray {
    // Convert key to buffer
    let keyBuffer: Buffer;
    if (key instanceof WordArray) {
      const keyBytes: number[] = [];
      for (let i = 0; i < key.sigBytes; i++) {
        const byte = (key.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        keyBytes.push(byte);
      }
      keyBuffer = Buffer.from(keyBytes);
    } else {
      keyBuffer = Buffer.from(key);
    }
    
    // Convert ciphertext to buffer
    let ciphertextBuffer: Buffer;
    if (cipherParams.ciphertext instanceof WordArray) {
      const cipherBytes: number[] = [];
      for (let i = 0; i < cipherParams.ciphertext.sigBytes; i++) {
        const byte = (cipherParams.ciphertext.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        cipherBytes.push(byte);
      }
      ciphertextBuffer = Buffer.from(cipherBytes);
    } else {
      ciphertextBuffer = Buffer.from(cipherParams.ciphertext);
    }
    
    // Get IV from cipherParams
    let ivBuffer: Buffer;
    if (cipherParams.iv instanceof WordArray) {
      const ivBytes: number[] = [];
      for (let i = 0; i < cipherParams.iv.sigBytes; i++) {
        const byte = (cipherParams.iv.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        ivBytes.push(byte);
      }
      ivBuffer = Buffer.from(ivBytes);
    } else {
      ivBuffer = Buffer.from(cipherParams.iv);
    }
    
    // Decrypt using AES-256-CBC
    const decipher = nodeCrypto.createDecipheriv('aes-256-cbc', keyBuffer.slice(0, 32), ivBuffer);
    decipher.setAutoPadding(true);
    
    let decrypted = decipher.update(ciphertextBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Convert result to WordArray
    const decryptedWords: number[] = [];
    for (let i = 0; i < decrypted.length; i += 4) {
      const word = (decrypted[i] << 24) | (decrypted[i + 1] << 16) | (decrypted[i + 2] << 8) | decrypted[i + 3];
      decryptedWords.push(word);
    }
    
    return new WordArray(decryptedWords, decrypted.length);
  }
};

// Create the enhanced CryptoJS wrapper
class CryptoJSWrapper {
  // Preserve original CryptoJS functionality
  private original = OriginalCryptoJS;
  
  // Enhanced encoding objects
  enc = {
    Utf8,
    Hex,
    Base64: {
      parse: function(base64Str: string): WordArray {
        const buffer = Buffer.from(base64Str, 'base64');
        const bytes = Array.from(buffer);
        const words = bytesToWords(bytes);
        return new WordArray(words, bytes.length);
      },
      
      stringify: function(wordArray: WordArray): string {
        const bytes = wordsToBytes(wordArray.words, wordArray.sigBytes);
        return Buffer.from(bytes).toString('base64');
      }
    }
  };
  
  // Enhanced lib objects
  lib = {
    WordArray,
    CipherParams: class CipherParams {
      ciphertext: WordArray;
      iv?: WordArray;
      salt?: WordArray;
      algorithm?: any;
      mode?: any;
      padding?: any;
      blockSize?: number;
      formatter?: any;

      constructor(cipherParams: any = {}) {
        this.ciphertext = cipherParams.ciphertext;
        this.iv = cipherParams.iv;
        this.salt = cipherParams.salt;
        this.algorithm = cipherParams.algorithm;
        this.mode = cipherParams.mode;
        this.padding = cipherParams.padding;
        this.blockSize = cipherParams.blockSize;
        this.formatter = cipherParams.formatter;
      }

      static create(cipherParams: any): any {
        return new this(cipherParams);
      }

      toString(formatter?: any): string {
        return formatter ? formatter.stringify(this) : this.ciphertext.toString();
      }
    }
  };
  
  // Enhanced algorithm objects
  algo = {
    SHA256: sha256Impl
  };
  
  // Enhanced padding objects
  pad = {
    Pkcs7: {
      pad: function(data: WordArray, blockSize: number): void {
        // PKCS7 padding is handled automatically by Node.js crypto
        // This is a no-op since Node.js handles padding internally
      },
      unpad: function(data: WordArray): void {
        // PKCS7 unpadding is handled automatically by Node.js crypto
        // This is a no-op since Node.js handles unpadding internally
      }
    }
  };
  
  // Enhanced functions
  PBKDF2 = pbkdf2Impl;
  SHA256 = sha256Impl;
  AES = aesImpl;
  
  // Proxy to original CryptoJS for any missing functionality
  [key: string]: any;
  
  constructor() {
    // Proxy any missing properties to original CryptoJS
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop as keyof CryptoJSWrapper];
        }
        return (this.original as any)[prop];
      }
    });
  }
}

// Create and export the enhanced CryptoJS instance
const EnhancedCryptoJS = new CryptoJSWrapper();

// Make it available globally for the client code
if (typeof global !== 'undefined') {
  (global as any).CryptoJS = EnhancedCryptoJS;
}

// Note: Module cache replacement not needed in ES module environment
// ES modules handle imports differently than CommonJS require()

// For ES modules, we need to intercept dynamic imports and static imports
// This is a more aggressive approach to ensure our polyfill is used everywhere
if (typeof global !== 'undefined') {
  // Store the original import function if it exists
  const originalImport = (global as any).__import__;
  
  // Override dynamic imports
  (global as any).__import__ = async function(specifier: string) {
    if (specifier === 'crypto-js' || specifier.endsWith('/crypto-js')) {
      return { default: EnhancedCryptoJS, ...EnhancedCryptoJS };
    }
    return originalImport ? originalImport(specifier) : import(specifier);
  };
}

console.log('CryptoJS Node.js compatibility wrapper loaded');

export default EnhancedCryptoJS;
export { WordArray, Utf8, Hex };

// Export all the properties that the original CryptoJS would have
export const enc = EnhancedCryptoJS.enc;
export const lib = EnhancedCryptoJS.lib;
export const algo = EnhancedCryptoJS.algo;
export const pad = EnhancedCryptoJS.pad;

// Export the main functions for `import * as CryptoJS` syntax
// Remove duplicate exports - they're already exported via the EnhancedCryptoJS object

// For compatibility with `import * as CryptoJS` syntax in ES modules
// Export all properties that the original CryptoJS would have
export const PBKDF2 = EnhancedCryptoJS.PBKDF2;
export const SHA256 = EnhancedCryptoJS.SHA256;
export const AES = EnhancedCryptoJS.AES;

// Make the enhanced CryptoJS available as both default and named exports
export { EnhancedCryptoJS as CryptoJS };