import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { logger, requestLogger } from './lib/logger';
import routes from './routes';
import prisma from './lib/prisma';
import { globalLimiter } from './middleware/rateLimiters';
import { corsOptions } from './middleware/corsOptions';
import { solanaProgram } from './services/solanaProgram';
import { initializeScheduler } from './services/notificationScheduler';
import { startPayoutWorker } from './services/payoutWorker';
import { startDailySettlementCron } from './services/dailySettlement';

// Create Express app
const app = express();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// CORS configuration - MUST be before other middleware
app.use(cors(corsOptions));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.isDevelopment ? false : undefined,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Compression middleware
app.use(compression());

// Rate limiting (apply to API routes only)
app.use('/api', globalLimiter);

// Request parsing
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Request logging
app.use(requestLogger);

// Health check endpoint (for load balancers - lightweight)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness check endpoint (for container orchestration - checks dependencies)
app.get('/ready', async (req, res) => {
  const checks: Record<string, { status: string; latency?: number }> = {};
  let isReady = true;

  // Check database connection
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error) {
    checks.database = { status: 'error' };
    isReady = false;
    logger.error('Readiness check: database failed', error);
  }

  // Check Solana connection (non-blocking)
  try {
    const solanaStart = Date.now();
    const blockHeight = await solanaProgram.getConnection().getBlockHeight();
    checks.solana = { status: blockHeight > 0 ? 'ok' : 'degraded', latency: Date.now() - solanaStart };
  } catch (error) {
    checks.solana = { status: 'degraded' }; // Non-critical, don't fail readiness
    logger.warn('Readiness check: Solana RPC degraded', error);
  }

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: process.env.npm_package_version || '1.0.0',
    checks,
  });
});

// Base route
app.get('/', (req, res) => {
  res.json({ message: 'welcome to the Proven API' });
});

// OAuth callback route - handles Supabase OAuth callback for both mobile and web clients
// Mobile: deep links back to the app via provenapp:// scheme
// Web (guardian): redirects back to the web app with tokens in the hash fragment
app.get('/auth/callback', (req, res) => {
  // Allowed web origins that can use return_to (prevents open redirect attacks)
  const allowedWebOrigins = config.isDevelopment
    ? ['http://localhost:8080', 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:8080']
    : (process.env.CORS_ORIGINS?.split(',') || [])
        .map((s) => s.trim())
        .filter(Boolean);

  // Check if this is a web client redirect (guardian passes return_to param)
  const returnTo = req.query.return_to as string | undefined;
  let validReturnTo: string | null = null;

  if (returnTo) {
    try {
      const returnUrl = new URL(returnTo);
      const returnOrigin = returnUrl.origin;
      if (allowedWebOrigins.includes(returnOrigin)) {
        validReturnTo = returnOrigin; // Use just the origin for safety
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Redirecting...</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #0a0a0a;
      color: #ffffff;
    }
    .container { text-align: center; }
    .spinner {
      border: 3px solid #333;
      border-top: 3px solid #22c55e;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Signing you in...</p>
    <p id="status" style="font-size: 12px; color: #888;"></p>
  </div>
  <script>
    // Server-validated return URL for web clients (null for mobile)
    const webReturnTo = ${validReturnTo ? `'${validReturnTo}'` : 'null'};

    // Get the hash fragment (contains the tokens)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(window.location.search);

    if (webReturnTo) {
      // Web client (guardian) - redirect back to the web app with tokens
      let redirectUrl = webReturnTo;
      if (hash) {
        redirectUrl += '#' + hash;
      } else if (params.has('code')) {
        redirectUrl += '?code=' + params.get('code');
      } else if (params.has('error')) {
        redirectUrl += '?error=' + params.get('error') + '&error_description=' + params.get('error_description');
      }
      document.getElementById('status').textContent = 'Redirecting to dashboard...';
      window.location.replace(redirectUrl);
    } else {
      // Mobile client - deep link to the app
      let deepLink = 'provenapp://auth/callback';
      if (hash) {
        deepLink += '#' + hash;
        document.getElementById('status').textContent = 'Redirecting to app...';
      } else if (params.has('code')) {
        deepLink += '?code=' + params.get('code');
        document.getElementById('status').textContent = 'Redirecting to app...';
      } else if (params.has('error')) {
        deepLink += '?error=' + params.get('error');
        document.getElementById('status').textContent = 'Error: ' + params.get('error_description');
      }
      window.location.href = deepLink;

      // Fallback: show a link if redirect doesn't work after 3 seconds
      setTimeout(() => {
        document.querySelector('.container').innerHTML =
          '<p>If the app didn\\'t open, <a href="' + deepLink + '" style="color: #22c55e;">tap here</a></p>';
      }, 3000);
    }
  </script>
</body>
</html>
  `);
});


// API routes
app.use('/api', routes);

// Global error handler
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
  });

  // Determine user-friendly message based on error type
  let userMessage = "Something went wrong on our end. Please try again, and if the problem continues, contact support.";
  let statusCode = error.status || 500;
  let errorCode = 'INTERNAL_ERROR';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    userMessage = "The information you provided isn't quite right. Please check and try again.";
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (error.name === 'UnauthorizedError' || error.status === 401) {
    userMessage = "Your session has expired. Please sign in again.";
    statusCode = 401;
    errorCode = 'SESSION_EXPIRED';
  } else if (error.status === 403) {
    userMessage = "You don't have permission to perform this action.";
    errorCode = 'FORBIDDEN';
  }

  res.status(statusCode).json({
    success: false,
    message: userMessage,
    code: errorCode,
    ...(config.isDevelopment && {
      debug: {
        originalMessage: error.message,
        stack: error.stack,
      },
    }),
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: "The page you're looking for doesn't exist. Please check the URL or go back to the home page.",
    code: 'NOT_FOUND',
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Close database connections
  await prisma.$disconnect();

  // Close server
  process.exit(0);
};

// Initialize Solana program service
solanaProgram.initialize().then(() => {
  const oracleKey = solanaProgram.getOraclePublicKey();
  if (oracleKey) {
    logger.info(`Solana program initialized with oracle: ${oracleKey.toBase58()}`);
  } else {
    logger.warn('Solana program initialized without oracle keypair (on-chain operations disabled)');
  }
}).catch((error) => {
  logger.error('Failed to initialize Solana program service', error);
});

// Initialize notification scheduler
initializeScheduler();

// Initialize payout worker and daily settlement cron
startPayoutWorker();
startDailySettlementCron();

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', reason);
  gracefulShutdown('unhandledRejection');
});

export default app;
