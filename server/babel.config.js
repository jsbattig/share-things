module.exports = (api) => {
  // Cache the configuration
  api.cache.using(() => process.env.NODE_ENV);

  const presets = [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
        modules: 'commonjs',
      },
    ],
    [
      '@babel/preset-typescript',
      {
        allowDeclareFields: true,
      },
    ],
  ];

  const plugins = [
    // Add any necessary plugins here
  ];

  return {
    presets,
    plugins,
  };
};
