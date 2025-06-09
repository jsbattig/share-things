/**
 * Unified Crypto Library for ShareThings
 * Consolidates all encryption/decryption functionality with environment-aware polyfills
 */

import { CryptoEnvironment, detectEnvironment } from './environment';
import { BrowserCrypto } from './browser';
import { NodeCrypto } from './node';
import { 
  CryptoKey, 
  EncryptionResult, 
  DecryptionOptions,
  PassphraseFingerprint,
  CryptoInterface 
} from './types';

// Global crypto instance
let cryptoInstance: CryptoInterface | null = null;

/**
 * Initialize the crypto library with environment detection
 */
export function initializeCrypto(): CryptoInterface {
  if (cryptoInstance) {
    return cryptoInstance;
  }

  const environment = detectEnvironment();
  
  switch (environment) {
    case CryptoEnvironment.Browser:
      cryptoInstance = new BrowserCrypto();
      break;
    case CryptoEnvironment.Node:
      cryptoInstance = new NodeCrypto();
      break;
    case CryptoEnvironment.Test:
      // Use Node crypto for tests but with browser-compatible interface
      cryptoInstance = new NodeCrypto();
      break;
    default:
      throw new Error(`Unsupported crypto environment: ${environment}`);
  }

  return cryptoInstance;
}

/**
 * Get the current crypto instance (auto-initialize if needed)
 */
export function getCrypto(): CryptoInterface {
  return cryptoInstance || initializeCrypto();
}

// Re-export all types and utilities
export * from './types';
export * from './environment';
export { BrowserCrypto } from './browser';
export { NodeCrypto } from './node';

// Convenience functions that use the global instance
export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
  return getCrypto().deriveKeyFromPassphrase(passphrase);
}

export async function encryptData(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<EncryptionResult> {
  return getCrypto().encryptData(key, data, passphrase);
}

export async function decryptData(
  key: CryptoKey,
  encryptedData: ArrayBuffer | Uint8Array,
  iv: Uint8Array,
  options?: DecryptionOptions
): Promise<ArrayBuffer> {
  return getCrypto().decryptData(key, encryptedData, iv, options);
}

export async function encryptText(
  passphrase: string,
  text: string
): Promise<{ encryptedText: string; iv: string }> {
  return getCrypto().encryptText(passphrase, text);
}

export async function decryptText(
  passphrase: string,
  encryptedText: string,
  ivBase64: string
): Promise<string> {
  return getCrypto().decryptText(passphrase, encryptedText, ivBase64);
}

export async function generateFingerprint(passphrase: string): Promise<PassphraseFingerprint> {
  return getCrypto().generateFingerprint(passphrase);
}

export async function encryptBlob(
  passphrase: string,
  blob: Blob
): Promise<{ encryptedBlob: Blob; iv: Uint8Array }> {
  return getCrypto().encryptBlob(passphrase, blob);
}

export async function decryptBlob(
  passphrase: string,
  encryptedBlob: Blob,
  iv: Uint8Array,
  mimeType: string
): Promise<Blob> {
  return getCrypto().decryptBlob(passphrase, encryptedBlob, iv, mimeType);
}