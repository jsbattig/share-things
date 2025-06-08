/**
 * Browser compatibility layer for Node.js testing
 * Provides missing browser APIs that the client code expects
 */

// Create a proper Blob with slice support for Node.js
export function createCompatibleBlob(data: BufferSource, options?: BlobPropertyBag): Blob {
  const blob = new Blob([data], options);
  
  // Add slice method if it doesn't exist
  if (!blob.slice) {
    (blob as any).slice = function(start?: number, end?: number, contentType?: string) {
      const buffer = Buffer.from(data as Uint8Array);
      const sliced = buffer.slice(start, end);
      return new Blob([sliced], { type: contentType || this.type });
    };
  }
  
  return blob;
}