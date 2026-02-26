import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from project root so it works after compilation
const envPath = process.env.ENV_FILE || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const nodeEnv = process.env.NODE_ENV || 'development';

type ChallengeDayMode = 'CENTRAL_IST' | 'CLIENT_TZ';

const parseChallengeDayMode = (value: string | undefined): ChallengeDayMode => {
  if (value === 'CLIENT_TZ') return 'CLIENT_TZ';
  return 'CENTRAL_IST';
};

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SOLANA_RPC_URL',
  'NETWORK',
  'PROGRAM_ID',
  'USDC_MINT',
];

if (nodeEnv === 'production') {
  requiredEnvVars.push('CORS_ORIGINS');
  requiredEnvVars.push('ESCROW_ENCRYPTION_KEY');
}

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  
  // Database
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
  },
  
  // JWT (CRITICAL: JWT_SECRET must be set!)
  jwt: {
    secret: (() => {
      const jwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
      if (!jwtSecret) {
        throw new Error(
          'JWT_SECRET (or SUPABASE_JWT_SECRET) environment variable is required! ' +
          'Generate a secure key with: openssl rand -base64 32'
        );
      }
      return jwtSecret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // OAuth
  oauth: {
    google: {
      clientId: process.env.google_client_id,
      secret: process.env.google_secret,
    },
  },
  
  // Solana
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL!,
    network: process.env.NETWORK!,
    escrowPubkey: process.env.ESCROW_PUBKEY,
    programId: process.env.PROGRAM_ID!,
    usdcMint: process.env.USDC_MINT!,
    // Oracle keypair for on-chain operations
    oracleKeypairPath: process.env.ORACLE_KEYPAIR_PATH,
    oracleKeypairJson: process.env.ORACLE_KEYPAIR_JSON,
    // Treasury address for forfeited stakes
    treasuryAddress: process.env.TREASURY_ADDRESS,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  },
  
  // Rate limiting
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (process.env.NODE_ENV === 'production' ? '1000' : '100')),
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  
  // Security
  security: {
    corsOrigins: nodeEnv === 'production' 
      ? (process.env.CORS_ORIGINS?.split(',') || [])
      : ['http://localhost:3000', 'http://localhost:3001'],
  },

  // Challenge day boundary (canonical by default)
  challengeDay: {
    mode: parseChallengeDayMode(process.env.CHALLENGE_DAY_MODE),
    timezone: process.env.CHALLENGE_TIMEZONE || 'Asia/Kolkata',
  },
}; 
