/**
 * Disk Cache Service for storing binary content using IndexedDB
 * This service handles persistent storage of non-text content
 */

export interface DiskCacheEntry {
  contentId: string;
  data: Blob;
  mimeType: string;
  fileName?: string;
  storedAt: number;
}

export class DiskCacheService {
  private dbName = 'ShareThingsCache';
  private dbVersion = 1;
  private storeName = 'content';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[DiskCache] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[DiskCache] IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'contentId' });
          store.createIndex('storedAt', 'storedAt', { unique: false });
          console.log('[DiskCache] Object store created');
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initDB();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  async storeContent(contentId: string, data: Blob, mimeType: string, fileName?: string): Promise<string> {
    try {
      const db = await this.ensureDB();
      
      const entry: DiskCacheEntry = {
        contentId,
        data,
        mimeType,
        fileName,
        storedAt: Date.now()
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(entry);

        request.onsuccess = () => {
          console.log(`[DiskCache] Stored content ${contentId} (${data.size} bytes)`);
          resolve(contentId);
        };

        request.onerror = () => {
          console.error(`[DiskCache] Failed to store content ${contentId}:`, request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error(`[DiskCache] Error storing content ${contentId}:`, error);
      throw error;
    }
  }

  async retrieveContent(contentId: string): Promise<Blob | null> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(contentId);

        request.onsuccess = () => {
          const entry = request.result as DiskCacheEntry | undefined;
          if (entry) {
            console.log(`[DiskCache] Retrieved content ${contentId} (${entry.data.size} bytes)`);
            resolve(entry.data);
          } else {
            console.log(`[DiskCache] Content ${contentId} not found in cache`);
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error(`[DiskCache] Failed to retrieve content ${contentId}:`, request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error(`[DiskCache] Error retrieving content ${contentId}:`, error);
      return null;
    }
  }

  async clearContent(contentId: string): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(contentId);

        request.onsuccess = () => {
          console.log(`[DiskCache] Cleared content ${contentId}`);
          resolve();
        };

        request.onerror = () => {
          console.error(`[DiskCache] Failed to clear content ${contentId}:`, request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error(`[DiskCache] Error clearing content ${contentId}:`, error);
      throw error;
    }
  }

  async clearAll(): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('[DiskCache] Cleared all content');
          resolve();
        };

        request.onerror = () => {
          console.error('[DiskCache] Failed to clear all content:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[DiskCache] Error clearing all content:', error);
      throw error;
    }
  }

  async getStorageInfo(): Promise<{ totalSize: number; itemCount: number }> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const entries = request.result as DiskCacheEntry[];
          const totalSize = entries.reduce((sum, entry) => sum + entry.data.size, 0);
          const itemCount = entries.length;

          console.log(`[DiskCache] Storage info: ${itemCount} items, ${totalSize} bytes`);
          resolve({ totalSize, itemCount });
        };

        request.onerror = () => {
          console.error('[DiskCache] Failed to get storage info:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[DiskCache] Error getting storage info:', error);
      return { totalSize: 0, itemCount: 0 };
    }
  }
}

// Singleton instance
export const diskCacheService = new DiskCacheService();