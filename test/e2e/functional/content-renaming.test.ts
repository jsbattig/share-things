import { TestOrchestrator } from './test-orchestrator';
import { ClientEmulator } from './client-emulator';

describe('Content Renaming E2E Tests', () => {
  let orchestrator: TestOrchestrator;
  let client1: ClientEmulator;
  let client2: ClientEmulator;

  beforeAll(async () => {
    orchestrator = new TestOrchestrator();
    await orchestrator.setup();
  });

  afterAll(async () => {
    if (orchestrator) {
      await orchestrator.cleanup();
    }
  });

  beforeEach(async () => {
    // Create two clients for testing real-time collaboration
    client1 = orchestrator.createClient('Client1');
    client2 = orchestrator.createClient('Client2');

    // Both clients join the same session
    const sessionId = 'rename-test-session';
    const passphrase = 'test-passphrase-123';

    await Promise.all([
      client1.joinSession(sessionId, passphrase),
      client2.joinSession(sessionId, passphrase)
    ]);
  });

  afterEach(async () => {
    // Don't disconnect clients since they're reused across tests
    // Just leave the sessions for the next test
    if (client1) {
      client1.leaveSession();
    }
    if (client2) {
      client2.leaveSession();
    }
  });

  it('should rename content and broadcast to all connected clients', async () => {
    const originalFileName = 'test-document.txt';
    const newFileName = 'renamed-document.txt';
    const contentText = 'This is a test document for renaming.';

    // Client 1 shares text content with original name
    const contentId = await client1.shareTextContent(contentText, originalFileName);
    expect(contentId).toBeDefined();

    // Wait for Client 2 to receive the content
    await client2.waitForContent(contentId);

    // Verify both clients have the content with original name
    const client1Content = client1.getContent(contentId);
    const client2Content = client2.getContent(contentId);

    expect(client1Content).toBeDefined();
    expect(client2Content).toBeDefined();
    expect(client1Content?.metadata?.fileName).toBe(originalFileName);
    expect(client2Content?.metadata?.fileName).toBe(originalFileName);

    // Client 1 renames the content
    await client1.renameContent(contentId, newFileName);

    // Wait for Client 2 to receive the rename broadcast
    await client2.waitForContentUpdate(contentId, (content) => 
      content.metadata?.fileName === newFileName
    );

    // Verify both clients now have the content with the new name
    const updatedClient1Content = client1.getContent(contentId);
    const updatedClient2Content = client2.getContent(contentId);

    expect(updatedClient1Content?.metadata?.fileName).toBe(newFileName);
    expect(updatedClient2Content?.metadata?.fileName).toBe(newFileName);

    // Verify content data is unchanged
    expect(updatedClient1Content?.data).toBe(contentText);
    expect(updatedClient2Content?.data).toBe(contentText);
  });

  it('should handle rename conflicts when multiple clients rename simultaneously', async () => {
    const originalFileName = 'conflict-test.txt';
    const client1NewName = 'renamed-by-client1.txt';
    const client2NewName = 'renamed-by-client2.txt';
    const contentText = 'Content for conflict testing.';

    // Client 1 shares content
    const contentId = await client1.shareTextContent(contentText, originalFileName);
    
    // Wait for both clients to have the content
    await Promise.all([
      client1.waitForContent(contentId),
      client2.waitForContent(contentId)
    ]);

    // Both clients attempt to rename simultaneously
    const [result1, result2] = await Promise.all([
      client1.renameContent(contentId, client1NewName),
      client2.renameContent(contentId, client2NewName)
    ]);

    // Both operations should succeed (last write wins)
    expect(result1.success || result2.success).toBe(true);

    // Wait for all broadcasts to settle
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify final state - one of the names should be the final result
    const finalClient1Content = client1.getContent(contentId);
    const finalClient2Content = client2.getContent(contentId);

    expect(finalClient1Content?.metadata?.fileName).toBeDefined();
    expect(finalClient2Content?.metadata?.fileName).toBeDefined();
    
    // Both clients should have the same final name (consistency)
    expect(finalClient1Content?.metadata?.fileName).toBe(finalClient2Content?.metadata?.fileName);
    
    // The final name should be one of the attempted names
    const finalName = finalClient1Content?.metadata?.fileName;
    expect([client1NewName, client2NewName]).toContain(finalName);
  });

  it('should preserve content metadata and functionality after rename', async () => {
    const originalFileName = 'preserve-test.txt';
    const newFileName = 'preserved-test.txt';
    const contentText = 'Content with metadata to preserve.';

    // Client 1 shares content
    const contentId = await client1.shareTextContent(contentText, originalFileName);
    
    // Wait for Client 2 to receive the content
    await client2.waitForContent(contentId);

    // Get original metadata
    const originalContent = client1.getContent(contentId);
    const originalSize = originalContent?.metadata?.size;
    const originalMimeType = originalContent?.metadata?.mimeType;
    const originalTimestamp = originalContent?.metadata?.timestamp;

    // Rename the content
    await client1.renameContent(contentId, newFileName);

    // Wait for broadcast
    await client2.waitForContentUpdate(contentId, (content) => 
      content.metadata?.fileName === newFileName
    );

    // Verify metadata is preserved except for filename
    const renamedContent = client1.getContent(contentId);
    expect(renamedContent?.metadata?.fileName).toBe(newFileName);
    expect(renamedContent?.metadata?.size).toBe(originalSize);
    expect(renamedContent?.metadata?.mimeType).toBe(originalMimeType);
    expect(renamedContent?.metadata?.timestamp).toBe(originalTimestamp);

    // Verify content operations still work after rename
    const canCopy = await client1.copyContentToClipboard(contentId);
    expect(canCopy).toBe(true);

    const canDownload = await client1.downloadContent(contentId);
    expect(canDownload).toBe(true);
  });

  it('should handle special characters and unicode in filenames', async () => {
    const originalFileName = 'test.txt';
    const specialFileName = '测试文件 & special chars (1) [copy].txt';
    const contentText = 'Unicode filename test content.';

    // Client 1 shares content
    const contentId = await client1.shareTextContent(contentText, originalFileName);
    
    // Wait for Client 2 to receive the content
    await client2.waitForContent(contentId);

    // Rename with special characters and unicode
    await client1.renameContent(contentId, specialFileName);

    // Wait for Client 2 to receive the rename broadcast
    await client2.waitForContentUpdate(contentId, (content) => 
      content.metadata?.fileName === specialFileName
    );

    // Verify both clients have the special filename correctly
    const client1Content = client1.getContent(contentId);
    const client2Content = client2.getContent(contentId);

    expect(client1Content?.metadata?.fileName).toBe(specialFileName);
    expect(client2Content?.metadata?.fileName).toBe(specialFileName);
  });

  it('should validate rename permissions and session membership', async () => {
    const originalFileName = 'permission-test.txt';
    const newFileName = 'renamed-permission-test.txt';
    const contentText = 'Permission test content.';

    // Client 1 shares content
    const contentId = await client1.shareTextContent(contentText, originalFileName);
    
    // Wait for Client 2 to receive the content
    await client2.waitForContent(contentId);

    // Client 2 disconnects
    client2.leaveSession();

    // Reconnect Client 2 (will have a new session token)
    // Instead of creating a new client, just rejoin with the existing client
    await client2.joinSession('rename-test-session', 'test-passphrase-123');

    // Client 2 should be able to rename content (any session member can rename)
    const renameResult = await client2.renameContent(contentId, newFileName);
    expect(renameResult.success).toBe(true);

    // Wait for Client 1 to receive the rename broadcast
    await client1.waitForContentUpdate(contentId, (content) => 
      content.metadata?.fileName === newFileName
    );

    // Verify rename was successful
    const renamedContent = client1.getContent(contentId);
    expect(renamedContent?.metadata?.fileName).toBe(newFileName);
  });

  it('should handle empty and invalid rename attempts gracefully', async () => {
    const originalFileName = 'validation-test.txt';
    const contentText = 'Validation test content.';

    // Client 1 shares content
    const contentId = await client1.shareTextContent(contentText, originalFileName);
    
    // Wait for Client 2 to receive the content
    await client2.waitForContent(contentId);

    // Test empty name
    const emptyResult = await client1.renameContent(contentId, '');
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error).toContain('empty');

    // Test whitespace-only name
    const whitespaceResult = await client1.renameContent(contentId, '   ');
    expect(whitespaceResult.success).toBe(false);
    expect(whitespaceResult.error).toContain('empty');

    // Test rename of non-existent content
    const nonExistentResult = await client1.renameContent('non-existent-id', 'new-name.txt');
    expect(nonExistentResult.success).toBe(false);

    // Verify original content is unchanged
    const unchangedContent = client1.getContent(contentId);
    expect(unchangedContent?.metadata?.fileName).toBe(originalFileName);
  });
});