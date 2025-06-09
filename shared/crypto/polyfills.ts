/**
 * Polyfills for Node.js test environment
 */

// Blob polyfill for Node.js
if (typeof global !== 'undefined' && !global.Blob) {
  class NodeBlob {
    private _data: ArrayBuffer;
    public readonly type: string;
    public readonly size: number;

    constructor(blobParts: any[] = [], options: { type?: string } = {}) {
      this.type = options.type || '';
      
      // Convert all parts to ArrayBuffer
      const buffers: ArrayBuffer[] = [];
      let totalSize = 0;

      for (const part of blobParts) {
        let buffer: ArrayBuffer;
        
        if (part instanceof ArrayBuffer) {
          buffer = part;
        } else if (part instanceof Uint8Array) {
          buffer = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength);
        } else if (typeof part === 'string') {
          const encoder = new TextEncoder();
          buffer = encoder.encode(part).buffer;
        } else {
          // Convert to string first
          const encoder = new TextEncoder();
          buffer = encoder.encode(String(part)).buffer;
        }
        
        buffers.push(buffer);
        totalSize += buffer.byteLength;
      }

      // Combine all buffers
      this._data = new ArrayBuffer(totalSize);
      const view = new Uint8Array(this._data);
      let offset = 0;

      for (const buffer of buffers) {
        view.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }

      this.size = totalSize;
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      return this._data.slice(0);
    }

    async text(): Promise<string> {
      const decoder = new TextDecoder();
      return decoder.decode(this._data);
    }

    slice(start?: number, end?: number, contentType?: string): Blob {
      const sliced = this._data.slice(start, end);
      return new NodeBlob([sliced], { type: contentType || this.type }) as any;
    }
  }

  // Add to global scope
  (global as any).Blob = NodeBlob;
}

// btoa/atob polyfills for Node.js
if (typeof global !== 'undefined') {
  if (!global.btoa) {
    (global as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  }
  
  if (!global.atob) {
    (global as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
  }
}