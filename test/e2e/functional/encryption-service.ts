/**
 * Service for handling encryption and decryption - using CryptoJS only
 */

// Import our unified crypto system
import '../../../shared/crypto/polyfills';

// Lazy access to CryptoJS - only check when needed
function getCryptoJS() {
  const CryptoJS = (globalThis as any).CryptoJS || (global as any).CryptoJS;
  if (!CryptoJS) {
    throw new Error('CryptoJS polyfill not available. Make sure polyfills are loaded.');
  }
  return CryptoJS;
}

// Define interface for our crypto key
interface CryptoKey {
  key: any; // Use any to avoid type conflicts
  algorithm: string;
  usages: string[];
  type: string;
  extractable: boolean;
}

export class EncryptionService {
  private key: CryptoKey | null = null;
  private salt: Uint8Array | null = null;

  /**
   * Initializes the encryption service with a passphrase
   * @param passphrase Passphrase to derive key from
   * @param salt Optional salt for key derivation
   */
  async initialize(passphrase: string, salt?: Uint8Array): Promise<void> {
    const result = await this.deriveKey(passphrase, salt);
    this.key = result.key;
    this.salt = result.salt;
  }

  /**
   * Encrypts data
   * @param data Data to encrypt (string or ArrayBuffer)
   * @param iv Optional initialization vector
   * @returns Encrypted data and IV
   */
  async encrypt(data: string | ArrayBuffer, iv?: Uint8Array): Promise<{ encryptedData: ArrayBuffer, iv: Uint8Array }> {
    if (!this.key) {
      throw new Error('Encryption service not initialized');
    }

    // Generate IV if not provided
    if (!iv) {
      iv = new Uint8Array(12);
      // Generate random IV using crypto.getRandomValues if available, otherwise use Math.random
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(iv);
      } else {
        for (let i = 0; i < iv.length; i++) {
          iv[i] = Math.floor(Math.random() * 256);
        }
      }
    }

    // Convert data to ArrayBuffer if it's a string
    const dataBuffer = typeof data === 'string' 
      ? new TextEncoder().encode(data) 
      : data;

    // Convert data to WordArray
    const dataArray = new Uint8Array(dataBuffer);
    const dataWords = [];
    for (let i = 0; i < dataArray.length; i += 4) {
      dataWords.push(
        ((dataArray[i] || 0) << 24) |
        ((dataArray[i + 1] || 0) << 16) |
        ((dataArray[i + 2] || 0) << 8) |
        (dataArray[i + 3] || 0)
      );
    }
    const CryptoJS = getCryptoJS();
    const dataWordArray = CryptoJS.lib.WordArray.create(dataWords, dataArray.length);

    // Convert IV to WordArray
    const ivWords = [];
    for (let i = 0; i < iv.length; i += 4) {
      ivWords.push(
        ((iv[i] || 0) << 24) |
        ((iv[i + 1] || 0) << 16) |
        ((iv[i + 2] || 0) << 8) |
        (iv[i + 3] || 0)
      );
    }
    const ivWordArray = CryptoJS.lib.WordArray.create(ivWords, iv.length);

    // Encrypt data
    const encrypted = CryptoJS.AES.encrypt(dataWordArray, this.key.key, {
      iv: ivWordArray,
      padding: CryptoJS.pad.Pkcs7
    });

    // Convert to ArrayBuffer
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
  }

  /**
   * Decrypts data
   * @param encryptedData Encrypted data
   * @param iv Initialization vector
   * @param outputType Output type (string or arraybuffer)
   * @returns Decrypted data
   */
  async decrypt(
    encryptedData: ArrayBuffer, 
    iv: Uint8Array,
    outputType: 'string' | 'arraybuffer' = 'arraybuffer'
  ): Promise<string | ArrayBuffer> {
    if (!this.key) {
      throw new Error('Encryption service not initialized');
    }

    try {
      // Convert encryptedData to WordArray
      const encryptedArray = new Uint8Array(encryptedData);
      const encryptedWords = [];
      for (let i = 0; i < encryptedArray.length; i += 4) {
        encryptedWords.push(
          ((encryptedArray[i] || 0) << 24) |
          ((encryptedArray[i + 1] || 0) << 16) |
          ((encryptedArray[i + 2] || 0) << 8) |
          (encryptedArray[i + 3] || 0)
        );
      }
      
      const CryptoJS = getCryptoJS();
      
      // Create WordArray from encryptedData
      const encryptedWordArray = CryptoJS.lib.WordArray.create(encryptedWords, encryptedArray.length);
      
      // Convert IV to WordArray
      const ivWords = [];
      for (let i = 0; i < iv.length; i += 4) {
        ivWords.push(
          ((iv[i] || 0) << 24) |
          ((iv[i + 1] || 0) << 16) |
          ((iv[i + 2] || 0) << 8) |
          (iv[i + 3] || 0)
        );
      }
      const ivWordArray = CryptoJS.lib.WordArray.create(ivWords, iv.length);
      
      // Create a CipherParams object with just the ciphertext
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: encryptedWordArray
      });
      
      // Decrypt data
      const decrypted = CryptoJS.AES.decrypt(cipherParams, this.key.key, {
        iv: ivWordArray,
        padding: CryptoJS.pad.Pkcs7
      });
      
      // Convert to ArrayBuffer - use sigBytes which is the actual decrypted data length (padding removed)
      const decryptedWords = decrypted.words;
      const decryptedBytes = new Uint8Array(decrypted.sigBytes);
      
      for (let i = 0; i < decrypted.sigBytes; i += 4) {
        const word = decryptedWords[i / 4];
        decryptedBytes[i] = (word >>> 24) & 0xff;
        if (i + 1 < decrypted.sigBytes) decryptedBytes[i + 1] = (word >>> 16) & 0xff;
        if (i + 2 < decrypted.sigBytes) decryptedBytes[i + 2] = (word >>> 8) & 0xff;
        if (i + 3 < decrypted.sigBytes) decryptedBytes[i + 3] = word & 0xff;
      }
      
      // If decryption succeeded but returned empty data, that's suspicious
      if (decryptedBytes.length === 0) {
        throw new Error('Decryption failed: Empty result');
      }

      // Return as string or ArrayBuffer based on outputType
      if (outputType === 'string') {
        return new TextDecoder().decode(decryptedBytes.buffer);
      }

      return decryptedBytes.buffer;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data. The passphrase may be incorrect.');
    }
  }

  /**
   * Derives a key from a passphrase
   * @param passphrase Passphrase to derive key from
   * @param salt Optional salt for key derivation
   * @returns Derived key and salt
   */
  private async deriveKey(passphrase: string, salt?: Uint8Array): Promise<{ key: CryptoKey, salt: Uint8Array }> {
    // Generate salt if not provided
    if (!salt) {
      salt = new Uint8Array(16);
      // Generate random salt using crypto.getRandomValues if available, otherwise use Math.random
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(salt);
      } else {
        for (let i = 0; i < salt.length; i++) {
          salt[i] = Math.floor(Math.random() * 256);
        }
      }
    }

    // Convert salt to WordArray
    const saltWords = [];
    for (let i = 0; i < salt.length; i += 4) {
      saltWords.push(
        ((salt[i] || 0) << 24) |
        ((salt[i + 1] || 0) << 16) |
        ((salt[i + 2] || 0) << 8) |
        (salt[i + 3] || 0)
      );
    }
    const CryptoJS = getCryptoJS();
    const saltWordArray = CryptoJS.lib.WordArray.create(saltWords, salt.length);

    // Derive the key using PBKDF2
    const key = CryptoJS.PBKDF2(passphrase, saltWordArray, {
      keySize: 256/32, // 256 bits
      iterations: 100000,
      hasher: CryptoJS.algo.SHA256
    });

    // Return a crypto key object
    const cryptoKey: CryptoKey = {
      key: key,
      algorithm: 'AES',
      usages: ['encrypt', 'decrypt'],
      type: 'secret',
      extractable: true
    };

    return { key: cryptoKey, salt };
  }
}