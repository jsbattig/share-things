const { transformSync } = require('@babel/core');
const path = require('path');

module.exports = {
  process(src, filename, config, options) {
    // Only process TypeScript files
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
      // Transform the source code using Babel
      const result = transformSync(src, {
        filename,
        presets: [
          ['@babel/preset-typescript', { allowDeclareFields: true }],
          ['@babel/preset-env', { targets: { node: 'current' } }],
        ],
        plugins: [
          // Replace import.meta.url with a CommonJS equivalent
          function replaceImportMeta() {
            return {
              visitor: {
                MetaProperty(path) {
                  if (path.get('meta').isIdentifier({ name: 'import' }) && 
                      path.get('property').isIdentifier({ name: 'meta' })) {
                    path.replaceWithSourceString('({ url: `file://${__filename}` })');
                  }
                },
              },
            };
          },
        ],
      });

      if (result && result.code) {
        return result.code;
      }
    }
    
    // For non-TypeScript files, return the source as is
    return src;
  },
};
