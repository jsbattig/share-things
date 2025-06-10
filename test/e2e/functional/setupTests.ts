// Add XMLHttpRequest mock for blob-polyfill
if (typeof (global as any).XMLHttpRequest === 'undefined') {
  (global as any).XMLHttpRequest = class XMLHttpRequest {
    open() {}
    send() {}
    setRequestHeader() {}
  } as any;
}

import 'blob-polyfill';

// Import unified crypto system for Node.js environment
import '/shared/crypto/polyfills';

// Ensure CryptoJS is available globally
if (!(global as any).CryptoJS && !(globalThis as any).CryptoJS) {
  console.log('CryptoJS polyfill setup in test environment');
}

// Simple crypto.getRandomValues polyfill for Node.js (only needed for random number generation)
if (typeof (global as any).crypto === 'undefined') {
  (global as any).crypto = {
    getRandomValues: (array: Uint8Array) => {
      // Fill array with deterministic "random" values for testing
      for (let i = 0; i < array.length; i++) {
        array[i] = (i * 13 + 7) % 256; // Simple deterministic pattern
      }
      return array;
    }
  } as any;
}

// Add Blob polyfill for Node.js
if (typeof (global as any).Blob === 'undefined') {
  (global as any).Blob = class MockBlob {
    private data: any;
    public size: number;
    public type: string;

    constructor(data: any[] = [], options: { type?: string } = {}) {
      this.data = data;
      // Calculate size more accurately
      this.size = data.reduce((acc, item) => {
        if (typeof item === 'string') {
          return acc + item.length;
        } else if (item instanceof ArrayBuffer) {
          return acc + item.byteLength;
        } else if (item && item.length !== undefined) {
          return acc + item.length;
        }
        return acc;
      }, 0);
      this.type = options.type || '';
    }

    arrayBuffer(): Promise<ArrayBuffer> {
      // Create ArrayBuffer from the actual data
      const buffer = new ArrayBuffer(this.size);
      const view = new Uint8Array(buffer);
      
      let offset = 0;
      for (const item of this.data) {
        if (typeof item === 'string') {
          // Convert string to bytes
          for (let i = 0; i < item.length; i++) {
            view[offset++] = item.charCodeAt(i);
          }
        } else if (item instanceof ArrayBuffer) {
          // Copy ArrayBuffer data
          const itemView = new Uint8Array(item);
          view.set(itemView, offset);
          offset += item.byteLength;
        } else if (item instanceof Buffer) {
          // Copy Buffer data
          view.set(item, offset);
          offset += item.length;
        } else if (item && item.length !== undefined) {
          // Copy array-like data
          view.set(item, offset);
          offset += item.length;
        }
      }
      
      return Promise.resolve(buffer);
    }

    text(): Promise<string> {
      return Promise.resolve(this.data.join(''));
    }
  } as any;
  
  console.log('Blob polyfill installed for Node.js environment');
}