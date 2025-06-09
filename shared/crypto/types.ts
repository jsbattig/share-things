/**
 * Shared types for the unified crypto library
 */

// CryptoJS-compatible WordArray interface
export interface WordArray {
  words: number[];
  sigBytes: number;
  toString(encoder?: any): string;
  concat(wordArray: WordArray): WordArray;
  clone(): WordArray;
  clamp(): WordArray;
}

// CryptoJS-compatible CipherParams interface
export interface CipherParams {
  ciphertext: WordArray;
  key?: WordArray;
  iv?: WordArray;
  salt?: WordArray;
  algorithm?: string;
  mode?: any;
  padding?: any;
  blockSize?: number;
  formatter?: any;
  toString(formatter?: any): string;
}

// Our crypto key interface
export interface CryptoKey {
  key: WordArray;
  algorithm: string;
  usages: string[];
  type: string;
  extractable: boolean;
}

// Encryption result
export interface EncryptionResult {
  encryptedData: ArrayBuffer;
  iv: Uint8Array;
}

// Decryption options
export interface DecryptionOptions {
  validateResult?: boolean;
}

// Passphrase fingerprint
export interface PassphraseFingerprint {
  iv: number[];
  data: number[];
}

// Main crypto interface that all implementations must follow
export interface CryptoInterface {
  // Key derivation
  deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey>;
  
  // Data encryption/decryption
  encryptData(
    key: CryptoKey,
    data: ArrayBuffer | Uint8Array,
    passphrase: string
  ): Promise<EncryptionResult>;
  
  decryptData(
    key: CryptoKey,
    encryptedData: ArrayBuffer | Uint8Array,
    iv: Uint8Array,
    options?: DecryptionOptions
  ): Promise<ArrayBuffer>;
  
  // Text encryption/decryption
  encryptText(
    passphrase: string,
    text: string
  ): Promise<{ encryptedText: string; iv: string }>;
  
  decryptText(
    passphrase: string,
    encryptedText: string,
    ivBase64: string
  ): Promise<string>;
  
  // Blob encryption/decryption
  encryptBlob(
    passphrase: string,
    blob: Blob
  ): Promise<{ encryptedBlob: Blob; iv: Uint8Array }>;
  
  decryptBlob(
    passphrase: string,
    encryptedBlob: Blob,
    iv: Uint8Array,
    mimeType: string
  ): Promise<Blob>;
  
  // Utilities
  generateFingerprint(passphrase: string): Promise<PassphraseFingerprint>;
}

// Encoding interfaces
export interface EncodingInterface {
  parse(str: string): WordArray;
  stringify(wordArray: WordArray): string;
}

// Hash function interface
export interface HashFunction {
  (message: WordArray | string): WordArray;
}

// AES interface
export interface AESInterface {
  encrypt(
    message: WordArray | string,
    key: WordArray,
    cfg?: { iv?: WordArray; padding?: any }
  ): { ciphertext: WordArray; iv: WordArray; toString(): string };
  
  decrypt(
    cipherParams: CipherParams | { ciphertext: WordArray; iv?: WordArray },
    key: WordArray,
    cfg?: { iv?: WordArray; padding?: any }
  ): WordArray;
}

// PBKDF2 interface
export interface PBKDF2Function {
  (
    password: string,
    salt: WordArray | string,
    cfg: {
      keySize?: number;
      iterations?: number;
      hasher?: HashFunction;
    }
  ): WordArray;
}

// Padding interface
export interface PaddingInterface {
  pad(data: WordArray, blockSize: number): void;
  unpad(data: WordArray): void;
}

// Complete CryptoJS-like interface
export interface CryptoJSInterface {
  enc: {
    Utf8: EncodingInterface;
    Hex: EncodingInterface;
    Base64: EncodingInterface;
  };
  lib: {
    WordArray: {
      create(words?: number[], sigBytes?: number): WordArray;
    };
    CipherParams: {
      create(cipherParams: any): CipherParams;
    };
  };
  algo: {
    SHA256: HashFunction;
  };
  pad: {
    Pkcs7: PaddingInterface;
  };
  PBKDF2: PBKDF2Function;
  SHA256: HashFunction;
  AES: AESInterface;
}