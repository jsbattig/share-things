import { TestOrchestrator } from './test-orchestrator';
import { ClientEmulator } from './client-emulator';
import { ServerController } from './server-controller';
import { createCanvas } from 'canvas';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

describe('Image Session Reload Test', () => {
  let orchestrator: TestOrchestrator;
  let client1: ClientEmulator;
  let server: ServerController;
  let originalImageData: Buffer;
  let originalImageMetadata: any;
  let sessionId: string;
  let clientName: string;
  let passphrase: string;

  beforeAll(async () => {
    // Initialize test environment
    orchestrator = new TestOrchestrator();
    await orchestrator.setup();
    
    server = orchestrator.getServer();
    client1 = orchestrator.getClient1();
    
    // Test parameters
    sessionId = 'test-image-session';
    clientName = 'ImageTestClient';
    passphrase = 'test-passphrase-123';
    
    console.log('=== Image Session Reload Test Setup Complete ===');
  });

  afterAll(async () => {
    await orchestrator.cleanup();
  });

  /**
   * Generate a test image using Canvas
   */
  function generateTestImage(): { buffer: Buffer; metadata: any } {
    console.log('[Test] Generating test image...');
    
    // Create a 200x150 canvas with a simple pattern
    const canvas = createCanvas(200, 150);
    const ctx = canvas.getContext('2d');
    
    // Create a gradient background
    const gradient = ctx.createLinearGradient(0, 0, 200, 150);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(0.5, '#4ECDC4');
    gradient.addColorStop(1, '#45B7D1');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 200, 150);
    
    // Add some text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Test Image', 100, 75);
    ctx.fillText(new Date().toISOString(), 100, 95);
    
    // Add a unique identifier
    const uniqueId = crypto.randomBytes(4).toString('hex');
    ctx.fillText(`ID: ${uniqueId}`, 100, 115);
    
    // Convert to PNG buffer
    const buffer = canvas.toBuffer('image/png');
    
    const metadata = {
      width: 200,
      height: 150,
      format: 'png',
      mimeType: 'image/png',
      size: buffer.length,
      uniqueId: uniqueId
    };
    
    console.log(`[Test] Generated test image: ${buffer.length} bytes, ID: ${uniqueId}`);
    return { buffer, metadata };
  }

  /**
   * Convert buffer to base64 data URL for sharing
   */
  function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Extract buffer from data URL
   */
  function dataUrlToBuffer(dataUrl: string): Buffer {
    const base64Data = dataUrl.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  }

  /**
   * Compare two image buffers
   */
  function compareImageBuffers(buffer1: Buffer, buffer2: Buffer): boolean {
    if (buffer1.length !== buffer2.length) {
      console.log(`[Test] Buffer length mismatch: ${buffer1.length} vs ${buffer2.length}`);
      return false;
    }
    
    return buffer1.equals(buffer2);
  }

  it('should share image, reload session, and retrieve identical image', async () => {
    console.log('\n=== Starting Image Session Reload Test ===');
    
    // Step 1: Generate test image
    const { buffer, metadata } = generateTestImage();
    originalImageData = buffer;
    originalImageMetadata = metadata;
    
    console.log(`[Test] Original image: ${buffer.length} bytes, ${metadata.width}x${metadata.height}`);
    
    // Step 2: Client joins session
    console.log('[Test] Step 2: Client joining session...');
    const joinResult = await client1.joinSession(sessionId, clientName, passphrase);
    expect(joinResult.success).toBe(true);
    console.log('[Test] Client joined session successfully');
    
    // Step 3: Share the image
    console.log('[Test] Step 3: Sharing image...');
    const dataUrl = bufferToDataUrl(buffer, metadata.mimeType);
    
    const shareResult = await client1.shareContent({
      contentType: 'image',
      mimeType: metadata.mimeType,
      data: dataUrl,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size
      }
    });
    
    expect(shareResult.success).toBe(true);
    console.log('[Test] Image shared successfully');
    
    // Step 4: Wait for content to be processed
    console.log('[Test] Step 4: Waiting for content processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 5: Verify content was stored on server
    console.log('[Test] Step 5: Verifying server storage...');
    const serverContent = await server.getStoredContent(sessionId);
    expect(serverContent.length).toBeGreaterThan(0);
    
    const imageContent = serverContent.find(content => 
      content.contentType === 'image' || 
      content.additionalMetadata?.includes('image')
    );
    expect(imageContent).toBeDefined();
    console.log(`[Test] Found stored image content: ${imageContent?.contentId}`);
    
    // Step 6: Client leaves session
    console.log('[Test] Step 6: Client leaving session...');
    await client1.leaveSession(sessionId);
    console.log('[Test] Client left session');
    
    // Step 7: Wait a moment to ensure disconnection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 8: Client rejoins session
    console.log('[Test] Step 8: Client rejoining session...');
    const rejoinResult = await client1.joinSession(sessionId, clientName, passphrase);
    expect(rejoinResult.success).toBe(true);
    console.log('[Test] Client rejoined session successfully');
    
    // Step 9: Wait for content to be loaded from server
    console.log('[Test] Step 9: Waiting for content reload...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 10: Retrieve the reloaded content
    console.log('[Test] Step 10: Retrieving reloaded content...');
    const reloadedContent = await client1.getContent();
    expect(reloadedContent.length).toBeGreaterThan(0);
    
    const reloadedImage = reloadedContent.find(content => 
      content.contentType === 'image' ||
      content.metadata?.mimeType?.startsWith('image/')
    );
    expect(reloadedImage).toBeDefined();
    console.log(`[Test] Found reloaded image: ${reloadedImage?.contentId}`);
    
    // Step 11: Verify image data integrity
    console.log('[Test] Step 11: Verifying image data integrity...');
    
    // Check metadata
    expect(reloadedImage?.metadata?.mimeType).toBe(originalImageMetadata.mimeType);
    expect(reloadedImage?.metadata?.imageInfo?.width).toBe(originalImageMetadata.width);
    expect(reloadedImage?.metadata?.imageInfo?.height).toBe(originalImageMetadata.height);
    expect(reloadedImage?.metadata?.imageInfo?.format).toBe(originalImageMetadata.format);
    
    // Check data integrity
    expect(reloadedImage?.data).toBeDefined();
    expect(reloadedImage?.data).toBeInstanceOf(Blob);
    
    // Convert blob back to buffer for comparison
    const reloadedBlob = reloadedImage!.data as Blob;
    expect(reloadedBlob.type).toBe(originalImageMetadata.mimeType);
    expect(reloadedBlob.size).toBe(originalImageData.length);
    
    // Read blob data
    const reloadedArrayBuffer = await reloadedBlob.arrayBuffer();
    const reloadedBuffer = Buffer.from(reloadedArrayBuffer);
    
    // Compare with original
    const isIdentical = compareImageBuffers(originalImageData, reloadedBuffer);
    expect(isIdentical).toBe(true);
    
    console.log('[Test] ✅ Image data integrity verified - images are identical!');
    
    // Step 12: Verify image can be rendered
    console.log('[Test] Step 12: Verifying image renderability...');
    
    // Create object URL to verify blob is valid
    const objectUrl = URL.createObjectURL(reloadedBlob);
    expect(objectUrl).toMatch(/^blob:/);
    
    // Clean up
    URL.revokeObjectURL(objectUrl);
    
    console.log('[Test] ✅ Image renderability verified!');
    
    console.log('\n=== Image Session Reload Test PASSED ===');
  }, 30000); // 30 second timeout

  it('should handle multiple image formats', async () => {
    console.log('\n=== Testing Multiple Image Formats ===');
    
    // Test JPEG format
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, 100, 100);
    
    const jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
    const jpegDataUrl = bufferToDataUrl(jpegBuffer, 'image/jpeg');
    
    // Join session
    await client1.joinSession(sessionId + '-jpeg', clientName, passphrase);
    
    // Share JPEG
    const jpegResult = await client1.shareContent({
      contentType: 'image',
      mimeType: 'image/jpeg',
      data: jpegDataUrl,
      metadata: {
        width: 100,
        height: 100,
        format: 'jpeg',
        size: jpegBuffer.length
      }
    });
    
    expect(jpegResult.success).toBe(true);
    
    // Wait and verify
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const content = await client1.getContent();
    const jpegContent = content.find(c => c.metadata?.mimeType === 'image/jpeg');
    expect(jpegContent).toBeDefined();
    
    console.log('[Test] ✅ JPEG format test passed!');
  }, 15000);
});