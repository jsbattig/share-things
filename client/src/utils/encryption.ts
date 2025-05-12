/**
 * Encryption utilities for client-side end-to-end encryption
 */

// Import the webcrypto-shim polyfill
import 'webcrypto-shim';

// Import CryptoJS for fallback implementation
import * as CryptoJS from 'crypto-js';

// Flag to track if we're using the fallback implementation
let usingFallbackCrypto = false;

// Polyfill for browsers that don't support the Web Crypto API
// This is a fallback mechanism that will be used if the native Web Crypto API is not available
if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
  console.warn('Web Crypto API not detected. Using CryptoJS fallback implementation...');
  // The webcrypto-shim polyfill should have been loaded and applied
  if (!window.crypto || !window.crypto.subtle) {
    console.warn('Using CryptoJS fallback for all crypto operations.');
    usingFallbackCrypto = true;
  } else {
    console.log('Polyfill successfully initialized Web Crypto API.');
  }
}

// Define interfaces for our fallback implementation
interface FallbackCryptoKey {
  _type: 'fallback';
  key: CryptoJS.lib.WordArray;
  algorithm: string;
  usages: string[];
}

// Check if Web Crypto API is available
const isWebCryptoAvailable = () => {
  return typeof window !== 'undefined' &&
         window.crypto !== undefined &&
         window.crypto.subtle !== undefined;
};

// Throw a helpful error if Web Crypto API is not available and fallback is disabled
const checkWebCryptoSupport = () => {
  if (!isWebCryptoAvailable() && !usingFallbackCrypto) {
    throw new Error(
      'Web Crypto API is not available in this browser or context. ' +
      'This could be because you are using an older browser, ' +
      'or because you are not in a secure context (HTTPS). ' +
      'Try using a modern browser like Chrome, Firefox, or Edge, ' +
      'and make sure you are accessing the site over HTTPS.'
    );
  }
};

// Fallback implementation of deriveKeyFromPassphrase using CryptoJS
async function deriveKeyFromPassphraseFallback(passphrase: string): Promise<FallbackCryptoKey> {
  console.log('Using CryptoJS fallback for key derivation');
  
  // Use a fixed salt for deterministic key derivation
  const salt = CryptoJS.enc.Utf8.parse('ShareThings-Salt-2025');
  
  // Derive the key using PBKDF2
  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: 256/32, // 256 bits
    iterations: 100000,
    hasher: CryptoJS.algo.SHA256
  });
  
  // Return a fallback crypto key object
  return {
    _type: 'fallback',
    key: key,
    algorithm: 'AES-GCM',
    usages: ['encrypt', 'decrypt']
  };
}

/**
 * Derives an encryption key from a passphrase
 * @param passphrase The passphrase to derive the key from
 * @returns The derived key (either native CryptoKey or FallbackCryptoKey)
 */
export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey | FallbackCryptoKey> {
  try {
    // If we're using the fallback implementation, use that directly
    if (usingFallbackCrypto) {
      return deriveKeyFromPassphraseFallback(passphrase);
    }
    
    // Otherwise try to use the Web Crypto API
    try {
      // Check if Web Crypto API is available
      checkWebCryptoSupport();
      
      // Convert passphrase to bytes
      const encoder = new TextEncoder();
      const passphraseData = encoder.encode(passphrase);
      
      console.log('Deriving key from passphrase - about to import key');
      
      // Create a key derivation key
      const baseKey = await window.crypto.subtle.importKey(
        'raw',
        passphraseData,
        { name: 'PBKDF2' },
        false, // Changed from true to false - KDF keys must not be extractable
        ['deriveKey']
      );
    
      console.log('Successfully imported key with extractable=false');
      
      // Use a fixed salt for deterministic key derivation
      // This is safe because the passphrase is the shared secret
      const salt = encoder.encode('ShareThings-Salt-2025');
      
      // Derive the actual encryption key
      const key = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      return key;
    } catch (error) {
      console.warn('Web Crypto API failed, falling back to CryptoJS implementation:', error);
      // If Web Crypto API fails, fall back to CryptoJS
      usingFallbackCrypto = true;
      return deriveKeyFromPassphraseFallback(passphrase);
    }
  } catch (error) {
    console.error('Error deriving key from passphrase:', error);
    throw new Error(`Failed to derive key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fallback implementation of generateDeterministicIV using CryptoJS
 */
async function generateDeterministicIVFallback(passphrase: string, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  console.log('Using CryptoJS fallback for IV generation');
  
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
  
  // Create WordArray from data
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
}

/**
 * Fallback implementation of encryptData using CryptoJS
 */
async function encryptDataFallback(
  key: FallbackCryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
  console.log('Using CryptoJS fallback for encryption');
  
  // Generate IV
  const iv = await generateDeterministicIVFallback(passphrase, data);
  
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
  
  // Create WordArray from data
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
  // Note: CryptoJS doesn't support GCM mode directly, so we use a simpler approach
  // This is a simplification for the fallback case
  const encrypted = CryptoJS.AES.encrypt(dataWordArray, key.key, {
    iv: ivWordArray,
    padding: CryptoJS.pad.NoPadding
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
 * Encrypts data with a key
 * @param key The encryption key
 * @param data The data to encrypt
 * @returns The encrypted data and IV
 */
export async function encryptData(
  key: CryptoKey | FallbackCryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
  try {
    // Check if we're using a fallback key
    if (key && typeof key === 'object' && '_type' in key && key._type === 'fallback') {
      return encryptDataFallback(key, data, passphrase);
    }
    
    // Otherwise use the Web Crypto API
    try {
      // Check if Web Crypto API is available
      checkWebCryptoSupport();
      
      // Generate a deterministic IV from the passphrase and data
      const iv = await generateDeterministicIV(passphrase, data);

      // Encrypt the data
      const encryptedData = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv
        },
        key as CryptoKey,
        data
      );
      
      return { encryptedData, iv };
    } catch (error) {
      console.warn('Web Crypto API encryption failed, falling back to CryptoJS:', error);
      // If Web Crypto API fails, fall back to CryptoJS
      usingFallbackCrypto = true;
      const fallbackKey = await deriveKeyFromPassphraseFallback(passphrase);
      return encryptDataFallback(fallbackKey, data, passphrase);
    }
  } catch (error) {
    console.error('Error encrypting data:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a deterministic IV from the key and data
 * @param key The encryption key
 * @param data The data to generate the IV from
 * @returns The deterministic IV
 */
async function generateDeterministicIV(passphrase: string, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  try {
    // Check if Web Crypto API is available
    checkWebCryptoSupport();
    
    // Combine passphrase and data
    const encoder = new TextEncoder();
    const passphraseData = encoder.encode(passphrase);
    const combinedData = new Uint8Array([...passphraseData, ...new Uint8Array(data)]);

    // Hash the combined data
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', combinedData);
    const hashArray = new Uint8Array(hashBuffer);

    // Use the first 12 bytes as the IV
    return hashArray.slice(0, 12);
  } catch (error) {
    console.error('Error generating deterministic IV:', error);
    throw new Error(`Failed to generate IV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a deterministic fingerprint from a passphrase
 * @param passphrase The passphrase to generate the fingerprint from
 * @returns The fingerprint
 */
export async function generateFingerprint(passphrase: string): Promise<any> {
  try {
    // If we're using the fallback implementation, we need to ensure compatibility
    if (usingFallbackCrypto) {
      console.log('Using deterministic fingerprint for fallback mode');
      
      // In fallback mode, we'll use a deterministic approach that's compatible
      // with what the server expects
      
      // Use a fixed IV for fingerprint generation
      const fixedIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      
      // Use a fixed key derived from the passphrase
      const encoder = new TextEncoder();
      const passphraseData = encoder.encode(passphrase);
      
      // Create a deterministic hash of the passphrase
      const hash = CryptoJS.SHA256(CryptoJS.lib.WordArray.create(
        Array.from(passphraseData).map(byte => byte)
      ));
      
      // Convert hash to bytes for data
      const hashWords = hash.words;
      const hashBytes = new Uint8Array(hash.sigBytes);
      for (let i = 0; i < hashBytes.length; i += 4) {
        const word = hashWords[i / 4];
        hashBytes[i] = (word >>> 24) & 0xff;
        if (i + 1 < hashBytes.length) hashBytes[i + 1] = (word >>> 16) & 0xff;
        if (i + 2 < hashBytes.length) hashBytes[i + 2] = (word >>> 8) & 0xff;
        if (i + 3 < hashBytes.length) hashBytes[i + 3] = word & 0xff;
      }
      
      return {
        iv: Array.from(fixedIv),
        data: Array.from(hashBytes)
      };
    }
    
    // Standard Web Crypto API implementation
    // Derive key from passphrase
    const key = await deriveKeyFromPassphrase(passphrase);

    // Convert passphrase to bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(passphrase);

    // Encrypt the data
    const { encryptedData, iv } = await encryptData(key, data, passphrase);

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encryptedData))
    };
  } catch (error) {
    console.error('Error generating fingerprint:', error);
    throw new Error(`Failed to generate fingerprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fallback implementation of decryptData using CryptoJS
 */
async function decryptDataFallback(
  key: FallbackCryptoKey,
  encryptedData: ArrayBuffer | Uint8Array,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  console.log('Using CryptoJS fallback for decryption');
  
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
  
  // Simplify the approach for the fallback
  // Create a CipherParams object with just the ciphertext
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: encryptedWordArray
  });
  
  // Decrypt data with simpler options
  const decrypted = CryptoJS.AES.decrypt(cipherParams, key.key, {
    iv: ivWordArray,
    padding: CryptoJS.pad.NoPadding
  });
  
  // Convert to ArrayBuffer
  const decryptedWords = decrypted.words;
  const decryptedBytes = new Uint8Array(decrypted.sigBytes);
  
  for (let i = 0; i < decryptedBytes.length; i += 4) {
    const word = decryptedWords[i / 4];
    decryptedBytes[i] = (word >>> 24) & 0xff;
    if (i + 1 < decryptedBytes.length) decryptedBytes[i + 1] = (word >>> 16) & 0xff;
    if (i + 2 < decryptedBytes.length) decryptedBytes[i + 2] = (word >>> 8) & 0xff;
    if (i + 3 < decryptedBytes.length) decryptedBytes[i + 3] = word & 0xff;
  }
  
  // If decryption succeeded but returned empty data, that's suspicious
  if (decryptedBytes.length === 0) {
    throw new Error('Decryption failed: Empty result');
  }
  
  return decryptedBytes.buffer;
}

/**
 * Decrypts data with a key
 * @param key The decryption key
 * @param encryptedData The encrypted data
 * @param iv The initialization vector
 * @returns The decrypted data
 */
export async function decryptData(
  key: CryptoKey | FallbackCryptoKey,
  encryptedData: ArrayBuffer | Uint8Array,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  try {
    // Check if we're using a fallback key
    if (key && typeof key === 'object' && '_type' in key && key._type === 'fallback') {
      return decryptDataFallback(key, encryptedData, iv);
    }
    
    // Otherwise use the Web Crypto API
    try {
      // Check if Web Crypto API is available
      checkWebCryptoSupport();
      
      // Decrypt the data
      const decryptedData = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv
        },
        key as CryptoKey,
        encryptedData
      );
      
      // If decryption succeeded but returned empty data, that's suspicious
      if (decryptedData.byteLength === 0) {
        throw new Error('Decryption failed: Empty result');
      }
      
      return decryptedData;
    } catch (error) {
      console.warn('Web Crypto API decryption failed:', error);
      // If we're already using fallback crypto, rethrow the error
      if (usingFallbackCrypto) {
        throw error;
      }
      // Otherwise, we can't automatically fall back without the original passphrase
      throw new Error('Web Crypto API decryption failed and cannot automatically fall back. Try refreshing the page.');
    }
  } catch (error) {
    // Rethrow the error with a more descriptive message
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypts text with a passphrase
 * @param passphrase The encryption passphrase
 * @param text The text to encrypt
 * @returns The encrypted text and IV as base64 strings
 */
export async function encryptText(
  passphrase: string,
  text: string
): Promise<{ encryptedText: string; iv: string }> {
  // Derive key from passphrase
  const key = await deriveKeyFromPassphrase(passphrase);
  
  // Convert text to bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Encrypt the data
  const { encryptedData, iv } = await encryptData(key, data, passphrase);
  
  // Convert to base64
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
}

/**
 * Decrypts text with a passphrase
 * @param passphrase The decryption passphrase
 * @param encryptedText The encrypted text as a base64 string
 * @param ivBase64 The IV as a base64 string
 * @returns The decrypted text
 */
export async function decryptText(
  passphrase: string,
  encryptedText: string,
  ivBase64: string
): Promise<string> {
  try {
    // Derive key from passphrase
    const key = await deriveKeyFromPassphrase(passphrase);
    
    // Convert from base64
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
    
    // Decrypt the data
    const decryptedData = await decryptData(key, encryptedBytes, iv);
    
    // Convert bytes to text
    const decoder = new TextDecoder();
    const text = decoder.decode(decryptedData);
    
    // If we get an empty string, that's suspicious for decryption failure
    if (text.length === 0) {
      throw new Error('Decryption failed: Empty result');
    }
    
    return text;
  } catch (error) {
    // Explicitly throw an error for wrong passphrase
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Wrong passphrase or corrupted data'}`);
  }
}

/**
 * Encrypts a blob with a passphrase
 * @param passphrase The encryption passphrase
 * @param blob The blob to encrypt
 * @returns The encrypted blob and IV
 */
export async function encryptBlob(
  passphrase: string,
  blob: Blob
): Promise<{ encryptedBlob: Blob; iv: Uint8Array }> {
  // Derive key from passphrase
  const key = await deriveKeyFromPassphrase(passphrase);
  
  // Convert blob to array buffer
  const data = await blob.arrayBuffer();
  
  // Encrypt the data
  const { encryptedData, iv } = await encryptData(key, data, passphrase);
  
  // Convert to blob
  const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
  
  return { encryptedBlob, iv };
}

/**
 * Decrypts a blob with a passphrase
 * @param passphrase The decryption passphrase
 * @param encryptedBlob The encrypted blob
 * @param iv The initialization vector
 * @param mimeType The original MIME type
 * @returns The decrypted blob
 */
export async function decryptBlob(
  passphrase: string,
  encryptedBlob: Blob,
  iv: Uint8Array,
  mimeType: string
): Promise<Blob> {
  try {
    // Derive key from passphrase
    const key = await deriveKeyFromPassphrase(passphrase);
    
    // Convert blob to array buffer
    const encryptedData = await encryptedBlob.arrayBuffer();
    
    // Decrypt the data
    const decryptedData = await decryptData(key, encryptedData, iv);
    
    // Convert to blob
    const decryptedBlob = new Blob([decryptedData], { type: mimeType });
    
    return decryptedBlob;
  } catch (error) {
    // Explicitly throw an error for wrong passphrase
    throw new Error(`Blob decryption failed: ${error instanceof Error ? error.message : 'Wrong passphrase or corrupted data'}`);
  }
}