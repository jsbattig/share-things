# Content Handling Approach

## Overview

ShareThings uses a unified approach to handle different types of content (text, images, files) with a consistent processing pipeline. This document outlines the current content handling implementation based on the actual code.

## Content Types

The application supports the following content types:

1. **Text**: Plain text, formatted text, code snippets
2. **Image**: Images from clipboard or files
3. **File**: Any file type (including images that should be treated as files)

## Content Processing Pipeline

The current implementation follows this simplified pipeline:

```mermaid
graph TD
    A[Content Capture] --> B[Type Detection]
    B --> C[Metadata Extraction]
    C --> D[Size Analysis]
    
    D -->|Small Content| E[Direct Encryption]
    D -->|Large Content| F[Chunking]
    
    F --> G[Chunk Encryption]
    G --> H[Sequential Transmission]
    
    E --> I[Direct Transmission]
    
    I --> J[Server Forwarding]
    H --> J
    
    J --> K[Client Reception]
    
    K -->|Single Content| L[Decryption]
    K -->|Chunks| M[Chunk Collection]
    
    M -->|All Chunks Received| N[Reassembly]
    N --> L
    
    L --> O[Content Store]
    O --> P[Display/Download]
```

### 1. Content Capture

Content can be captured from multiple sources:

- **Clipboard**: Text and images from the clipboard
- **Drag and Drop**: Files and content dragged into the application
- **File Selection**: Files selected through a file picker
- **Text Input**: Text entered directly into the application

The current implementation handles these sources through React components and event handlers.

### 2. Type Detection

Content type is detected based on:

- MIME type
- File extension
- Content analysis

```typescript
// Content type detection (simplified from actual implementation)
function detectContentType(data: any, mimeType?: string): ContentType {
  if (typeof data === 'string') {
    // Check if it's a base64 image
    if (data.startsWith('data:image/')) {
      return ContentType.IMAGE;
    }
    return ContentType.TEXT;
  }
  
  if (data instanceof Blob || data instanceof File) {
    if (mimeType?.startsWith('image/') || data.type?.startsWith('image/')) {
      return ContentType.IMAGE;
    }
    return ContentType.FILE;
  }
  
  return ContentType.OTHER;
}
```

### 3. Metadata Extraction

Metadata is extracted based on content type, including:

- File name
- MIME type
- Size
- For images: dimensions and format
- For text: encoding and line count

### 4. Size Analysis and Chunking

Content is analyzed to determine if it needs to be chunked. The current implementation uses a fixed threshold of 64KB:

```typescript
// From chunking.ts
export function isChunkingNeeded(fileSize: number, threshold: number = DEFAULT_OPTIONS.chunkSize!): boolean {
  return fileSize > threshold;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 64 * 1024, // 64KB
  onProgress: () => {}
};
```

If chunking is needed, the content is split into fixed-size chunks:

```typescript
// From chunking.ts
export async function chunkAndEncryptBlob(
  blob: Blob,
  passphrase: string,
  options: ChunkingOptions = {}
): Promise<{ chunks: Chunk[]; contentId: string }> {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunkSize = opts.chunkSize || DEFAULT_OPTIONS.chunkSize!;
  const onProgress = opts.onProgress || DEFAULT_OPTIONS.onProgress!;
  
  // Generate content ID
  const contentId = uuidv4();
  
  // Calculate total chunks
  const totalChunks = Math.ceil(blob.size / chunkSize);
  
  // Derive encryption key
  const key = await deriveKeyFromPassphrase(passphrase);
  
  // Create chunks
  const chunks: Chunk[] = [];
  
  for (let i = 0; i < totalChunks; i++) {
    // Calculate chunk range
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, blob.size);
    
    // Extract chunk data
    const chunkBlob = blob.slice(start, end);
    const arrayBuffer = await chunkBlob.arrayBuffer();
    const chunkData = new Uint8Array(arrayBuffer);

    // Encrypt chunk
    const { encryptedData, iv } = await encryptData(key, chunkData, passphrase);
    
    // Create chunk
    chunks.push({
      contentId,
      chunkIndex: i,
      totalChunks,
      encryptedData: new Uint8Array(encryptedData),
      iv
    });
    
    // Report progress
    onProgress((i + 1) / totalChunks);
  }
  
  return { chunks, contentId };
}
```

### 5. Encryption

Unlike the Web Crypto API approach described in earlier documentation, the current implementation uses CryptoJS for encryption:

```typescript
// From encryption.ts
export async function encryptData(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
  try {
    console.log('Encrypting data using CryptoJS');
    
    // Generate IV
    const iv = await generateDeterministicIV(passphrase, data);
    
    // Convert data to WordArray
    const dataArray = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    const dataWords = [];
    for (let i = 0; i < dataArray.length; i += 4) {
      dataWords.push(
        ((dataArray[i] || 0) << 24) |
        ((dataArray[i + 1] || 0) << 16) |
        ((dataArray[i + 2] || 0) << 8) |
        (dataArray[i + 3] || 0)
      );
    }
    const dataWordArray = CryptoJS.lib.WordArray.create(dataWords, dataArray.length);
    
    // Convert IV to WordArray
    const ivWords = [];
    for (let i = 0; i < iv.length; i += 4) {
      ivWords.push(
        ((iv[i] || 0) << 24) |
        ((iv[i + 1] || 0) << 16) |
        ((iv[i + 2] || 0) << 8) |
        (iv[i + 3] || 0)
      );
    }
    const ivWordArray = CryptoJS.lib.WordArray.create(ivWords, iv.length);
    
    // Encrypt data
    const encrypted = CryptoJS.AES.encrypt(dataWordArray, key.key, {
      iv: ivWordArray,
      padding: CryptoJS.pad.Pkcs7
    });
    
    // Convert to ArrayBuffer
    const ciphertext = encrypted.ciphertext;
    const encryptedWords = ciphertext.words;
    const encryptedBytes = new Uint8Array(ciphertext.sigBytes);
    
    for (let i = 0; i < encryptedBytes.length; i += 4) {
      const word = encryptedWords[i / 4];
      encryptedBytes[i] = (word >>> 24) & 0xff;
      if (i + 1 < encryptedBytes.length) encryptedBytes[i + 1] = (word >>> 16) & 0xff;
      if (i + 2 < encryptedBytes.length) encryptedBytes[i + 2] = (word >>> 8) & 0xff;
      if (i + 3 < encryptedBytes.length) encryptedBytes[i + 3] = word & 0xff;
    }
    
    return { encryptedData: encryptedBytes.buffer, iv };
  } catch (error) {
    console.error('Error encrypting data:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

Key differences from earlier documentation:
- Uses CryptoJS instead of Web Crypto API
- Does not use Web Workers
- Uses deterministic IV generation based on passphrase and data

### 6. Transmission

Content is transmitted via Socket.IO. For chunked content, chunks are processed in batches to avoid blocking the UI:

```typescript
// From chunking.ts
export async function processChunksInBatches(
  chunks: Chunk[],
  processor: (chunk: Chunk) => Promise<void>,
  batchSize: number = 5,
  onProgress?: (progress: number) => void
): Promise<void> {
  const totalChunks = chunks.length;
  let processedChunks = 0;
  
  // Process chunks in batches
  for (let i = 0; i < totalChunks; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // Process batch in parallel
    await Promise.all(batch.map(async (chunk) => {
      await processor(chunk);
      processedChunks++;
      
      // Report progress
      if (onProgress) {
        onProgress(processedChunks / totalChunks);
      }
    }));
    
    // Yield to UI thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

### 7. Reception and Reassembly

The ContentStoreContext handles the reception and reassembly of content:

```typescript
// Simplified from ContentStoreContext.tsx
const addChunk = useCallback(async (chunk: Chunk) => {
  // Get or create chunk store
  const contentId = chunk.contentId;
  const chunkStore = chunkStores.current.get(contentId) || {
    chunks: new Map<number, Chunk>(),
    totalChunks: chunk.totalChunks
  };
  
  // Add chunk
  chunkStore.chunks.set(chunk.chunkIndex, chunk);
  chunkStores.current.set(contentId, chunkStore);
  
  // Check if all chunks received
  if (chunkStore.chunks.size === chunkStore.totalChunks) {
    // Reassemble content
    await reassembleContent(contentId, chunkStore);
    return true;
  }
  
  return false;
}, [reassembleContent]);
```

### 8. Display

Content is displayed based on its type using React components:

```tsx
// Simplified content display component
const ContentItem: React.FC<{ content: ContentItemType }> = ({ content }) => {
  switch (content.contentType) {
    case 'text':
      return <TextContent content={content} />;
    case 'image':
      return <ImageContent content={content} />;
    case 'file':
      return <FileContent content={content} />;
    default:
      return <GenericContent content={content} />;
  }
};
```

## Type-Specific Handling

### Text Content

- Display in a pre-formatted or formatted container
- Copy to clipboard functionality
- Syntax highlighting for code (if implemented)

### Image Content

- Display in an img element with appropriate sizing
- Download option
- Copy to clipboard functionality

### File Content

- Display file information (name, size, type)
- Download button
- File icon based on type

## Content Store

The ContentStoreContext manages all shared content:

```typescript
// Simplified from ContentStoreContext.tsx
export const ContentStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contentItems, setContentItems] = useState<Map<string, ContentItem>>(new Map());
  const chunkStores = useRef<Map<string, ChunkStore>>(new Map());
  
  // Add content
  const addContent = useCallback((content: ContentMetadata, data?: string | Blob) => {
    setContentItems(prev => {
      const newMap = new Map(prev);
      newMap.set(content.contentId, {
        metadata: content,
        data,
        timestamp: Date.now()
      });
      return newMap;
    });
  }, []);
  
  // Add chunk
  const addChunk = useCallback(async (chunk: Chunk) => {
    // Implementation details...
  }, []);
  
  // Get content
  const getContent = useCallback((contentId: string) => {
    return contentItems.get(contentId);
  }, [contentItems]);
  
  // Context value
  const value = useMemo(() => ({
    contentItems,
    addContent,
    addChunk,
    getContent,
    // Other methods...
  }), [contentItems, addContent, addChunk, getContent]);
  
  return (
    <ContentStoreContext.Provider value={value}>
      {children}
    </ContentStoreContext.Provider>
  );
};
```

## Memory Management

The current implementation includes basic memory management:

1. **Content Eviction**: Old content can be removed when no longer needed
2. **Chunk Cleanup**: Chunks are removed after reassembly
3. **Session Cleanup**: Content is cleared when leaving a session

## Future Enhancements

Potential future enhancements to the content handling implementation could include:

1. **Web Workers**: Implement Web Workers for non-blocking encryption and processing
2. **Progressive Enhancement**: Add better feature detection and fallbacks
3. **Advanced Content Types**: Add support for more content types and formats
4. **Content Previews**: Implement previews for different file types
5. **Content Editing**: Add basic editing capabilities for text content