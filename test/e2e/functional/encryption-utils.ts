/**
 * Encryption utilities for testing
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
  
  // Create a key derivation key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseData,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Use a fixed salt for deterministic key derivation
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
 * Generates a deterministic IV from the passphrase and data
 * @param passphrase The passphrase
 * @param data The data to generate the IV from
 * @returns The deterministic IV
 */
async function generateDeterministicIV(passphrase: string, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  // Combine passphrase and data
  const encoder = new TextEncoder();
  const passphraseData = encoder.encode(passphrase);
  const combinedData = new Uint8Array([...passphraseData, ...new Uint8Array(data instanceof ArrayBuffer ? data : data)]);

  // Hash the combined data
  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
  const hashArray = new Uint8Array(hashBuffer);

  // Use the first 12 bytes as the IV
  return hashArray.slice(0, 12);
}

/**
 * Generates a fingerprint from a passphrase
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
  // Decrypt the data
  const decryptedData = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    encryptedData
  );
  
  return decryptedData;
}