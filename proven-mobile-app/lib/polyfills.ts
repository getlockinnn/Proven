/**
 * Polyfills for React Native / Expo
 * Required for Solana web3.js and other crypto libraries
 * 
 * This file must be imported at the top of the app entry point (_layout.tsx)
 * BEFORE any Solana-related imports.
 */

// CRITICAL: This MUST be the first import - it polyfills crypto.getRandomValues
// which is required by tweetnacl for key generation (fixes "no PRNG" error)
import 'react-native-get-random-values';

import { Buffer } from 'buffer';

// Make Buffer globally available
global.Buffer = global.Buffer || Buffer;

// Polyfill for TextEncoder/TextDecoder if needed
if (typeof global.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('text-encoding');
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
}
