const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const dist = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.join(root, 'client', 'dist');

module.exports = {
  root,
  uploads: path.join(root, 'uploads'),
  clientPath: path.join(root, 'client'),
  dist,
  publicPath: path.join(root, 'client', 'public'),
  fonts: path.join(root, 'client', 'public', 'fonts'),
  assets: path.join(root, 'client', 'public', 'assets'),
  imageOutput: path.join(root, 'client', 'public', 'images'),
  structuredTools: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'structured'),
  pluginManifest: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'manifest.json'),
};
