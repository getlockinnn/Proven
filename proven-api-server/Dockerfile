# =============================================================================
# Proven Backend - Production Dockerfile
# Multi-stage build for minimal, secure image
# =============================================================================

# =============================================================================
# Stage 1: Builder
# Install dependencies and compile TypeScript
# =============================================================================
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY prisma/ ./prisma/

# Install all dependencies (including dev for TypeScript compilation)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy TypeScript source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# TypeScript compilation does not copy JSON assets.
# Keep Solana IDL available at dist/src/idl for runtime imports from dist/src/services.
RUN mkdir -p dist/src/idl && \
    cp src/idl/proven_stake.json dist/src/idl/proven_stake.json

# Remove dev dependencies to slim down node_modules
RUN npm prune --omit=dev

# =============================================================================
# Stage 2: Production
# Minimal runtime image with only necessary files
# =============================================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling (graceful shutdown)
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy only necessary artifacts from builder stage
# Using --chown to set correct ownership in a single layer
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

# Switch to non-root user
USER appuser

# Expose the application port
EXPOSE 3001

# Set production environment defaults
ENV NODE_ENV=production \
    PORT=3001

# Health check for container orchestration
# Uses /health for liveness (lightweight) - ECS/EKS will use /ready for full readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e " \
    const http = require('http'); \
    const options = { \
      hostname: 'localhost', \
      port: process.env.PORT || 3001, \
      path: '/health', \
      timeout: 4000 \
    }; \
    const req = http.request(options, (res) => { \
      process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => { req.destroy(); process.exit(1); }); \
    req.end(); \
  "

# Use dumb-init as entrypoint for proper signal forwarding
# This ensures SIGTERM is properly forwarded to Node.js for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/src/index.js"]
