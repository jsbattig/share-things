import { test, expect } from '@playwright/test';

test.describe('Session Management', () => {
  test('should create a new session', async ({ page }) => {
    // Navigate to the home page
    await page.goto('http://localhost:3000');
    
    // Fill in the session details
    await page.fill('input[placeholder*="session ID" i]', 'test-session');
    await page.fill('input[placeholder*="name" i]', 'Test User');
    await page.fill('input[placeholder*="passphrase" i]', 'test-passphrase');
    
    // Click the Create Session button
    await page.getByRole('button', { name: 'Create Session' }).click();
    
    // Wait for the session page to load
    await page.waitForURL('**/session/**');
    
    // Verify that we're in a session
    const sessionHeader = await page.getByText('Session:');
    expect(await sessionHeader.isVisible()).toBe(true);
    
    // Verify that the session ID is displayed
    const sessionId = await page.locator('.session-id').textContent();
    expect(sessionId).toBeTruthy();
    
    // Take a screenshot
    await page.screenshot({ path: 'test-results/session-created.png' });
  });
  
  test('should join an existing session', async ({ browser }) => {
    // Create two browser contexts for the host and joiner
    const hostContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    
    // Create pages for each context
    const hostPage = await hostContext.newPage();
    const joinerPage = await joinerContext.newPage();
    
    try {
      // Host creates a session
      await hostPage.goto('http://localhost:3000');
      
      // Generate a unique session ID
      const sessionId = `test-session-${Date.now()}`;
      const passphrase = 'test-passphrase';
      
      // Fill in the session details
      await hostPage.fill('input[placeholder*="session ID" i]', sessionId);
      await hostPage.fill('input[placeholder*="name" i]', 'Host User');
      await hostPage.fill('input[placeholder*="passphrase" i]', passphrase);
      
      // Click the Create Session button
      await hostPage.getByRole('button', { name: 'Create Session' }).click();
      
      // Wait for the session page to load
      await hostPage.waitForURL('**/session/**');
      
      // Joiner joins the session
      await joinerPage.goto('http://localhost:3000');
      
      // Fill in the session details
      await joinerPage.fill('input[placeholder*="session ID" i]', sessionId);
      await joinerPage.fill('input[placeholder*="name" i]', 'Joiner User');
      await joinerPage.fill('input[placeholder*="passphrase" i]', passphrase);
      
      // Click the Join Session button
      await joinerPage.getByRole('button', { name: 'Join Session' }).click();
      
      // Wait for the session page to load
      await joinerPage.waitForURL('**/session/**');
      
      // Verify that both users are in the session
      await hostPage.waitForSelector('.client-list .client:nth-child(2)');
      await joinerPage.waitForSelector('.client-list .client:nth-child(2)');
      
      // Verify the number of clients
      const hostClientCount = await hostPage.locator('.client-list .client').count();
      const joinerClientCount = await joinerPage.locator('.client-list .client').count();
      
      expect(hostClientCount).toBe(2);
      expect(joinerClientCount).toBe(2);
      
      // Take screenshots
      await hostPage.screenshot({ path: 'test-results/host-session.png' });
      await joinerPage.screenshot({ path: 'test-results/joiner-session.png' });
    } finally {
      // Close all pages and contexts
      await hostPage.close();
      await joinerPage.close();
      await hostContext.close();
      await joinerContext.close();
    }
  });
});