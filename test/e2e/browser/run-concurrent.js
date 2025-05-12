const { spawn } = require('child_process');
const waitOn = require('wait-on');

// Function to run a command and return a promise
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`Running command: ${command} ${args.join(' ')} in ${cwd || 'current directory'}`);
    
    const process = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    // Return the process so it can be killed later
    return process;
  });
}

// Main function
async function main() {
  try {
    // Start the server
    console.log('Starting server...');
    const serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: './server',
      stdio: 'inherit',
      shell: true,
      detached: true
    });
    
    // Start the client
    console.log('Starting client...');
    const clientProcess = spawn('npm', ['run', 'dev'], {
      cwd: './client',
      stdio: 'inherit',
      shell: true,
      detached: true
    });
    
    // Wait for both to be ready
    console.log('Waiting for servers to be ready...');
    await waitOn({
      resources: [
        'http://localhost:3000', // Server API
        'http://localhost:3001'  // Client (Vite dev server)
      ],
      timeout: 60000,
      interval: 1000
    });
    
    console.log('Servers are ready, running tests...');
    
    try {
      // Run the tests
      await runCommand('npx', [
        'playwright',
        'test',
        'test/e2e/browser/tests/simple.test.ts',
        '--config=test/e2e/browser/playwright.config.ts',
        '--project=chromium'
      ]);
      
      console.log('Tests completed successfully!');
    } finally {
      // Clean up
      console.log('Cleaning up...');
      process.kill(-serverProcess.pid);
      process.kill(-clientProcess.pid);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the main function
main();