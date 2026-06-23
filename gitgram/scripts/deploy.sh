#!/bin/bash

# Gitgram Production Deployment Script

set -e

echo "🚀 Starting Gitgram deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from project root${NC}"
    exit 1
fi

# Backend deployment
echo -e "${YELLOW}📦 Building backend...${NC}"
cd backend
npm install --production=false
npx prisma generate
npx prisma migrate deploy
npm run build
echo -e "${GREEN}✅ Backend built${NC}"
cd ..

# Frontend deployment
echo -e "${YELLOW}📦 Building frontend...${NC}"
cd web
npm install
npm run build
echo -e "${GREEN}✅ Frontend built${NC}"
cd ..

echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Backend: cd backend && npm start"
echo "2. Frontend: cd web && npm start"
echo "3. Or use PM2: pm2 start ecosystem.config.js"
