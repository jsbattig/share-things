import { TextEncoder, TextDecoder } from 'util';
import { JSDOM } from 'jsdom';
import * as crypto from 'crypto';

// CryptoJS is now mocked via Jest moduleNameMapper

// Set up JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

// Set up global browser environment
global.window = dom.window as any;
global.document = dom.window.document;
global.navigator = dom.window.navigator as any;
global.HTMLElement = dom.window.HTMLElement;
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Mock Web Crypto API
global.crypto = {
  getRandomValues: (buffer: Uint8Array) => {
    const bytes = crypto.randomBytes(buffer.length);
    buffer.set(new Uint8Array(bytes));
    return buffer;
  },
  subtle: {
    // Import key from raw data
    importKey: async (format: string, keyData: ArrayBuffer, algorithm: any, extractable: boolean, keyUsages: string[]) => {
      // For simplicity in tests, we'll just return the key data as is
      return {
        type: 'mock-key',
        algorithm,
        extractable,
        usages: keyUsages,
        raw: keyData,
      };
    },
    
    // Derive key from base key
    deriveKey: async (algorithm: any, baseKey: any, derivedKeyAlgorithm: any, extractable: boolean, keyUsages: string[]) => {
      // Create a deterministic key based on the inputs
      const hmac = crypto.createHmac('sha256', Buffer.from(baseKey.raw));
      hmac.update(algorithm.salt || Buffer.alloc(0));
      hmac.update(Buffer.from([algorithm.iterations]));
      
      return {
        type: 'mock-derived-key',
        algorithm: derivedKeyAlgorithm,
        extractable,
        usages: keyUsages,
        raw: hmac.digest(),
      };
    },
    
    // Digest function for hashing
    digest: async (algorithm: string, data: ArrayBuffer) => {
      // Use Node.js crypto for hashing
      const hash = crypto.createHash(algorithm.replace('-', '').toLowerCase());
      hash.update(Buffer.from(data));
      return hash.digest().buffer;
    },
    
    // Encrypt data
    encrypt: async (algorithm: any, key: any, data: ArrayBuffer) => {
      // Simple mock encryption using Node.js crypto
      const iv = algorithm.iv || crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        Buffer.from(key.raw).slice(0, 32),
        Buffer.from(iv)
      );
      
      const dataBuffer = Buffer.from(data);
      const encrypted = Buffer.concat([
        cipher.update(dataBuffer),
        cipher.final()
      ]);
      
      return encrypted.buffer;
    },
    
    // Decrypt data
    decrypt: async (algorithm: any, key: any, data: ArrayBuffer) => {
      // Simple mock decryption using Node.js crypto
      const iv = algorithm.iv;
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(key.raw).slice(0, 32),
        Buffer.from(iv)
      );
      
      const dataBuffer = Buffer.from(data);
      const decrypted = Buffer.concat([
        decipher.update(dataBuffer),
        decipher.final()
      ]);
      
      return decrypted.buffer;
    },
    
    // Export key
    exportKey: async (format: string, key: any) => {
      return key.raw;
    }
  }
} as any;

// Mock Clipboard API
class ClipboardMock {
  private items: Map<string, any> = new Map();
  
  // Mock clipboard read
  async read(): Promise<any[]> {
    return Array.from(this.items.entries()).map(([type, data]) => {
      return {
        types: [type],
        getType: async (t: string) => {
          if (t === type) {
            return data instanceof Blob ? data : new Blob([data], { type });
          }
          throw new Error(`Type ${t} not found`);
        }
      };
    });
  }
  
  // Mock clipboard write
  async write(items: any[]): Promise<void> {
    for (const item of items) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        this.items.set(type, blob);
      }
    }
  }
  
  // Helper methods for tests
  setTextContent(text: string): void {
    this.items.set('text/plain', text);
  }
  
  setImageContent(image: Blob): void {
    this.items.set('image/png', image);
  }
  
  clear(): void {
    this.items.clear();
  }
}

// Create a new navigator object with clipboard mock
const originalNavigator = global.navigator;
global.navigator = {
  ...originalNavigator,
  clipboard: new ClipboardMock() as any
} as any;

// Mock DataTransfer for drag and drop
class DataTransferMock {
  private data: Map<string, string> = new Map();
  private fileList: File[] = [];
  dropEffect: string = 'copy';
  effectAllowed: string = 'all';
  
  // DataTransfer methods
  setData(format: string, data: string): void {
    this.data.set(format, data);
  }
  
  getData(format: string): string {
    return this.data.get(format) || '';
  }
  
  clearData(format?: string): void {
    if (format) {
      this.data.delete(format);
    } else {
      this.data.clear();
    }
  }
  
  setDragImage(image: Element, x: number, y: number): void {
    // No-op in mock
  }
  
  // File handling
  get items(): any {
    const itemsList: any[] = [];
    
    // Add items for string data
    for (const [format, value] of this.data.entries()) {
      itemsList.push({
        kind: 'string',
        type: format,
        getAsString: (callback: (value: string) => void) => callback(value),
        getAsFile: () => null
      });
    }
    
    // Add items for files
    for (const file of this.fileList) {
      itemsList.push({
        kind: 'file',
        type: file.type,
        getAsString: () => {},
        getAsFile: () => file
      });
    }
    
    return {
      length: itemsList.length,
      add: () => false,
      clear: () => {},
      remove: () => {},
      [Symbol.iterator]: function* () {
        for (const item of itemsList) {
          yield item;
        }
      },
      ...itemsList.reduce((acc, item, index) => {
        acc[index] = item;
        return acc;
      }, {} as Record<number, any>)
    };
  }
  
  get types(): string[] {
    return Array.from(this.data.keys());
  }
  
  get files(): any {
    return {
      length: this.fileList.length,
      item: (index: number) => this.fileList[index] || null,
      [Symbol.iterator]: function* () {
        for (const file of this.fileList) {
          yield file;
        }
      },
      ...this.fileList.reduce((acc, file, index) => {
        acc[index] = file;
        return acc;
      }, {} as Record<number, File>)
    };
  }
  
  // Helper methods for tests
  addFile(file: File): void {
    this.fileList.push(file);
  }
}

// Add DataTransfer constructor to global
global.DataTransfer = DataTransferMock as any;

// Mock DragEvent
class DragEventMock extends Event {
  dataTransfer: any;
  
  constructor(type: string, init: any = {}) {
    super(type, init);
    this.dataTransfer = init.dataTransfer || new DataTransferMock();
  }
}

// Add DragEvent constructor to global
global.DragEvent = DragEventMock as any;

// Add Blob constructor to global if not present
if (!global.Blob) {
  global.Blob = class Blob {
    size: number;
    type: string;
    
    constructor(bits: any[] = [], options: any = {}) {
      this.size = bits.reduce((acc, bit) => acc + (bit.length || 0), 0);
      this.type = options.type || '';
    }
    
    async text(): Promise<string> {
      return '';
    }
    
    async arrayBuffer(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    }
    
    slice(start?: number, end?: number, contentType?: string): Blob {
      return new Blob([], { type: contentType });
    }
  } as any;
}

// Add File constructor to global if not present
if (!global.File) {
  global.File = class File extends Blob {
    name: string;
    lastModified: number;
    
    constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
      super(bits, options);
      this.name = name;
      this.lastModified = options?.lastModified || Date.now();
    }
  } as any;
}

// Add console.log wrapper for debugging
const originalLog = console.log;
console.log = (...args) => {
  originalLog('[TEST]', ...args);
};