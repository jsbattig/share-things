import { Socket } from 'socket.io';
import { BroadcastContent } from './Session';

/**
 * Interface for content chunk
 */
export interface ContentChunk {
  contentId: string;
  chunkIndex: number;
  totalChunks: number;
  data: Uint8Array | string;
  [key: string]: unknown;
}

/**
 * Represents a client connected to a session
 */
export class Client {
  /**
   * Client identifier (Socket.IO socket ID)
   */
  public readonly clientId: string;
  
  /**
   * Client display name
   */
  public readonly clientName: string;
  
  /**
   * Socket.IO socket
   */
  private readonly socket: Socket;
  
  /**
   * Connection timestamp
   */
  public readonly connectedAt: Date;
  
  /**
   * Last activity timestamp
   */
  private lastActivity: Date;
  
  /**
   * Creates a new client
   * @param clientId Client identifier
   * @param clientName Client display name
   * @param socket Socket.IO socket
   */
  constructor(clientId: string, clientName: string, socket: Socket) {
    this.clientId = clientId;
    this.clientName = clientName;
    this.socket = socket;
    this.connectedAt = new Date();
    this.lastActivity = new Date();
  }
  
  /**
   * Sends content to the client
   * @param content Content to send
   */
  public sendContent(content: BroadcastContent): void {
    console.log(`[DEBUG-CLIENT] Sending content ${content.contentId} with isPinned:`, content.isPinned, typeof content.isPinned);
    console.log(`[DEBUG-CLIENT] Full content object:`, JSON.stringify(content, null, 2));
    this.socket.emit('content', content);
    this.updateActivity();
  }
  
  /**
   * Sends a chunk to the client
   * @param chunk Chunk to send
   */
  public sendChunk(chunk: ContentChunk): void {
    this.socket.emit('chunk', chunk);
    this.updateActivity();
  }
  
  /**
   * Sends a notification to the client
   * @param type Notification type
   * @param data Notification data
   */
  public sendNotification(type: string, data: Record<string, unknown>): void {
    this.socket.emit(type, data);
    this.updateActivity();
  }
  
  /**
   * Disconnects the client
   */
  public disconnect(): void {
    this.socket.disconnect(true);
  }
  
  /**
   * Gets the last activity timestamp
   * @returns Last activity timestamp
   */
  public getLastActivity(): Date {
    return this.lastActivity;
  }
  
  /**
   * Updates the last activity timestamp
   */
  private updateActivity(): void {
    this.lastActivity = new Date();
  }
  
  /**
   * Checks if the client is connected
   * @returns True if the client is connected
   */
  public isConnected(): boolean {
    return this.socket.connected;
  }
  
  /**
   * Gets client information
   * @returns Client information
   */
  public getInfo(): { id: string, name: string } {
    return {
      id: this.clientId,
      name: this.clientName
    };
  }
}