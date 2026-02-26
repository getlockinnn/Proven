/**
 * Polyfills/Shims for React Native
 * This file is loaded by Metro bundler before any other code
 * Required for Solana web3.js, Phantom SDK, and other crypto libraries
 */

// CRITICAL: This MUST be the first import - it polyfills crypto.getRandomValues
// which is required by tweetnacl for key generation (fixes "no PRNG" error)
import 'react-native-get-random-values';

// Buffer polyfill - required by Solana web3.js
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Export to make this a module
export { };

