import { test, expect } from '@playwright/test';

test.describe('Basic Functionality', () => {
  test('should load the home page', async ({ page }) => {
    // Navigate to the home page
    await page.goto('http://localhost:3000');
    
    // Verify the page title
    const title = await page.title();
    console.log(`Page title: ${title}`);
    expect(title).toBe('ShareThings');
    
    // Verify that the page has loaded
    await page.waitForSelector('body');
    
    // Take a screenshot
    await page.screenshot({ path: 'test-results/home-page.png' });
    
    // Verify specific elements on the page
    const createSessionButton = await page.getByRole('button', { name: 'Create Session' });
    expect(await createSessionButton.isVisible()).toBe(true);
    
    const joinSessionButton = await page.getByRole('button', { name: 'Join Session' });
    expect(await joinSessionButton.isVisible()).toBe(true);
    
    // Use more specific selectors for inputs
    const sessionIdInput = await page.getByPlaceholder('Enter session ID');
    expect(await sessionIdInput.isVisible()).toBe(true);
    
    // Check for passphrase input using placeholder or other attributes
    const passphraseInput = await page.locator('input[placeholder*="passphrase" i]');
    expect(await passphraseInput.isVisible()).toBe(true);
  });
});