/**
 * Node.js crypto implementation
 * Consolidates all existing Node.js polyfills into a single, well-tested implementation
 */

import * as crypto from 'crypto';
import {
  CryptoInterface,
  CryptoKey,
  EncryptionResult,
  DecryptionOptions,
  PassphraseFingerprint,
  WordArray,
  CipherParams,
  EncodingInterface,
  HashFunction,
  AESInterface,
  PBKDF2Function,
  PaddingInterface
} from './types';

// WordArray implementation for Node.js compatibility
class NodeWordArray implements WordArray {
  words: number[];
  sigBytes: number;

  constructor(words: number[] = [], sigBytes?: number) {
    this.words = words.slice();
    this.sigBytes = sigBytes !== undefined ? sigBytes : words.length * 4;
  }

  static create(words?: number[], sigBytes?: number): WordArray {
    return new NodeWordArray(words, sigBytes);
  }

  concat(wordArray: WordArray): WordArray {
    const combinedWords = [...this.words, ...wordArray.words];
    const combinedSigBytes = this.sigBytes + wordArray.sigBytes;
    return new NodeWordArray(combinedWords, combinedSigBytes);
  }

  clone(): WordArray {
    return new NodeWordArray([...this.words], this.sigBytes);
  }

  clamp(): WordArray {
    const clampedWords = [...this.words];
    const fullWords = Math.floor(this.sigBytes / 4);
    const extraBytes = this.sigBytes % 4;
    
    if (extraBytes > 0 && clampedWords.length > fullWords) {
      const mask = (0xffffffff << (32 - extraBytes * 8)) >>> 0;
      clampedWords[fullWords] = clampedWords[fullWords] & mask;
    }
    
    clampedWords.length = Math.ceil(this.sigBytes / 4);
    this.words = clampedWords;
    return this;
  }

  toString(encoder?: any): string {
    if (encoder === NodeHex) {
      return NodeHex.stringify(this);
    } else if (encoder === NodeBase64) {
      return NodeBase64.stringify(this);
    } else {
      return NodeHex.stringify(this);
    }
  }
}

// CipherParams implementation
class NodeCipherParams implements CipherParams {
  ciphertext: WordArray;
  key?: WordArray;
  iv?: WordArray;
  salt?: WordArray;
  algorithm?: string;
  mode?: any;
  padding?: any;
  blockSize?: number;
  formatter?: any;

  constructor(cipherParams: {
    ciphertext: WordArray;
    key?: WordArray;
    iv?: WordArray;
    salt?: WordArray;
    algorithm?: string;
    mode?: any;
    padding?: any;
    blockSize?: number;
    formatter?: any;
  }) {
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
    return new NodeCipherParams(cipherParams);
  }

  toString(formatter?: any): string {
    return formatter ? formatter.stringify(this) : this.ciphertext.toString();
  }
}

// Encoding utilities
const NodeUtf8: EncodingInterface = {
  parse: (str: string): WordArray => {
    const bytes = Buffer.from(str, 'utf8');
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const word = (bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      words.push(word);
    }
    return NodeWordArray.create(words, bytes.length);
  },
  
  stringify: (wordArray: WordArray): string => {
    const bytes: number[] = [];
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

const NodeHex: EncodingInterface = {
  parse: (str: string): WordArray => {
    const bytes = Buffer.from(str, 'hex');
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const word = (bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      words.push(word);
    }
    return NodeWordArray.create(words, bytes.length);
  },
  
  stringify: (wordArray: WordArray): string => {
    const bytes: number[] = [];
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

const NodeBase64: EncodingInterface = {
  parse: (str: string): WordArray => {
    const bytes = Buffer.from(str, 'base64');
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const word = (bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      words.push(word);
    }
    return NodeWordArray.create(words, bytes.length);
  },
  
  stringify: (wordArray: WordArray): string => {
    const bytes: number[] = [];
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
const NodePBKDF2: PBKDF2Function = (password: string, salt: WordArray | string, cfg: any): WordArray => {
  const saltBytes = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : 
    Buffer.from(salt.toString(), 'utf8');
  
  const keySize = cfg.keySize || 8;
  const iterations = cfg.iterations || 1000;
  
  const derivedKey = crypto.pbkdf2Sync(password, saltBytes, iterations, keySize * 4, 'sha256');
  
  const words: number[] = [];
  for (let i = 0; i < derivedKey.length; i += 4) {
    const word = (derivedKey[i] << 24) | (derivedKey[i + 1] << 16) | 
                 (derivedKey[i + 2] << 8) | derivedKey[i + 3];
    words.push(word);
  }
  
  return NodeWordArray.create(words, derivedKey.length);
};

// SHA256 implementation
const NodeSHA256: HashFunction = (message: WordArray | string): WordArray => {
  const messageBytes = typeof message === 'string' ? 
    Buffer.from(message, 'utf8') : 
    Buffer.from(message.toString(), 'utf8');
  
  const hash = crypto.createHash('sha256').update(messageBytes).digest();
  
  const words: number[] = [];
  for (let i = 0; i < hash.length; i += 4) {
    const word = (hash[i] << 24) | (hash[i + 1] << 16) | (hash[i + 2] << 8) | hash[i + 3];
    words.push(word);
  }
  
  return NodeWordArray.create(words, hash.length);
};

// PKCS7 padding (no-op since Node.js handles this)
const NodePkcs7: PaddingInterface = {
  pad: function(data: WordArray, blockSize: number): void {
    // No-op - Node.js crypto handles padding automatically
  },
  
  unpad: function(data: WordArray): void {
    // No-op - Node.js crypto handles unpadding automatically
  }
};

// AES implementation
const NodeAES: AESInterface = {
  encrypt: (message: WordArray | string, key: WordArray, cfg?: any) => {
    try {
      let messageWordArray: WordArray;
      if (typeof message === 'string') {
        messageWordArray = NodeUtf8.parse(message);
      } else {
        messageWordArray = message;
      }
      
      // Convert WordArray to bytes
      const messageBytes = new Uint8Array(messageWordArray.sigBytes);
      for (let i = 0; i < messageWordArray.sigBytes; i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = messageWordArray.words[wordIndex] || 0;
        messageBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Convert key to bytes
      const keyBytes = new Uint8Array(32);
      for (let i = 0; i < Math.min(32, key.sigBytes); i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = key.words[wordIndex] || 0;
        keyBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Get IV
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
      
      // Encrypt
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBytes, ivBytes);
      cipher.setAutoPadding(true);
      
      const encrypted = cipher.update(Buffer.from(messageBytes));
      const final = cipher.final();
      const encryptedBuffer = Buffer.concat([encrypted, final]);
      
      // Convert to WordArrays
      const encryptedWords: number[] = [];
      for (let i = 0; i < encryptedBuffer.length; i += 4) {
        const word = ((encryptedBuffer[i] << 24) |
                     ((encryptedBuffer[i + 1] || 0) << 16) |
                     ((encryptedBuffer[i + 2] || 0) << 8) |
                     (encryptedBuffer[i + 3] || 0)) >>> 0;
        encryptedWords.push(word);
      }
      
      const ciphertext = NodeWordArray.create(encryptedWords, encryptedBuffer.length);
      
      const ivWords: number[] = [];
      for (let i = 0; i < ivBytes.length; i += 4) {
        const word = ((ivBytes[i] << 24) |
                     ((ivBytes[i + 1] || 0) << 16) |
                     ((ivBytes[i + 2] || 0) << 8) |
                     (ivBytes[i + 3] || 0)) >>> 0;
        ivWords.push(word);
      }
      const ivWordArray = NodeWordArray.create(ivWords, ivBytes.length);
      
      return {
        ciphertext,
        iv: ivWordArray,
        toString: () => NodeBase64.stringify(ciphertext)
      };
    } catch (error) {
      throw new Error(`AES encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  decrypt: (cipherParams: any, key: WordArray, cfg?: any): WordArray => {
    try {
      // Convert key to bytes
      const keyBytes = new Uint8Array(32);
      for (let i = 0; i < Math.min(32, key.sigBytes); i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = key.words[wordIndex] || 0;
        keyBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Get IV
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
      
      // Convert ciphertext to bytes
      const cipherBytes = new Uint8Array(cipherParams.ciphertext.sigBytes);
      for (let i = 0; i < cipherParams.ciphertext.sigBytes; i++) {
        const wordIndex = Math.floor(i / 4);
        const byteIndex = i % 4;
        const word = cipherParams.ciphertext.words[wordIndex] || 0;
        cipherBytes[i] = (word >>> (24 - byteIndex * 8)) & 0xff;
      }
      
      // Decrypt
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyBytes, ivBytes);
      decipher.setAutoPadding(true);
      
      const decrypted = decipher.update(Buffer.from(cipherBytes));
      const final = decipher.final();
      const decryptedBuffer = Buffer.concat([decrypted, final]);
      
      // Convert to WordArray
      const decryptedWords: number[] = [];
      for (let i = 0; i < decryptedBuffer.length; i += 4) {
        const word = ((decryptedBuffer[i] << 24) |
                     ((decryptedBuffer[i + 1] || 0) << 16) |
                     ((decryptedBuffer[i + 2] || 0) << 8) |
                     (decryptedBuffer[i + 3] || 0)) >>> 0;
        decryptedWords.push(word);
      }
      
      return NodeWordArray.create(decryptedWords, decryptedBuffer.length);
    } catch (error) {
      throw new Error(`AES decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Main Node.js crypto implementation
export class NodeCrypto implements CryptoInterface {
  // Expose CryptoJS-like interface for compatibility
  public readonly enc = {
    Utf8: NodeUtf8,
    Hex: NodeHex,
    Base64: NodeBase64
  };

  public readonly lib = {
    WordArray: NodeWordArray,
    CipherParams: NodeCipherParams
  };

  public readonly algo = {
    SHA256: NodeSHA256
  };

  public readonly pad = {
    Pkcs7: NodePkcs7
  };

  public readonly PBKDF2 = NodePBKDF2;
  public readonly SHA256 = NodeSHA256;
  public readonly AES = NodeAES;

  async deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
    try {
      const salt = NodeUtf8.parse('ShareThings-Salt-2025');
      
      const key = NodePBKDF2(passphrase, salt, {
        keySize: 256/32,
        iterations: 100000,
        hasher: NodeSHA256
      });
      
      return {
        key: key,
        algorithm: 'AES',
        usages: ['encrypt', 'decrypt'],
        type: 'secret',
        extractable: true
      };
    } catch (error) {
      throw new Error(`Failed to derive key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateDeterministicIV(passphrase: string, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    try {
      const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
      
      const dataWords: number[] = [];
      for (let i = 0; i < dataArray.length; i += 4) {
        dataWords.push(
          ((dataArray[i] || 0) << 24) |
          ((dataArray[i + 1] || 0) << 16) |
          ((dataArray[i + 2] || 0) << 8) |
          (dataArray[i + 3] || 0)
        );
      }
      const dataWordArray = NodeWordArray.create(dataWords, dataArray.length);
      
      const passphraseWordArray = NodeUtf8.parse(passphrase);
      const combinedWordArray = passphraseWordArray.concat(dataWordArray);
      
      const hash = NodeSHA256(combinedWordArray);
      
      const hashWords = hash.words;
      const hashBytes = new Uint8Array(16);
      for (let i = 0; i < 4; i++) {
        const word = hashWords[i];
        hashBytes[i * 4] = (word >>> 24) & 0xff;
        hashBytes[i * 4 + 1] = (word >>> 16) & 0xff;
        hashBytes[i * 4 + 2] = (word >>> 8) & 0xff;
        hashBytes[i * 4 + 3] = word & 0xff;
      }
      
      return hashBytes.slice(0, 12);
    } catch (error) {
      throw new Error(`Failed to generate IV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async encryptData(
    key: CryptoKey,
    data: ArrayBuffer | Uint8Array,
    passphrase: string
  ): Promise<EncryptionResult> {
    try {
      const iv = await this.generateDeterministicIV(passphrase, data);
      
      const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
      const dataWords: number[] = [];
      for (let i = 0; i < dataArray.length; i += 4) {
        dataWords.push(
          ((dataArray[i] || 0) << 24) |
          ((dataArray[i + 1] || 0) << 16) |
          ((dataArray[i + 2] || 0) << 8) |
          (dataArray[i + 3] || 0)
        );
      }
      const dataWordArray = NodeWordArray.create(dataWords, dataArray.length);
      
      const ivWords: number[] = [];
      for (let i = 0; i < iv.length; i += 4) {
        ivWords.push(
          ((iv[i] || 0) << 24) |
          ((iv[i + 1] || 0) << 16) |
          ((iv[i + 2] || 0) << 8) |
          (iv[i + 3] || 0)
        );
      }
      const ivWordArray = NodeWordArray.create(ivWords, iv.length);
      
      const encrypted = NodeAES.encrypt(dataWordArray, key.key, {
        iv: ivWordArray,
        padding: NodePkcs7
      });
      
      const ciphertext = encrypted.ciphertext;
      const encryptedWords = ciphertext.words;
      const encryptedBytes = new Uint8Array(ciphertext.sigBytes);
      
      for (let i = 0; i < encryptedBytes.length; i += 4) {
        const word = encryptedWords[i / 4];
        encryptedBytes[i] = (word >>> 24) & 0xff;
        if (i + 1 < encryptedBytes.length) encryptedBytes[i + 1] = (word >>> 16) & 0xff;
        if (i + 2 < encryptedBytes.length) encryptedBytes[i + 2] = (word >>> 8) & 0xff;
        if (i + 3 < encryptedBytes.length) encryptedBytes[i + 3] = word & 0xff;
      }
      
      return { encryptedData: encryptedBytes.buffer, iv };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async decryptData(
    key: CryptoKey,
    encryptedData: ArrayBuffer | Uint8Array,
    iv: Uint8Array,
    options?: DecryptionOptions
  ): Promise<ArrayBuffer> {
    try {
      const encryptedArray = new Uint8Array(encryptedData instanceof ArrayBuffer ? encryptedData : encryptedData.buffer);
      const encryptedWords: number[] = [];
      for (let i = 0; i < encryptedArray.length; i += 4) {
        encryptedWords.push(
          ((encryptedArray[i] || 0) << 24) |
          ((encryptedArray[i + 1] || 0) << 16) |
          ((encryptedArray[i + 2] || 0) << 8) |
          (encryptedArray[i + 3] || 0)
        );
      }
      
      const encryptedWordArray = NodeWordArray.create(encryptedWords, encryptedArray.length);
      
      const ivWords: number[] = [];
      for (let i = 0; i < iv.length; i += 4) {
        ivWords.push(
          ((iv[i] || 0) << 24) |
          ((iv[i + 1] || 0) << 16) |
          ((iv[i + 2] || 0) << 8) |
          (iv[i + 3] || 0)
        );
      }
      const ivWordArray = NodeWordArray.create(ivWords, iv.length);
      
      const cipherParams = new NodeCipherParams({
        ciphertext: encryptedWordArray
      });
      
      const decrypted = NodeAES.decrypt(cipherParams, key.key, {
        iv: ivWordArray,
        padding: NodePkcs7
      });
      
      const decryptedWords = decrypted.words;
      const decryptedBytes = new Uint8Array(decrypted.sigBytes);
      
      for (let i = 0; i < decrypted.sigBytes; i += 4) {
        const word = decryptedWords[i / 4];
        decryptedBytes[i] = (word >>> 24) & 0xff;
        if (i + 1 < decrypted.sigBytes) decryptedBytes[i + 1] = (word >>> 16) & 0xff;
        if (i + 2 < decrypted.sigBytes) decryptedBytes[i + 2] = (word >>> 8) & 0xff;
        if (i + 3 < decrypted.sigBytes) decryptedBytes[i + 3] = word & 0xff;
      }
      
      return decryptedBytes.buffer;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async encryptText(passphrase: string, text: string): Promise<{ encryptedText: string; iv: string }> {
    try {
      const key = await this.deriveKeyFromPassphrase(passphrase);
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      
      const { encryptedData, iv } = await this.encryptData(key, data, passphrase);
      
      // Use the same base64 encoding pattern as client (btoa equivalent)
      const encryptedText = btoa(
        Array.from(new Uint8Array(encryptedData))
          .map(byte => String.fromCharCode(byte))
          .join('')
      );
      
      const ivBase64 = btoa(
        Array.from(iv)
          .map(byte => String.fromCharCode(byte))
          .join('')
      );
      
      return { encryptedText, iv: ivBase64 };
    } catch (error) {
      throw new Error(`Text encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async decryptText(passphrase: string, encryptedText: string, ivBase64: string): Promise<string> {
    try {
      const key = await this.deriveKeyFromPassphrase(passphrase);
      
      // Use the same base64 decoding pattern as client (atob equivalent)
      const encryptedBytes = Uint8Array.from(
        atob(encryptedText)
          .split('')
          .map(char => char.charCodeAt(0))
      );
      
      const iv = Uint8Array.from(
        atob(ivBase64)
          .split('')
          .map(char => char.charCodeAt(0))
      );
      
      const decryptedData = await this.decryptData(key, encryptedBytes, iv);
      const decoder = new TextDecoder();
      const text = decoder.decode(decryptedData);
      
      if (text.length === 0) {
        throw new Error('Decryption failed: Empty result');
      }
      
      return text;
    } catch (error) {
      throw new Error(`Text decryption failed: ${error instanceof Error ? error.message : 'Wrong passphrase or corrupted data'}`);
    }
  }

  async generateFingerprint(passphrase: string): Promise<PassphraseFingerprint> {
    try {
      const fixedIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const passphraseWordArray = NodeUtf8.parse(passphrase);
      const hash = NodeSHA256(passphraseWordArray);
      
      const hashWords = hash.words;
      const hashBytes = new Uint8Array(hash.sigBytes);
      for (let i = 0; i < hashBytes.length; i += 4) {
        const word = hashWords[i / 4];
        hashBytes[i] = (word >>> 24) & 0xff;
        if (i + 1 < hashBytes.length) hashBytes[i + 1] = (word >>> 16) & 0xff;
        if (i + 2 < hashBytes.length) hashBytes[i + 2] = (word >>> 8) & 0xff;
        if (i + 3 < hashBytes.length) hashBytes[i + 3] = word & 0xff;
      }
      
      const dataBytes = hashBytes.slice(0, 16);
      
      return {
        iv: Array.from(fixedIv),
        data: Array.from(dataBytes)
      };
    } catch (error) {
      throw new Error(`Failed to generate fingerprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async encryptBlob(passphrase: string, blob: Blob): Promise<{ encryptedBlob: Blob; iv: Uint8Array }> {
    try {
      const key = await this.deriveKeyFromPassphrase(passphrase);
      const data = await blob.arrayBuffer();
      const { encryptedData, iv } = await this.encryptData(key, data, passphrase);
      const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
      return { encryptedBlob, iv };
    } catch (error) {
      throw new Error(`Blob encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async decryptBlob(
    passphrase: string,
    encryptedBlob: Blob,
    iv: Uint8Array,
    mimeType: string
  ): Promise<Blob> {
    try {
      const key = await this.deriveKeyFromPassphrase(passphrase);
      const encryptedData = await encryptedBlob.arrayBuffer();
      const decryptedData = await this.decryptData(key, encryptedData, iv);
      const decryptedBlob = new Blob([decryptedData], { type: mimeType });
      return decryptedBlob;
    } catch (error) {
      throw new Error(`Blob decryption failed: ${error instanceof Error ? error.message : 'Wrong passphrase or corrupted data'}`);
    }
  }
}