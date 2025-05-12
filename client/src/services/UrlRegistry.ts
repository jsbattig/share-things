/**
 * Service for managing URL objects created with URL.createObjectURL()
 * This helps prevent memory leaks by ensuring all URLs are properly revoked
 */
export class UrlRegistry {
  private urls: Map<string, string[]> = new Map();
  
  /**
   * Create and register a URL
   * @param contentId Content ID
   * @param blob Blob to create URL for
   * @returns Created URL
   */
  createUrl(contentId: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    
    if (!this.urls.has(contentId)) {
      this.urls.set(contentId, []);
    }
    
    this.urls.get(contentId)!.push(url);
    console.log(`[UrlRegistry] Created URL for content ${contentId}: ${url}`);
    return url;
  }
  
  /**
   * Revoke all URLs for a content
   * @param contentId Content ID
   * @param preserveLatest Whether to preserve the latest URL (useful for image display)
   */
  revokeAllUrls(contentId: string, preserveLatest: boolean = false): void {
    const urls = this.urls.get(contentId);
    if (urls) {
      console.log(`[UrlRegistry] Revoking ${preserveLatest ? 'all but latest of ' : ''}${urls.length} URLs for content ${contentId}`);
      
      if (preserveLatest && urls.length > 0) {
        // Keep the latest URL (last in the array) and revoke all others
        const urlsToRevoke = urls.slice(0, -1);
        const latestUrl = urls[urls.length - 1];
        
        urlsToRevoke.forEach(url => {
          URL.revokeObjectURL(url);
          console.log(`[UrlRegistry] Revoked URL: ${url}`);
        });
        
        // Update the URLs array to only contain the latest URL
        this.urls.set(contentId, [latestUrl]);
        console.log(`[UrlRegistry] Preserved latest URL for content ${contentId}: ${latestUrl}`);
      } else {
        // Revoke all URLs
        urls.forEach(url => {
          URL.revokeObjectURL(url);
          console.log(`[UrlRegistry] Revoked URL: ${url}`);
        });
        this.urls.delete(contentId);
      }
    }
  }
  
  /**
   * Revoke a specific URL
   * @param contentId Content ID
   * @param url URL to revoke
   */
  revokeUrl(contentId: string, url: string): void {
    const urls = this.urls.get(contentId);
    if (urls) {
      const index = urls.indexOf(url);
      if (index !== -1) {
        URL.revokeObjectURL(url);
        urls.splice(index, 1);
        console.log(`[UrlRegistry] Revoked URL: ${url}`);
        
        if (urls.length === 0) {
          this.urls.delete(contentId);
        }
      }
    }
  }
  
  /**
   * Clean up orphaned URLs
   * @param activeContentIds Set of active content IDs
   * @param preserveLatest Whether to preserve the latest URL for each content
   */
  cleanupOrphanedUrls(activeContentIds: Set<string>, preserveLatest: boolean = false): void {
    for (const [contentId, urls] of this.urls.entries()) {
      if (!activeContentIds.has(contentId)) {
        if (preserveLatest && urls.length > 0) {
          // Keep the latest URL and revoke all others
          const urlsToRevoke = urls.slice(0, -1);
          const latestUrl = urls[urls.length - 1];
          
          console.log(`[UrlRegistry] Cleaning up orphaned URLs for content ${contentId}, preserving latest`);
          urlsToRevoke.forEach(url => URL.revokeObjectURL(url));
          
          // Update the URLs array to only contain the latest URL
          this.urls.set(contentId, [latestUrl]);
        } else {
          console.log(`[UrlRegistry] Cleaning up all orphaned URLs for content ${contentId}`);
          urls.forEach(url => URL.revokeObjectURL(url));
          this.urls.delete(contentId);
        }
      }
    }
  }
  
  /**
   * Clean up all URLs (for component unmount or app shutdown)
   */
  revokeAllUrlsGlobally(): void {
    console.log(`[UrlRegistry] Revoking all URLs globally`);
    for (const [contentId, urls] of this.urls.entries()) {
      urls.forEach(url => URL.revokeObjectURL(url));
    }
    this.urls.clear();
  }

  /**
   * Get all URLs for a content
   * @param contentId Content ID
   * @returns Array of URLs or undefined if content not found
   */
  getUrls(contentId: string): string[] | undefined {
    return this.urls.get(contentId);
  }
  
  /**
   * Get the latest URL for a content
   * @param contentId Content ID
   * @returns Latest URL or undefined if content has no URLs
   */
  getLatestUrl(contentId: string): string | undefined {
    const urls = this.urls.get(contentId);
    if (urls && urls.length > 0) {
      return urls[urls.length - 1];
    }
    return undefined;
  }

  /**
   * Get count of registered URLs
   * @returns Total number of registered URLs
   */
  getUrlCount(): number {
    let count = 0;
    for (const urls of this.urls.values()) {
      count += urls.length;
    }
    return count;
  }
}

// Create a singleton instance
export const urlRegistry = new UrlRegistry();