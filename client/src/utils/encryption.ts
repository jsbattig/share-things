/**
 * Encryption utilities for client-side end-to-end encryption
 */

/**
 * Derives an encryption key from a passphrase
 * @param passphrase The passphrase to derive the key from
 * @returns The derived key
 */
export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
  // Convert passphrase to bytes
  const encoder = new TextEncoder();
  const passphraseData = encoder.encode(passphrase);
  
  console.log('Deriving key from passphrase - about to import key');
  
  // Create a key derivation key
  const baseKey = await crypto.subtle.importKey(
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
  const key = await crypto.subtle.deriveKey(
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
}

/**
 * Encrypts data with a key
 * @param key The encryption key
 * @param data The data to encrypt
 * @returns The encrypted data and IV
 */
export async function encryptData(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
  // Generate a deterministic IV from the passphrase and data
  const iv = await generateDeterministicIV(passphrase, data);

  // Encrypt the data
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    data
  );
  
  return { encryptedData, iv };
}

/**
 * Generates a deterministic IV from the key and data
 * @param key The encryption key
 * @param data The data to generate the IV from
 * @returns The deterministic IV
 */
async function generateDeterministicIV(passphrase: string, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  // Combine passphrase and data
  const encoder = new TextEncoder();
  const passphraseData = encoder.encode(passphrase);
  const combinedData = new Uint8Array([...passphraseData, ...new Uint8Array(data)]);

  // Hash the combined data
  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
  const hashArray = new Uint8Array(hashBuffer);

  // Use the first 12 bytes as the IV
  return hashArray.slice(0, 12);
}

/**
 * Generates a deterministic fingerprint from a passphrase
 * @param passphrase The passphrase to generate the fingerprint from
 * @returns The fingerprint
 */
export async function generateFingerprint(passphrase: string): Promise<any> {
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
    // Decrypt the data
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      encryptedData
    );
    
    // If decryption succeeded but returned empty data, that's suspicious
    if (decryptedData.byteLength === 0) {
      throw new Error('Decryption failed: Empty result');
    }
    
    return decryptedData;
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