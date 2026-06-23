#!/bin/bash

# Gitgram - Install All Dependencies
# This script installs dependencies for backend, mobile, and web

set -e

echo "🚀 Installing Gitgram dependencies..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Install root dependencies
echo -e "${BLUE}📦 Installing root dependencies...${NC}"
npm install

# Install backend dependencies
echo -e "${BLUE}📦 Installing backend dependencies...${NC}"
cd backend
npm install --legacy-peer-deps
cd ..

# Install mobile dependencies
echo -e "${BLUE}📦 Installing mobile dependencies...${NC}"
cd mobile
npm install --legacy-peer-deps
cd ..

# Install web dependencies
echo -e "${BLUE}📦 Installing web dependencies...${NC}"
cd web
npm install --legacy-peer-deps
cd ..

echo ""
echo -e "${GREEN}✅ All dependencies installed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  - Run 'npm run dev' to start backend and web"
echo "  - Run 'npm run dev:mobile' to start mobile app"
echo "  - Run 'npm run dev:all' to start everything"

