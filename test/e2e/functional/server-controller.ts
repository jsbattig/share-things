import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

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
    
    // Get the path to the server directory
    const serverDir = path.resolve(__dirname, '../../../server');
    
    // Check if the server directory exists
    if (!fs.existsSync(serverDir)) {
      throw new Error(`Server directory not found: ${serverDir}`);
    }
    
    // Start the server process
    this.serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: serverDir,
      env,
      stdio: 'pipe' // Capture stdout and stderr
    });
    
    // Set up server URL
    this.serverUrl = `http://localhost:${this.port}`;
    
    // Handle server output
    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.on('data', (data) => {
        console.log(`Server stdout: ${data}`);
      });
    }
    
    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        console.error(`Server stderr: ${data}`);
      });
    }
    
    // Handle server exit
    this.serverProcess.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code} and signal ${signal}`);
    });
    
    // Wait for server to be ready
    await this.waitForServer();
    
    console.log(`Server started on port ${this.port}`);
  }
  
  /**
   * Waits for the server to be ready
   */
  private async waitForServer(): Promise<void> {
    const maxRetries = 30;
    const retryInterval = 1000;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to connect to the server
        await new Promise<void>((resolve, reject) => {
          const req = http.get(this.serverUrl + '/health', (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`Server returned status code ${res.statusCode}`));
            }
          });
          
          req.on('error', reject);
          req.end();
        });
        
        // Server is ready
        return;
      } catch (error) {
        // Server not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
    
    throw new Error(`Server did not become ready after ${maxRetries * retryInterval / 1000} seconds`);
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