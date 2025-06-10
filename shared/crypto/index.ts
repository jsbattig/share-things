/**
 * Unified Crypto Library for ShareThings
 * Consolidates all encryption/decryption functionality with environment-aware polyfills
 */

import { CryptoEnvironment, detectEnvironment } from './environment';
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
export async function initializeCrypto(): Promise<CryptoInterface> {
  if (cryptoInstance) {
    return cryptoInstance;
  }

  const environment = detectEnvironment();
  
  switch (environment) {
    case CryptoEnvironment.Browser:
      const { BrowserCrypto } = await import('./browser');
      cryptoInstance = new BrowserCrypto();
      break;
    case CryptoEnvironment.Node:
      const { NodeCrypto: NodeCryptoClass } = await import('./node');
      cryptoInstance = new NodeCryptoClass();
      break;
    case CryptoEnvironment.Test:
      // Use Node crypto for tests but with browser-compatible interface
      const { NodeCrypto: NodeCryptoTestClass } = await import('./node');
      cryptoInstance = new NodeCryptoTestClass();
      break;
    default:
      throw new Error(`Unsupported crypto environment: ${environment}`);
  }

  return cryptoInstance;
}

/**
 * Get the current crypto instance (auto-initialize if needed)
 */
export async function getCrypto(): Promise<CryptoInterface> {
  return cryptoInstance || await initializeCrypto();
}

// Re-export all types and utilities
export * from './types';
export * from './environment';

// Dynamic re-exports to avoid loading modules at import time
export async function getBrowserCrypto() {
  const { BrowserCrypto } = await import('./browser');
  return BrowserCrypto;
}

export async function getNodeCrypto() {
  const { NodeCrypto } = await import('./node');
  return NodeCrypto;
}

// Convenience functions that use the global instance
export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
  const crypto = await getCrypto();
  return crypto.deriveKeyFromPassphrase(passphrase);
}

export async function encryptData(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<EncryptionResult> {
  const crypto = await getCrypto();
  return crypto.encryptData(key, data, passphrase);
}

export async function decryptData(
  key: CryptoKey,
  encryptedData: ArrayBuffer | Uint8Array,
  iv: Uint8Array,
  options?: DecryptionOptions
): Promise<ArrayBuffer> {
  const crypto = await getCrypto();
  return crypto.decryptData(key, encryptedData, iv, options);
}

export async function encryptText(
  passphrase: string,
  text: string
): Promise<{ encryptedText: string; iv: string }> {
  const crypto = await getCrypto();
  return crypto.encryptText(passphrase, text);
}

export async function decryptText(
  passphrase: string,
  encryptedText: string,
  ivBase64: string
): Promise<string> {
  const crypto = await getCrypto();
  return crypto.decryptText(passphrase, encryptedText, ivBase64);
}

export async function generateFingerprint(passphrase: string): Promise<PassphraseFingerprint> {
  const crypto = await getCrypto();
  return crypto.generateFingerprint(passphrase);
}

export async function encryptBlob(
  passphrase: string,
  blob: Blob
): Promise<{ encryptedBlob: Blob; iv: Uint8Array }> {
  const crypto = await getCrypto();
  return crypto.encryptBlob(passphrase, blob);
}

export async function decryptBlob(
  passphrase: string,
  encryptedBlob: Blob,
  iv: Uint8Array,
  mimeType: string
): Promise<Blob> {
  const crypto = await getCrypto();
  return crypto.decryptBlob(passphrase, encryptedBlob, iv, mimeType);
}