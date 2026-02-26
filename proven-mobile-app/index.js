/**
 * Custom entry point for Expo Router
 * Loads polyfills before any other code
 */

// Load shim FIRST - this sets up Buffer and other polyfills
import './shim';

// Then load the standard expo-router entry
import 'expo-router/entry';
