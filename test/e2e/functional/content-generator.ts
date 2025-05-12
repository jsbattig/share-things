/**
 * Generates test content for functional tests
 */
export class ContentGenerator {
  /**
   * Generates random text of specified size
   * @param size Size in characters
   * @returns Random text
   */
  static generateText(size: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
    let result = '';
    for (let i = 0; i < size; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generates a test image
   * @param width Image width
   * @param height Image height
   * @returns Image blob
   */
  static async generateImage(width: number, height: number): Promise<Blob> {
    // In a browser environment, we would use canvas
    // For our tests, we'll create a simple blob
    const imageData = new Uint8Array(width * height * 4); // RGBA
    
    // Fill with random colors
    for (let i = 0; i < imageData.length; i += 4) {
      imageData[i] = Math.floor(Math.random() * 256); // R
      imageData[i + 1] = Math.floor(Math.random() * 256); // G
      imageData[i + 2] = Math.floor(Math.random() * 256); // B
      imageData[i + 3] = 255; // A (fully opaque)
    }
    
    return new Blob([imageData], { type: 'image/png' });
  }

  /**
   * Generates a test file
   * @param size File size in bytes
   * @param name File name
   * @returns File object
   */
  static generateFile(size: number, name: string): File {
    // Generate random content
    const content = this.generateText(size);
    const blob = new Blob([content], { type: 'text/plain' });
    
    // Create file
    return new File([blob], name, { type: 'text/plain' });
  }

  /**
   * Generates a large test file
   * @param size File size in bytes
   * @param name File name
   * @returns File object
   */
  static generateLargeFile(size: number, name: string): File {
    // For large files, we'll use a more efficient approach
    // Create a buffer with repeating pattern
    const chunkSize = 1024; // 1KB chunks
    const chunk = this.generateText(chunkSize);
    
    const parts: string[] = [];
    const numChunks = Math.ceil(size / chunkSize);
    
    for (let i = 0; i < numChunks; i++) {
      parts.push(chunk);
    }
    
    // Truncate to exact size
    const content = parts.join('').substring(0, size);
    const blob = new Blob([content], { type: 'application/octet-stream' });
    
    // Create file
    return new File([blob], name, { type: 'application/octet-stream' });
  }
}