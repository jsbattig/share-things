import { spawn, ChildProcess } from 'child_process';
import waitOn from 'wait-on';

export class AppLauncher {
  private serverProcess: ChildProcess | null = null;
  private clientProcess: ChildProcess | null = null;
  private serverLogs: string[] = [];
  private clientLogs: string[] = [];

  /**
   * Start both server and client applications
   */
  async startApplications(): Promise<void> {
    console.log('Starting applications...');
    
    // Start server with a specific port
    this.serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: './server',
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        PORT: '3003' // Use port 3003 for the server
      }
    });

    // Capture server logs
    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.on('data', (data) => {
        const log = data.toString();
        this.serverLogs.push(log);
        console.log(`[SERVER] ${log}`);
      });
    }

    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        const log = data.toString();
        this.serverLogs.push(log);
        console.error(`[SERVER ERROR] ${log}`);
      });
    }

    // Start client with a specific port
    this.clientProcess = spawn('npm', ['run', 'dev'], {
      cwd: './client',
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        VITE_PORT: '5175' // Use port 5175 for the client
      }
    });

    // Capture client logs
    if (this.clientProcess.stdout) {
      this.clientProcess.stdout.on('data', (data) => {
        const log = data.toString();
        this.clientLogs.push(log);
        console.log(`[CLIENT] ${log}`);
      });
    }

    if (this.clientProcess.stderr) {
      this.clientProcess.stderr.on('data', (data) => {
        const log = data.toString();
        this.clientLogs.push(log);
        console.error(`[CLIENT ERROR] ${log}`);
      });
    }

    // Wait for applications to be ready
    try {
      await waitOn({
        resources: [
          'http://localhost:3003', // Server API (use port 3003)
          'http://localhost:5175'  // Vite dev server (use port 5175)
        ],
        timeout: 60000, // 60 seconds timeout
        interval: 1000  // Check every second
      });
      
      console.log('Applications started successfully');
    } catch (error) {
      console.error('Error waiting for applications to start:', error);
      
      // Print logs to help with debugging
      console.log('Server logs:', this.serverLogs.join('\n'));
      console.log('Client logs:', this.clientLogs.join('\n'));
      
      // Clean up processes
      await this.stopApplications();
      
      throw new Error('Failed to start applications');
    }
  }

  /**
   * Stop both server and client applications
   */
  async stopApplications(): Promise<void> {
    console.log('Stopping applications...');
    
    // Stop client
    if (this.clientProcess) {
      this.clientProcess.kill('SIGTERM');
      this.clientProcess = null;
    }

    // Stop server
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }

    // Wait a bit to ensure processes are terminated
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Applications stopped successfully');
  }

  /**
   * Get server logs
   */
  getServerLogs(): string[] {
    return this.serverLogs;
  }

  /**
   * Get client logs
   */
  getClientLogs(): string[] {
    return this.clientLogs;
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return 'http://localhost:3003';
  }

  /**
   * Get client URL
   */
  getClientUrl(): string {
    return 'http://localhost:5175';
  }
}