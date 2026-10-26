const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WebAssembly build
config.resolver.assetExts.push('wasm');

// ...and its worker needs cross-origin isolation (SharedArrayBuffer)
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // The dev server gzips responses on the fly, which takes ~50 s for the 13 MB development
  // bundle (versus <1 s uncompressed), leaving the web app blank while it waits. Bundles
  // come from this computer or the LAN, so serve them uncompressed.
  if (req.url && req.url.includes('.bundle')) delete req.headers['accept-encoding'];
  middleware(req, res, next);
};

module.exports = withNativeWind(config, { input: './src/global.css' });
