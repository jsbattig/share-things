import { ServerController } from './server-controller';
import { ClientEmulator } from './client-emulator';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

describe('Session Persistence Tests', () => {
  let server: ServerController;
  let client: ClientEmulator;
  
  const testDbPath = path.join(process.cwd(), 'data', `test-sessions-${Date.now()}.db`);
  const sessionId = `test-session-${uuidv4().substring(0, 8)}`;
  const correctPassphrase = 'correct-passphrase';
  const wrongPassphrase = 'wrong-passphrase';
  
  beforeAll(() => {
    // Ensure data directory exists
    const dataDir = path.dirname(testDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    console.log(`Using test database at: ${testDbPath}`);
  });
  
  afterAll(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
        console.log(`Removed test database: ${testDbPath}`);
      } catch (error) {
        console.error(`Failed to remove test database: ${error}`);
      }
    }
  });
  
  beforeEach(() => {
    server = new ServerController();
    server.setDbPath(testDbPath);
    
    client = new ClientEmulator('TestClient');
  });
  
  afterEach(async () => {
    client.disconnect();
    await server.stopServer();
  });
  
  test('should persist session between server restarts', async () => {
    // 1. Start server and create session
    await server.startServer();
    await client.connect(server.getServerUrl());
    
    // Join session with correct passphrase
    const joinResult = await client.joinSessionWithResult(sessionId, correctPassphrase);
    expect(joinResult.success).toBe(true);
    
    // Disconnect client
    client.disconnect();
    
    // 2. Stop server
    await server.stopServer();
    
    // 3. Start server again
    await server.startServer();
    await client.connect(server.getServerUrl());
    
    // 4. Try to reconnect with wrong passphrase
    const wrongResult = await client.joinSessionWithResult(sessionId, wrongPassphrase);
    expect(wrongResult.success).toBe(false);
    expect(wrongResult.error).toContain('Invalid passphrase');
    
    // 5. Try to reconnect with correct passphrase
    const correctResult = await client.joinSessionWithResult(sessionId, correctPassphrase);
    expect(correctResult.success).toBe(true);
    
  }, 30000); // 30 second timeout
});