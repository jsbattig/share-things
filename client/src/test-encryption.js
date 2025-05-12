// Simple test script for the new encryption implementation
// Run with: node test-encryption.js

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compile the TypeScript file to JavaScript
console.log('Compiling TypeScript...');
try {
  execSync('npx tsc src/utils/encryption.ts.new --outDir temp --module es2020 --target es2020 --moduleResolution node');
  console.log('Compilation successful');
} catch (error) {
  console.error('Compilation failed:', error.message);
  process.exit(1);
}

// Create a simple test module
const testModulePath = path.join(__dirname, '..', 'temp', 'test-module.js');
fs.writeFileSync(testModulePath, `
import { deriveKeyFromPassphrase, encryptText, decryptText, generateFingerprint } from './utils/encryption.ts.new.js';

async function runTests() {
  try {
    console.log('Testing encryption implementation...');
    
    // Test 1: Key derivation
    console.log('\\nTest 1: Key derivation');
    const passphrase = 'test-passphrase';
    const key = await deriveKeyFromPassphrase(passphrase);
    console.log('Key derived successfully:', key.algorithm);
    
    // Test 2: Text encryption and decryption
    console.log('\\nTest 2: Text encryption and decryption');
    const originalText = 'Hello, world! This is a test message.';
    console.log('Original text:', originalText);
    
    const { encryptedText, iv } = await encryptText(passphrase, originalText);
    console.log('Encrypted text:', encryptedText);
    console.log('IV:', iv);
    
    const decryptedText = await decryptText(passphrase, encryptedText, iv);
    console.log('Decrypted text:', decryptedText);
    
    if (decryptedText === originalText) {
      console.log('✅ Text encryption/decryption test passed!');
    } else {
      console.log('❌ Text encryption/decryption test failed!');
    }
    
    // Test 3: Fingerprint generation
    console.log('\\nTest 3: Fingerprint generation');
    const fingerprint1 = await generateFingerprint(passphrase);
    console.log('Fingerprint 1:', fingerprint1);
    
    const fingerprint2 = await generateFingerprint(passphrase);
    console.log('Fingerprint 2:', fingerprint2);
    
    // Check if fingerprints are deterministic (same for same passphrase)
    const fingerprintsMatch = 
      JSON.stringify(fingerprint1) === JSON.stringify(fingerprint2);
    
    if (fingerprintsMatch) {
      console.log('✅ Fingerprint generation test passed!');
    } else {
      console.log('❌ Fingerprint generation test failed!');
    }
    
    console.log('\\nAll tests completed!');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

runTests();
`);

// Run the test module
console.log('Running tests...');
try {
  execSync('node ' + testModulePath, { stdio: 'inherit' });
} catch (error) {
  console.error('Tests failed:', error.message);
  process.exit(1);
}

// Clean up
console.log('Cleaning up...');
try {
  execSync('rm -rf temp');
} catch (error) {
  console.error('Cleanup failed:', error.message);
}

console.log('Done!');