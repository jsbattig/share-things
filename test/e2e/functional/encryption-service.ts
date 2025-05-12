/**
 * Service for handling encryption and decryption
 */
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
      iv = crypto.getRandomValues(new Uint8Array(12));
    }

    // Convert data to ArrayBuffer if it's a string
    const dataBuffer = typeof data === 'string' 
      ? new TextEncoder().encode(data) 
      : data;

    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      this.key,
      dataBuffer
    );

    return { encryptedData, iv };
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
      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv
        },
        this.key,
        encryptedData
      );

      // Return as string or ArrayBuffer based on outputType
      if (outputType === 'string') {
        return new TextDecoder().decode(decryptedBuffer);
      }

      return decryptedBuffer;
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
      salt = crypto.getRandomValues(new Uint8Array(16));
    }

    // Convert passphrase to buffer
    const passphraseBuffer = new TextEncoder().encode(passphrase);

    // Import passphrase as raw key
    const importedKey = await crypto.subtle.importKey(
      'raw',
      passphraseBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive key using PBKDF2
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      importedKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return { key: derivedKey, salt };
  }
}