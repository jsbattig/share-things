/**
 * Encryption utilities for testing - using unified crypto library
 */

// Import unified crypto library
import { deriveKeyFromPassphrase as unifiedDeriveKey, encryptData as unifiedEncryptData, decryptData as unifiedDecryptData, generateFingerprint as unifiedGenerateFingerprint } from '../../../shared/crypto';

// Re-export unified functions
export const deriveKeyFromPassphrase = unifiedDeriveKey;
export const encryptData = unifiedEncryptData;
export const decryptData = unifiedDecryptData;
export const generateFingerprint = unifiedGenerateFingerprint;

// Define interface for our crypto key (for compatibility)
interface CryptoKey {
  key: any; // Use any to avoid type conflicts
  algorithm: string;
  usages: string[];
  type: string;
  extractable: boolean;
}

// All crypto functions are now provided by the unified crypto library