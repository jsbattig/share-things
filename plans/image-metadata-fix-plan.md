# Image Metadata Fix Plan

## Problem Statement

We're experiencing an issue where image metadata appears briefly and then disappears. This happens because:

1. There are two separate rendering paths for images:
   - Primary path: When `content.data instanceof Blob` is true
   - Emergency path: Using `<EmergencyImageRenderer>` when we have all chunks but no blob

2. The EmergencyImageRenderer component:
   - Does its own decryption and reassembly
   - Doesn't preserve or display metadata
   - Creates its own URL without coordinating with ContentItem

3. The metadata display only shows when both conditions are met:
   ```jsx
   metadata.contentType === ContentType.IMAGE && metadata.metadata.imageInfo
   ```

4. The Image component uses a timestamp in its key, causing unnecessary re-renders:
   ```jsx
   key={`image-${contentId}-${Date.now()}`}
   ```

## Solution Approach

We'll clean up the code by:
1. Eliminating the EmergencyImageRenderer
2. Ensuring there's only one rendering path
3. Making sure metadata is correctly preserved and available for rendering

## Implementation Plan

### 1. Modify ContentStoreContext.tsx

Enhance the `decryptAndReassembleContent` function to ensure it always:
- Properly reassembles chunks into a Blob
- Preserves all metadata, especially image dimensions and format
- Sets `isComplete` to true when reassembly is successful

```typescript
// In decryptAndReassembleContent function
// When creating the updatedContent object:
const updatedContent: ContentEntry = {
  metadata: {
    ...latestContent.metadata,
    metadata: {
      ...latestContent.metadata.metadata,
      size: reassembledBlob.size,
      imageInfo: latestContent.metadata.contentType === ContentType.IMAGE ? {
        width: latestContent.metadata.metadata.imageInfo?.width || 800,
        height: latestContent.metadata.metadata.imageInfo?.height || 600,
        format: latestContent.metadata.metadata.imageInfo?.format || 'png',
        thumbnailData: latestContent.metadata.metadata.imageInfo?.thumbnailData
      } : undefined
    }
  },
  data: reassembledBlob,
  isComplete: true,
  lastAccessed: new Date()
};
```

### 2. Modify ContentItem.tsx

Remove the EmergencyImageRenderer path and simplify the rendering logic:

```typescript
// Replace the current image rendering logic with:
return (
  <Box
    borderRadius="md"
    overflow="hidden"
    maxH="200px"
    display="flex"
    justifyContent="center"
    bg="gray.50"
  >
    {content.data instanceof Blob ? (
      <>
        <Image
          key={`image-${contentId}`} // Remove Date.now() to prevent unnecessary re-renders
          src={urlRegistry.createUrl(contentId, content.data)}
          alt={metadata.metadata.fileName || `Image-${contentId.substring(0, 8)}`}
          maxH="200px"
          objectFit="contain"
          onLoad={() => {
            console.log(`[ContentItem] Image for ${contentId} loaded successfully`);
            
            // Force update content as complete if image loads successfully
            if (!content.isComplete) {
              console.log(`[ContentItem] Force marking content ${contentId} as complete after successful image load`);
              updateContentLastAccessed(contentId);
              
              // Mark content as displayed in tracking service
              chunkTrackingService.markContentDisplayed(contentId);
            }
          }}
          onError={(e) => {
            console.error(`[ContentItem] Error loading image for ${contentId}:`, e);
          }}
        />
        {!content.isComplete && (
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.50"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="xs" color="gray.600">Finalizing image...</Text>
          </Box>
        )}
      </>
    ) : (
      <Flex align="center" justify="center" h="100px">
        <Text color="gray.500">Image preview not available</Text>
      </Flex>
    )}
  </Box>
);
```

### 3. Enhance Metadata Display

Ensure metadata is always displayed by modifying the condition:

```typescript
{metadata.contentType === ContentType.IMAGE && (
  <Text>
    {formatFileSize(metadata.metadata.size)}
    {metadata.metadata.imageInfo?.width && metadata.metadata.imageInfo?.height &&
      ` • ${metadata.metadata.imageInfo.width}×${metadata.metadata.imageInfo.height}`}
    {metadata.metadata.imageInfo?.format && ` • ${metadata.metadata.imageInfo.format}`}
  </Text>
)}
```

### 4. Remove EmergencyImageRenderer.tsx

Since we're consolidating to a single rendering path, we can remove this file entirely.

## Expected Results

After these changes:
1. There will be only one rendering path for images
2. Metadata will be consistently displayed
3. The code will be simpler and follow the DRY principle
4. The flickering and disappearing metadata issue will be resolved

## Testing Plan

1. Test sending images of various sizes
2. Verify metadata is consistently displayed
3. Check console logs to ensure there are no errors
4. Verify that images load correctly without the EmergencyImageRenderer