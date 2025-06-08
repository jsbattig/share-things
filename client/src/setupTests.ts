import 'blob-polyfill';

// Add TextEncoder and TextDecoder polyfills for Node.js environment in Jest
if (typeof global.TextEncoder === 'undefined') {
  // Use dynamic import to avoid TypeScript errors during build
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const util = require('util');
  global.TextEncoder = util.TextEncoder;
  global.TextDecoder = util.TextDecoder;
  console.log('TextEncoder and TextDecoder polyfills installed');
}

// Simple crypto.getRandomValues polyfill for testing (only needed for random number generation)
if (typeof window === 'undefined' || !window.crypto) {
  global.crypto = {
    getRandomValues: (array: Uint8Array) => {
      // Fill array with deterministic "random" values for testing
      for (let i = 0; i < array.length; i++) {
        array[i] = (i * 13 + 7) % 256; // Simple deterministic pattern
      }
      return array;
    }
  } as unknown as Crypto;
}