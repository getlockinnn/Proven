import winston from 'winston';
import crypto from 'crypto';
import { config } from '../config';
import { Request, Response, NextFunction } from 'express';

// =============================================================================
// Log Formats
// =============================================================================

// Structured JSON format for production (CloudWatch compatible)
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Human-readable format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqIdStr = typeof requestId === 'string' ? `[${requestId.slice(0, 8)}]` : '';
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} ${reqIdStr} [${level}]: ${message}${metaStr}`;
  })
);

// =============================================================================
// Logger Instance
// =============================================================================

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'proven-backend',
    environment: config.nodeEnv,
  },
  transports: [
    new winston.transports.Console({
      format: config.isDevelopment ? consoleFormat : logFormat,
    }),
  ],
});

// =============================================================================
// Request ID Management
// =============================================================================

// Standard request ID header (used by AWS ALB, API Gateway, etc.)
const REQUEST_ID_HEADER = 'x-request-id';
// Alternative headers that might contain request IDs
const ALT_REQUEST_ID_HEADERS = ['x-amzn-trace-id', 'x-correlation-id'];

/**
 * Extended Request interface with request ID
 */
export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Generate a new request ID
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Extract request ID from headers or generate a new one
 */
function getOrCreateRequestId(req: Request): string {
  // Check primary header
  const primaryId = req.headers[REQUEST_ID_HEADER];
  if (typeof primaryId === 'string' && primaryId.length > 0) {
    return primaryId;
  }

  // Check alternative headers
  for (const header of ALT_REQUEST_ID_HEADERS) {
    const altId = req.headers[header];
    if (typeof altId === 'string' && altId.length > 0) {
      // For AWS trace IDs, extract the root segment
      if (header === 'x-amzn-trace-id') {
        const match = altId.match(/Root=([^;]+)/);
        if (match) return match[1];
      }
      return altId;
    }
  }

  // Generate new ID if none found
  return generateRequestId();
}

// =============================================================================
// Request Logging Middleware
// =============================================================================

/**
 * Request logging middleware with request ID tracking
 *
 * - Assigns or propagates request ID for distributed tracing
 * - Logs request completion with timing information
 * - Adds request ID to response headers for client correlation
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Get or create request ID
  const requestId = getOrCreateRequestId(req);

  // Attach to request object for use in handlers
  (req as RequestWithId).requestId = requestId;

  // Add to response headers for client correlation
  res.setHeader(REQUEST_ID_HEADER, requestId);

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' :
                     res.statusCode >= 400 ? 'warn' : 'debug';

    logger.log(logLevel, 'HTTP Request', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      durationMs: duration,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      contentLength: res.get('content-length'),
      // Include user ID if authenticated (useful for debugging)
      userId: (req as any).user?.id,
    });
  });

  next();
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a child logger with request context
 * Use this in route handlers for consistent request ID logging
 *
 * @example
 * ```typescript
 * app.get('/api/users', (req, res) => {
 *   const log = getRequestLogger(req);
 *   log.info('Fetching users');
 *   // ... handler logic
 * });
 * ```
 */
export const getRequestLogger = (req: Request): winston.Logger => {
  const requestId = (req as RequestWithId).requestId || 'unknown';
  const userId = (req as any).user?.id;

  return logger.child({
    requestId,
    ...(userId && { userId }),
  });
};

/**
 * Log with request context from within a handler
 * Convenience function when you don't need the full child logger
 *
 * @example
 * ```typescript
 * logWithRequest(req, 'info', 'Processing payment', { amount: 100 });
 * ```
 */
export const logWithRequest = (
  req: Request,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  meta?: Record<string, any>
): void => {
  const requestId = (req as RequestWithId).requestId || 'unknown';
  const userId = (req as any).user?.id;

  logger.log(level, message, {
    requestId,
    ...(userId && { userId }),
    ...meta,
  });
};

/**
 * Create a logger for background jobs/services (no request context)
 *
 * @example
 * ```typescript
 * const jobLogger = createServiceLogger('notification-scheduler');
 * jobLogger.info('Processing daily reminders');
 * ```
 */
export const createServiceLogger = (serviceName: string): winston.Logger => {
  return logger.child({
    service: serviceName,
  });
};
