/**
 * Mock for shared crypto library in client tests
 * Uses Node.js crypto implementation for testing
 */

// Import the Node.js crypto implementation class
import { NodeCrypto } from '../../../shared/crypto/node';

// Create an instance of the Node.js crypto implementation
const nodeCrypto = new NodeCrypto();

// Re-export all functions from the instance
export const deriveKeyFromPassphrase = nodeCrypto.deriveKeyFromPassphrase.bind(nodeCrypto);
export const encryptData = nodeCrypto.encryptData.bind(nodeCrypto);
export const decryptData = nodeCrypto.decryptData.bind(nodeCrypto);
export const generateFingerprint = nodeCrypto.generateFingerprint.bind(nodeCrypto);

// Export default
export default {
  deriveKeyFromPassphrase,
  encryptData,
  decryptData,
  generateFingerprint
};