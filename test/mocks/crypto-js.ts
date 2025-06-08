/**
 * Jest mock for crypto-js that uses Node.js crypto
 * This file replaces crypto-js imports during testing
 */

import * as crypto from 'crypto';

// WordArray implementation for compatibility
class WordArray {
  words: number[];
  sigBytes: number;

  constructor(words: number[] = [], sigBytes?: number) {
    this.words = words;
    this.sigBytes = sigBytes !== undefined ? sigBytes : words.length * 4;
  }

  static create(words?: number[], sigBytes?: number): WordArray {
    return new WordArray(words, sigBytes);
  }

  concat(wordArray: WordArray): WordArray {
    // Combine the words arrays
    const combinedWords = [...this.words, ...wordArray.words];
    const combinedSigBytes = this.sigBytes + wordArray.sigBytes;
    return new WordArray(combinedWords, combinedSigBytes);
  }

  clone(): WordArray {
    // Create a deep copy of the WordArray
    return new WordArray([...this.words], this.sigBytes);
  }

  clamp(): WordArray {
    // Clamp the WordArray to its actual byte length
    // This removes any extra bits beyond sigBytes
    const clampedWords = [...this.words];
    const fullWords = Math.floor(this.sigBytes / 4);
    const extraBytes = this.sigBytes % 4;
    
    if (extraBytes > 0 && clampedWords.length > fullWords) {
      // Mask the last partial word to only include the valid bytes
      const mask = (0xffffffff << (32 - extraBytes * 8)) >>> 0;
      clampedWords[fullWords] = clampedWords[fullWords] & mask;
    }
    
    // Remove any words beyond what's needed
    clampedWords.length = Math.ceil(this.sigBytes / 4);
    
    this.words = clampedWords;
    return this;
  }

  toString(encoder?: any): string {
    if (encoder === Hex) {
      return Hex.stringify(this);
    } else if (encoder === Base64) {
      return Base64.stringify(this);
    } else {
      // Default to hex representation for compatibility
      return Hex.stringify(this);
    }
  }
}

// CipherParams class for compatibility
class CipherParams {
  ciphertext: WordArray;
  key?: WordArray;
  iv?: WordArray;
  salt?: WordArray;
  algorithm?: string;
  mode?: any;
  padding?: any;
  blockSize?: number;
  formatter?: any;

  constructor(cipherParams: any) {
    this.ciphertext = cipherParams.ciphertext;
    this.key = cipherParams.key;
    this.iv = cipherParams.iv;
    this.salt = cipherParams.salt;
    this.algorithm = cipherParams.algorithm;
    this.mode = cipherParams.mode;
    this.padding = cipherParams.padding;
    this.blockSize = cipherParams.blockSize;
    this.formatter = cipherParams.formatter;
  }

  static create(cipherParams: any): CipherParams {
    return new CipherParams(cipherParams);
  }

  toString(formatter?: any): string {
    return formatter ? formatter.stringify(this) : this.ciphertext.toString();
  }
}

// Encoding utilities
const Utf8 = {
  parse: (str: string): WordArray => {
    const bytes = Buffer.from(str, 'utf8');
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const word = (bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      words.push(word);
    }
    return new WordArray(words, bytes.length);
  },
  stringify: (wordArray: WordArray): string => {
    const bytes = [];
    for (let i = 0; i < wordArray.sigBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      const word = wordArray.words[wordIndex] || 0;
      const byte = (word >>> (24 - byteIndex * 8)) & 0xff;
      bytes.push(byte);
    }
    return Buffer.from(bytes).toString('utf8');
  }
};

const Hex = {
  parse: (str: string): WordArray => {
    const bytes = Buffer.from(str, 'hex');
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const word = (bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      words.push(word);
    }
    return new WordArray(words, bytes.length);
  },
  stringify: (wordArray: WordArray): string => {
    const bytes = [];
    for (let i = 0; i < wordArray.sigBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      const word = wordArray.words[wordIndex] || 0;
      const byte = (word >>> (24 - byteIndex * 8)) & 0xff;
      bytes.push(byte);
    }
    return Buffer.from(bytes).toString('hex');
  }
};

const Base64 = {
  parse: (str: string): WordArray => {
    const bytes = Buffer.from(str, 'base64');
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const word = (bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      words.push(word);
    }
    return new WordArray(words, bytes.length);
  },
  stringify: (wordArray: WordArray): string => {
    const bytes = [];
    for (let i = 0; i < wordArray.sigBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      const word = wordArray.words[wordIndex] || 0;
      const byte = (word >>> (24 - byteIndex * 8)) & 0xff;
      bytes.push(byte);
    }
    return Buffer.from(bytes).toString('base64');
  }
};

// PBKDF2 implementation
function PBKDF2(password: string, salt: WordArray | string, cfg: any): WordArray {
  const saltBytes = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : 
    Buffer.from(salt.toString(), 'utf8');
  
  const keySize = cfg.keySize || 8; // Default 256 bits = 8 words
  const iterations = cfg.iterations || 1000;
  
  const derivedKey = crypto.pbkdf2Sync(password, saltBytes, iterations, keySize * 4, 'sha256');
  
  const words: number[] = [];
  for (let i = 0; i < derivedKey.length; i += 4) {
    const word = (derivedKey[i] << 24) | (derivedKey[i + 1] << 16) | 
                 (derivedKey[i + 2] << 8) | derivedKey[i + 3];
    words.push(word);
  }
  
  return new WordArray(words, derivedKey.length);
}

// SHA256 implementation
function SHA256(message: WordArray | string): WordArray {
  const messageBytes = typeof message === 'string' ? 
    Buffer.from(message, 'utf8') : 
    Buffer.from(message.toString(), 'utf8');
  
  const hash = crypto.createHash('sha256').update(messageBytes).digest();
  
  const words: number[] = [];
  for (let i = 0; i < hash.length; i += 4) {
    const word = (hash[i] << 24) | (hash[i + 1] << 16) | (hash[i + 2] << 8) | hash[i + 3];
    words.push(word);
  }
  
  return new WordArray(words, hash.length);
}

// PKCS7 padding implementation
const Pkcs7 = {
  pad: function(data: WordArray, blockSize: number): void {
    // PKCS7 padding - add padding bytes equal to the number of padding bytes needed
    const blockSizeBytes = blockSize * 4; // blockSize is in words (32-bit), convert to bytes
    const dataBytes = data.sigBytes;
    const paddingBytes = blockSizeBytes - (dataBytes % blockSizeBytes);
    
    // Add padding words
    const paddingWords = Math.ceil(paddingBytes / 4);
    for (let i = 0; i < paddingWords; i++) {
      data.words.push(0);
    }
    data.sigBytes += paddingBytes;
  },
  
  unpad: function(data: WordArray): void {
    // Remove PKCS7 padding
    const dataBytes = data.sigBytes;
    if (dataBytes === 0) return;
    
    // Get the last byte to determine padding length
    const lastWordIndex = Math.floor((dataBytes - 1) / 4);
    const lastByteIndex = (dataBytes - 1) % 4;
    const lastWord = data.words[lastWordIndex] || 0;
    const paddingLength = (lastWord >>> (24 - lastByteIndex * 8)) & 0xff;
    
    // Remove padding
    data.sigBytes -= paddingLength;
  }
};

// AES implementation
const AES = {
  encrypt: (message: WordArray | string, key: WordArray, cfg?: any): any => {
    try {
      // Convert message to WordArray if it's a string
      let messageWordArray: WordArray;
      if (typeof message === 'string') {
        messageWordArray = Utf8.parse(message);
      } else {
        messageWordArray = message;
      }
      
      // Convert WordArray to bytes for Node.js crypto
      const messageBytes = new Uint8Array(messageWordArray.sigBytes);
      for (let i = 0; i < messageWordArray.sigBytes; i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = messageWordArray.words[wordIndex] || 0;
        messageBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Convert key WordArray to bytes
      const keyBytes = new Uint8Array(32); // 256-bit key
      for (let i = 0; i < Math.min(32, key.sigBytes); i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = key.words[wordIndex] || 0;
        keyBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Get IV from config or generate random
      let ivBytes: Uint8Array;
      if (cfg?.iv) {
        ivBytes = new Uint8Array(16);
        for (let i = 0; i < Math.min(16, cfg.iv.sigBytes); i++) {
          const wordIndex = Math.floor(i / 4);
          const byteIndex = i % 4;
          const word = cfg.iv.words[wordIndex] || 0;
          ivBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
        }
      } else {
        ivBytes = crypto.randomBytes(16);
      }
      
      // Encrypt using Node.js crypto
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBytes, ivBytes);
      cipher.setAutoPadding(true); // Enable PKCS7 padding
      
      let encrypted = cipher.update(Buffer.from(messageBytes));
      const final = cipher.final();
      const encryptedBuffer = Buffer.concat([encrypted, final]);
      
      // Convert encrypted bytes back to WordArray
      const encryptedWords: number[] = [];
      for (let i = 0; i < encryptedBuffer.length; i += 4) {
        const word = ((encryptedBuffer[i] << 24) |
                     ((encryptedBuffer[i + 1] || 0) << 16) |
                     ((encryptedBuffer[i + 2] || 0) << 8) |
                     (encryptedBuffer[i + 3] || 0)) >>> 0; // Ensure unsigned 32-bit
        encryptedWords.push(word);
      }
      
      const ciphertext = new WordArray(encryptedWords, encryptedBuffer.length);
      
      // Convert IV back to WordArray
      const ivWords: number[] = [];
      for (let i = 0; i < ivBytes.length; i += 4) {
        const word = ((ivBytes[i] << 24) |
                     ((ivBytes[i + 1] || 0) << 16) |
                     ((ivBytes[i + 2] || 0) << 8) |
                     (ivBytes[i + 3] || 0)) >>> 0; // Ensure unsigned 32-bit
        ivWords.push(word);
      }
      const ivWordArray = new WordArray(ivWords, ivBytes.length);
      
      return {
        ciphertext,
        iv: ivWordArray,
        toString: () => Base64.stringify(ciphertext)
      };
    } catch (error) {
      throw new Error(`AES encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  decrypt: (cipherParams: any, key: WordArray, cfg?: any): WordArray => {
    try {
      // Convert key WordArray to bytes
      const keyBytes = new Uint8Array(32); // 256-bit key
      for (let i = 0; i < Math.min(32, key.sigBytes); i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = key.words[wordIndex] || 0;
        keyBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Get IV - check both cfg.iv and cipherParams.iv
      let ivBytes: Uint8Array;
      const ivSource = cfg?.iv || cipherParams.iv;
      if (ivSource) {
        ivBytes = new Uint8Array(16);
        for (let i = 0; i < Math.min(16, ivSource.sigBytes); i++) {
          const wordIndex = Math.floor(i / 4);
          const byteIndex = i % 4;
          const word = ivSource.words[wordIndex] || 0;
          ivBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
        }
      } else {
        throw new Error('IV is required for decryption');
      }
      
      // Convert ciphertext WordArray to bytes
      const cipherBytes = new Uint8Array(cipherParams.ciphertext.sigBytes);
      for (let i = 0; i < cipherParams.ciphertext.sigBytes; i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = cipherParams.ciphertext.words[wordIndex] || 0;
        cipherBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Decrypt using Node.js crypto
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyBytes, ivBytes);
      decipher.setAutoPadding(true); // Enable PKCS7 padding removal
      
      let decrypted = decipher.update(Buffer.from(cipherBytes));
      const final = decipher.final();
      const decryptedBuffer = Buffer.concat([decrypted, final]);
      
      // Convert decrypted bytes back to WordArray
      const decryptedWords: number[] = [];
      for (let i = 0; i < decryptedBuffer.length; i += 4) {
        const word = ((decryptedBuffer[i] << 24) |
                     ((decryptedBuffer[i + 1] || 0) << 16) |
                     ((decryptedBuffer[i + 2] || 0) << 8) |
                     (decryptedBuffer[i + 3] || 0)) >>> 0; // Ensure unsigned 32-bit
        decryptedWords.push(word);
      }
      
      return new WordArray(decryptedWords, decryptedBuffer.length);
    } catch (error) {
      throw new Error(`AES decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

};

// Main CryptoJS object
const CryptoJS = {
  PBKDF2,
  SHA256,
  AES,
  enc: {
    Utf8,
    Hex,
    Base64
  },
  lib: {
    WordArray,
    CipherParams
  },
  algo: {
    SHA256
  },
  pad: {
    Pkcs7
  }
};

// Set up global CryptoJS object for server environment
if (typeof global !== 'undefined') {
  (global as any).CryptoJS = CryptoJS;
}

// Export for different import patterns
export default CryptoJS;
export { PBKDF2, SHA256, AES, Utf8, Hex, Base64, WordArray, Pkcs7 };
export const enc = CryptoJS.enc;
export const lib = CryptoJS.lib;
export const algo = CryptoJS.algo;
export const pad = CryptoJS.pad;
