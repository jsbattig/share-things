import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { EncryptionService } from './encryption-service';

/**
 * Content types
 */
export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  OTHER = 'other'
}

/**
 * Emulates a browser client
 */
export class ClientEmulator {
  private clientName: string;
  private socket: any = null;
  private encryptionService: EncryptionService;
  private contentStore: Map<string, any> = new Map();
  private sessionId: string | null = null;
  private passphrase: string | null = null;
  private events: EventEmitter = new EventEmitter();
  private connected: boolean = false;

  /**
   * Creates a new client emulator
   * @param clientName Client name
   */
  constructor(clientName: string) {
    this.clientName = clientName;
    this.encryptionService = new EncryptionService();
  }

  /**
   * Connects to the server
   * @param serverUrl Server URL
   */
  async connect(serverUrl: string): Promise<void> {
    console.log(`${this.clientName} connecting to mock server at ${serverUrl}`);
    
    // Create a mock socket
    this.socket = {
      id: uuidv4(),
      emit: (event: string, data: any, callback?: Function) => {
        console.log(`${this.clientName} emitted ${event}`);
        if (callback) {
          callback({ success: true });
        }
      },
      on: (event: string, handler: Function) => {
        console.log(`${this.clientName} registered handler for ${event}`);
      },
      disconnect: () => {
        console.log(`${this.clientName} disconnected from mock server`);
      }
    };
    
    this.connected = true;
    console.log(`${this.clientName} connected to mock server`);
    
    return Promise.resolve();
  }

  /**
   * Joins a session
   * @param sessionId Session ID
   * @param passphrase Encryption passphrase
   */
  async joinSession(sessionId: string, passphrase: string): Promise<any> {
    if (!this.socket || !this.connected) {
      throw new Error('Not connected to server');
    }

    this.sessionId = sessionId;
    this.passphrase = passphrase;

    // Initialize encryption service with passphrase
    await this.encryptionService.initialize(passphrase);

    console.log(`${this.clientName} joined session ${sessionId}`);
    return Promise.resolve({ success: true });
  }

  /**
   * Leaves the current session
   */
  leaveSession(): void {
    if (!this.socket || !this.connected || !this.sessionId) {
      return;
    }

    console.log(`${this.clientName} left session ${this.sessionId}`);
    this.sessionId = null;
    this.passphrase = null;
    this.contentStore.clear();
  }

  /**
   * Disconnects from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.leaveSession();
      this.socket = null;
      this.connected = false;
      console.log(`${this.clientName} disconnected`);
    }
  }

  /**
   * Shares text content
   * @param text Text to share
   */
  async shareText(text: string): Promise<void> {
    if (!this.socket || !this.connected || !this.sessionId || !this.passphrase) {
      throw new Error('Not in a session');
    }

    console.log(`${this.clientName} shared text: ${text.substring(0, 20)}${text.length > 20 ? '...' : ''}`);
    
    // Mock successful sharing
    return Promise.resolve();
  }

  /**
   * Gets received content
   */
  getReceivedContent(): Map<string, any> {
    return this.contentStore;
  }

  /**
   * Decrypts content
   * @param content Encrypted content
   */
  async decryptContent(content: any): Promise<any> {
    console.log(`${this.clientName} decrypting mock content`);
    return content.data || null;
  }

  /**
   * Waits for content to be received
   * @param timeout Timeout in milliseconds
   */
  async waitForContent(timeout: number = 5000): Promise<any> {
    // For testing, immediately resolve with mock content
    const mockContent = {
      contentId: uuidv4(),
      senderId: 'mock-sender',
      senderName: 'MockSender',
      contentType: ContentType.TEXT,
      timestamp: Date.now(),
      data: 'Mock content for testing'
    };
    
    // Add to content store
    this.contentStore.set(mockContent.contentId, mockContent);
    
    return Promise.resolve(mockContent);
  }
}