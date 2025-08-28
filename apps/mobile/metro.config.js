const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

module.exports = (() => {
  const config = getDefaultConfig(projectRoot);

  // Allow Metro to watch the monorepo
  config.watchFolders = [workspaceRoot];

  // Ensure node_modules resolution from the workspace root
  config.resolver = config.resolver || {};
  config.resolver.nodeModulesPaths = [
    path.resolve(workspaceRoot, 'node_modules'),
    path.resolve(projectRoot, 'node_modules')
  ];

  return config;
})();