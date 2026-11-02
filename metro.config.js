// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Data packs ship dem.bin (Int16 terrain grid) as a bundled asset.
config.resolver.assetExts.push('bin');

module.exports = config;
