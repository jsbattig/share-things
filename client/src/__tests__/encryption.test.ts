import { 
  deriveKeyFromPassphrase, 
  encryptText, 
  decryptText 
} from '../utils/encryption';

describe('Encryption Utilities', () => {
  const testPassphrase = 'test-passphrase-123';
  const testText = 'This is a test message for encryption and decryption.';
  
  test('should derive consistent keys from the same passphrase', async () => {
    const key1 = await deriveKeyFromPassphrase(testPassphrase);
    const key2 = await deriveKeyFromPassphrase(testPassphrase);
    
    // Keys should be the same type
    expect(key1.type).toBe(key2.type);
    expect(key1.algorithm).toEqual(key2.algorithm);
    expect(key1.extractable).toBe(key2.extractable);
    expect(key1.usages).toEqual(key2.usages);
  });
  
  test('should encrypt and decrypt text correctly', async () => {
    // Encrypt the text
    const { encryptedText, iv } = await encryptText(testPassphrase, testText);
    
    // Encrypted text should be different from original
    expect(encryptedText).not.toBe(testText);
    
    // Decrypt the text
    const decryptedText = await decryptText(testPassphrase, encryptedText, iv);
    
    // Decrypted text should match original
    expect(decryptedText).toBe(testText);
  });
  
  test('should fail to decrypt with wrong passphrase', async () => {
    // Encrypt with correct passphrase
    const { encryptedText, iv } = await encryptText(testPassphrase, testText);
    
    // Try to decrypt with wrong passphrase
    await expect(
      decryptText('wrong-passphrase', encryptedText, iv)
    ).rejects.toThrow();
  });
});