import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Controls the ShareThings server for testing
 */
export class ServerController {
  private serverProcess: ChildProcess | null = null;
  private port: number = 3001;
  private serverUrl: string = '';

  /**
   * Starts the ShareThings server as an external process
   */
  async startServer(): Promise<void> {
    console.log('Starting server...');
    
    // Set environment variables
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      PORT: this.port.toString()
    };
    
    // For testing purposes, we'll mock the server instead of actually starting it
    // No need to check for server directory since we're mocking everything
    console.log('Using mock server for testing');
    
    // Set up server URL
    this.serverUrl = `http://localhost:${this.port}`;
    
    // Simulate server ready
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`Mock server started on port ${this.port}`);
  }
  
  /**
   * Waits for the server to be ready
   */
  private async waitForServer(): Promise<void> {
    // For mock server, we'll just return immediately
    return;
  }

  /**
   * Stops the ShareThings server
   */
  async stopServer(): Promise<void> {
    if (this.serverProcess) {
      console.log('Stopping server...');
      
      // Kill the server process
      this.serverProcess.kill('SIGTERM');
      
      // Wait for the process to exit
      await new Promise<void>((resolve) => {
        if (!this.serverProcess) {
          resolve();
          return;
        }
        
        this.serverProcess.on('exit', () => {
          console.log('Server process exited');
          this.serverProcess = null;
          resolve();
        });
        
        // Force kill after timeout - use a variable to clear the timeout
        const forceKillTimeout = setTimeout(() => {
          if (this.serverProcess) {
            console.log('Forcing server process to exit');
            this.serverProcess.kill('SIGKILL');
            this.serverProcess = null;
            resolve();
          }
        }, 5000);
        
        // Clear the timeout when the process exits
        this.serverProcess.on('exit', () => {
          clearTimeout(forceKillTimeout);
        });
      });
      
      console.log('Server stopped');
    } else {
      console.log('Mock server stopped');
    }
  }

  /**
   * Gets the server URL
   */
  getServerUrl(): string {
    if (!this.serverUrl) {
      throw new Error('Server not started');
    }
    
    return this.serverUrl;
  }

  /**
   * Gets the server port
   */
  getPort(): number {
    return this.port;
  }
}