// Custom transformer to handle ES modules
const path = require('path');

module.exports = {
  process(src, filePath) {
    // Handle TypeScript files
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      let code = src;
      // Replace import.meta.url with a CommonJS equivalent
      code = code.replace(/import\.meta\.url/g, `'file://' + __filename`);
      return {
        code,
        map: null,
      };
    }
    // For other files, return as is
    return src;
  },
};
