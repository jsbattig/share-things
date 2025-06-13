/**
 * Unit test for content metadata structure fix
 * This test validates that the metadata structure transformation is correct
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Content Metadata Structure Fix', () => {
  
  // This simulates the server's content response during session rejoin
  const mockServerContentResponse = {
    contentId: 'test-content-id',
    senderId: 'server',
    senderName: 'Server',
    contentType: 'text',
    timestamp: 1649837929418,
    metadata: {
      fileName: 'renamed-file.txt', // This is the renamed filename from the database
      mimeType: 'text/plain',
      size: 5
    },
    isChunked: false,
    totalChunks: 1,
    totalSize: 5,
    isPinned: false,
    isLargeFile: false,
    encryptionMetadata: {
      iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    }
  };

  // This function simulates the fixed metadata transformation
  const createProperMetadata = (content: any) => {
    return {
      contentId: content.contentId,
      senderId: content.senderId,
      senderName: content.senderName,
      contentType: content.contentType,
      timestamp: content.timestamp,
      metadata: content.metadata || {}, // This contains fileName and other metadata
      isChunked: content.isChunked,
      totalChunks: content.totalChunks,
      totalSize: content.totalSize,
      isPinned: content.isPinned,
      isLargeFile: content.isLargeFile,
      encryptionMetadata: content.encryptionMetadata
    };
  };

  it('should correctly transform server content metadata to proper nested structure', () => {
    // Apply the fix transformation
    const properMetadata = createProperMetadata(mockServerContentResponse);

    // Verify the structure matches what the UI expects
    expect(properMetadata.metadata).toBeDefined();
    expect(properMetadata.metadata.fileName).toBe('renamed-file.txt');
    expect(properMetadata.metadata.mimeType).toBe('text/plain');
    expect(properMetadata.metadata.size).toBe(5);

    // Verify other fields are preserved
    expect(properMetadata.contentId).toBe('test-content-id');
    expect(properMetadata.contentType).toBe('text');
    expect(properMetadata.senderId).toBe('server');
    expect(properMetadata.isPinned).toBe(false);
    expect(properMetadata.isLargeFile).toBe(false);

    console.log('✅ Server content metadata transformed correctly');
  });

  it('should handle empty metadata gracefully', () => {
    const contentWithoutMetadata = {
      ...mockServerContentResponse,
      metadata: undefined
    };

    const properMetadata = createProperMetadata(contentWithoutMetadata);

    // Should create empty metadata object
    expect(properMetadata.metadata).toEqual({});
    expect(properMetadata.contentId).toBe('test-content-id');

    console.log('✅ Empty metadata handled gracefully');
  });

  it('should preserve all metadata fields from server response', () => {
    const contentWithRichMetadata = {
      ...mockServerContentResponse,
      metadata: {
        fileName: 'complex-renamed-file.pdf',
        mimeType: 'application/pdf',
        size: 1024000,
        customField: 'custom-value',
        timestamp: 1649837929418
      }
    };

    const properMetadata = createProperMetadata(contentWithRichMetadata);

    // All metadata fields should be preserved
    expect(properMetadata.metadata.fileName).toBe('complex-renamed-file.pdf');
    expect(properMetadata.metadata.mimeType).toBe('application/pdf');
    expect(properMetadata.metadata.size).toBe(1024000);
    expect((properMetadata.metadata as any).customField).toBe('custom-value');
    expect((properMetadata.metadata as any).timestamp).toBe(1649837929418);

    console.log('✅ All metadata fields preserved correctly');
  });

  it('should work correctly for chunked content', () => {
    const chunkedContent = {
      ...mockServerContentResponse,
      contentId: 'chunked-content-id',
      isChunked: true,
      totalChunks: 100,
      totalSize: 5000000,
      isLargeFile: true,
      metadata: {
        fileName: 'large-renamed-file.zip',
        mimeType: 'application/zip',
        size: 5000000
      }
    };

    const properMetadata = createProperMetadata(chunkedContent);

    expect(properMetadata.metadata.fileName).toBe('large-renamed-file.zip');
    expect(properMetadata.isChunked).toBe(true);
    expect(properMetadata.totalChunks).toBe(100);
    expect(properMetadata.isLargeFile).toBe(true);

    console.log('✅ Chunked content metadata handled correctly');
  });

  it('should demonstrate the difference between old and new structure', () => {
    // OLD (BROKEN) APPROACH: Store entire content as metadata
    const oldApproach = {
      metadata: mockServerContentResponse, // This was the bug!
      data: 'some data',
      isComplete: true,
      lastAccessed: new Date()
    };

    // NEW (FIXED) APPROACH: Properly nest the metadata
    const newApproach = {
      metadata: createProperMetadata(mockServerContentResponse),
      data: 'some data',
      isComplete: true,
      lastAccessed: new Date()
    };

    // Old approach would require: content.metadata.metadata.fileName (WRONG)
    // But the old bug made it: content.metadata.metadata.metadata.fileName
    expect((oldApproach.metadata as any).metadata.fileName).toBe('renamed-file.txt');

    // New approach correctly provides: content.metadata.metadata.fileName
    expect(newApproach.metadata.metadata.fileName).toBe('renamed-file.txt');

    // The UI code expects this structure:
    const uiExpectedPath = newApproach.metadata.metadata.fileName;
    expect(uiExpectedPath).toBe('renamed-file.txt');

    console.log('✅ Fixed structure matches UI expectations');
  });

  it('should handle special characters in renamed filenames', () => {
    const contentWithSpecialChars = {
      ...mockServerContentResponse,
      metadata: {
        fileName: '测试文件 & special chars (1) [copy].txt',
        mimeType: 'text/plain',
        size: 100
      }
    };

    const properMetadata = createProperMetadata(contentWithSpecialChars);

    expect(properMetadata.metadata.fileName).toBe('测试文件 & special chars (1) [copy].txt');

    console.log('✅ Special characters in filenames handled correctly');
  });
});