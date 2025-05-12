const fs = require('fs');
const path = require('path');

// Base64 encoded small PNG image (1x1 pixel)
const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Decode base64 to binary
const imageBuffer = Buffer.from(base64Image, 'base64');

// Write to file
const outputPath = path.join(__dirname, 'test-image.png');
fs.writeFileSync(outputPath, imageBuffer);

console.log(`Test image created at: ${outputPath}`);