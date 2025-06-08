/**
 * Encryption utilities for testing - using CryptoJS only
 */

// Import our CryptoJS polyfill instead of direct CryptoJS
import CryptoJS from './cryptojs-node-polyfill';

// Define interface for our crypto key
interface CryptoKey {
  key: any; // Use any to avoid type conflicts
  algorithm: string;
  usages: string[];
  type: string;
  extractable: boolean;
}

/**
 * Derives an encryption key from a passphrase
 * @param passphrase The passphrase to derive the key from
 * @returns The derived key
 */
export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
  try {
    // Use a fixed salt for deterministic key derivation
    const salt = CryptoJS.enc.Utf8.parse('ShareThings-Salt-2025');
    
    // Derive the key using PBKDF2
    const key = CryptoJS.PBKDF2(passphrase, salt, {
      keySize: 256/32, // 256 bits
      iterations: 100000,
      hasher: CryptoJS.algo.SHA256
    });
    
    // Return a crypto key object
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

/**
 * Generates a deterministic IV from the passphrase and data
 * @param passphrase The passphrase
 * @param data The data to generate the IV from
 * @returns The deterministic IV
 */
async function generateDeterministicIV(passphrase: string, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  try {
    // Convert data to array
    const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    
    // Convert to WordArray for CryptoJS
    const dataWords = [];
    for (let i = 0; i < dataArray.length; i += 4) {
      dataWords.push(
        ((dataArray[i] || 0) << 24) |
        ((dataArray[i + 1] || 0) << 16) |
        ((dataArray[i + 2] || 0) << 8) |
        (dataArray[i + 3] || 0)
      );
    }
    const dataWordArray = CryptoJS.lib.WordArray.create(dataWords, dataArray.length);
    
    // Combine passphrase and data
    const passphraseWordArray = CryptoJS.enc.Utf8.parse(passphrase);
    const combinedWordArray = CryptoJS.lib.WordArray.create()
      .concat(passphraseWordArray)
      .concat(dataWordArray);
    
    // Hash the combined data
    const hash = CryptoJS.SHA256(combinedWordArray);
    
    // Convert to Uint8Array and use first 12 bytes as IV
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

/**
 * Encrypts data with a key
 * @param key The encryption key
 * @param data The data to encrypt
 * @param passphrase The passphrase (used for IV generation)
 * @returns The encrypted data and IV
 */
export async function encryptData(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
  try {
    // Generate IV
    const iv = await generateDeterministicIV(passphrase, data);
    
    // Convert data to WordArray
    const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    const dataWords = [];
    for (let i = 0; i < dataArray.length; i += 4) {
      dataWords.push(
        ((dataArray[i] || 0) << 24) |
        ((dataArray[i + 1] || 0) << 16) |
        ((dataArray[i + 2] || 0) << 8) |
        (dataArray[i + 3] || 0)
      );
    }
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
    const encrypted = CryptoJS.AES.encrypt(dataWordArray, key.key, {
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
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a deterministic fingerprint from a passphrase
 * @param passphrase The passphrase to generate the fingerprint from
 * @returns The fingerprint
 */
export async function generateFingerprint(passphrase: string): Promise<any> {
  try {
    // Use a fixed IV for fingerprint generation
    const fixedIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    
    // Create a deterministic hash of the passphrase
    const passphraseWordArray = CryptoJS.enc.Utf8.parse(passphrase);
    const hash = CryptoJS.SHA256(passphraseWordArray);
    
    // Convert hash to bytes
    const hashWords = hash.words;
    const hashBytes = new Uint8Array(hash.sigBytes);
    for (let i = 0; i < hashBytes.length; i += 4) {
      const word = hashWords[i / 4];
      hashBytes[i] = (word >>> 24) & 0xff;
      if (i + 1 < hashBytes.length) hashBytes[i + 1] = (word >>> 16) & 0xff;
      if (i + 2 < hashBytes.length) hashBytes[i + 2] = (word >>> 8) & 0xff;
      if (i + 3 < hashBytes.length) hashBytes[i + 3] = word & 0xff;
    }
    
    // Use the first 16 bytes of the hash as the "encrypted data"
    const dataBytes = hashBytes.slice(0, 16);
    
    return {
      iv: Array.from(fixedIv),
      data: Array.from(dataBytes)
    };
  } catch (error) {
    throw new Error(`Failed to generate fingerprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts data with a key
 * @param key The decryption key
 * @param encryptedData The encrypted data
 * @param iv The initialization vector
 * @returns The decrypted data
 */
export async function decryptData(
  key: CryptoKey,
  encryptedData: ArrayBuffer | Uint8Array,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  try {
    // Convert encryptedData to WordArray
    const encryptedArray = new Uint8Array(encryptedData instanceof ArrayBuffer ? encryptedData : encryptedData.buffer);
    const encryptedWords = [];
    for (let i = 0; i < encryptedArray.length; i += 4) {
      encryptedWords.push(
        ((encryptedArray[i] || 0) << 24) |
        ((encryptedArray[i + 1] || 0) << 16) |
        ((encryptedArray[i + 2] || 0) << 8) |
        (encryptedArray[i + 3] || 0)
      );
    }
    
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
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key.key, {
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
    
    return decryptedBytes.buffer;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}