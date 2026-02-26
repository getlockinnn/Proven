#!/bin/bash
# =============================================================================
# Simple Deploy Script for Proven Backend
# Run on EC2: ./deploy.sh
# =============================================================================

set -e

APP_DIR="/opt/proven-backend"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Deploying Proven Backend..."

cd $APP_DIR

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Build and restart
echo "🔨 Building and restarting containers..."
docker-compose -f $COMPOSE_FILE build --no-cache
docker-compose -f $COMPOSE_FILE down
docker-compose -f $COMPOSE_FILE up -d

# Run migrations
echo "📊 Running database migrations..."
docker-compose -f $COMPOSE_FILE exec -T app npx prisma migrate deploy

# Health check
echo "🏥 Checking health..."
sleep 10
if curl -sf http://localhost:3001/health > /dev/null; then
    echo "✅ Deployment successful! Backend is healthy."
else
    echo "❌ Health check failed!"
    docker-compose -f $COMPOSE_FILE logs --tail=50 app
    exit 1
fi

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo ""
echo "✅ Deployment complete!"
echo "   Health: http://localhost:3001/health"
echo "   Ready:  http://localhost:3001/ready"
