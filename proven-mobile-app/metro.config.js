// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add shim.js to the list of modules that get loaded before the entry file
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
};

module.exports = config;
