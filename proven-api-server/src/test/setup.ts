/**
 * Jest test setup file
 * Runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/proven_test';
process.env.SOLANA_RPC_URL = process.env.TEST_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

// Set longer timeout for blockchain operations
jest.setTimeout(30000);
