const fs = require('fs');
const path = require('path');

// Size in bytes (10MB)
const fileSize = 10 * 1024 * 1024;

// Create a buffer with random data
const buffer = Buffer.alloc(fileSize);
for (let i = 0; i < fileSize; i++) {
  buffer[i] = Math.floor(Math.random() * 256);
}

// Write to file
const outputPath = path.join(__dirname, 'large-file.bin');
fs.writeFileSync(outputPath, buffer);

console.log(`Large test file created at: ${outputPath}`);
console.log(`File size: ${fileSize / (1024 * 1024)} MB`);