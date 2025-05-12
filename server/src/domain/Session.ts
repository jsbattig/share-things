import { Client } from './Client';

/**
 * Represents a sharing session
 */
export class Session {
  /**
   * Session identifier
   */
  public readonly sessionId: string;
  
  /**
   * Map of clients in the session
   */
  public readonly clients: Map<string, Client>;
  
  /**
   * Creation timestamp
   */
  public readonly createdAt: Date;
  
  /**
   * Last activity timestamp
   */
  private lastActivity: Date;
  
  /**
   * Creates a new session
   * @param sessionId Session identifier
   */
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.clients = new Map<string, Client>();
    this.createdAt = new Date();
    this.lastActivity = new Date();
  }
  
  /**
   * Adds a client to the session
   * @param client Client to add
   */
  public addClient(client: Client): void {
    this.clients.set(client.clientId, client);
    this.updateActivity();
  }
  
  /**
   * Removes a client from the session
   * @param clientId Client identifier
   */
  public removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.updateActivity();
  }
  
  /**
   * Broadcasts content to all clients in the session
   * @param content Content to broadcast
   * @param excludeClientId Client to exclude from broadcast
   */
  public broadcastContent(content: any, excludeClientId?: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }
      
      client.sendContent(content);
    }
    
    this.updateActivity();
  }
  
  /**
   * Gets the number of clients in the session
   * @returns Number of clients
   */
  public getClientCount(): number {
    return this.clients.size;
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
   * Checks if the session is expired
   * @param expiryTime Expiry time in milliseconds
   * @returns True if the session is expired
   */
  public isExpired(expiryTime: number): boolean {
    const now = new Date();
    const elapsed = now.getTime() - this.lastActivity.getTime();
    return elapsed > expiryTime;
  }
}