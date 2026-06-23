#!/bin/bash

# Gitgram - Production Server Launcher
# Starts backend and web production servers

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Gitgram Production Servers...${NC}"
echo ""

# Check if projects are built
if [ ! -d "backend/dist" ]; then
    echo -e "${YELLOW}⚠️  Backend not built. Building now...${NC}"
    npm run build:backend
fi

if [ ! -d "web/.next" ]; then
    echo -e "${YELLOW}⚠️  Web not built. Building now...${NC}"
    npm run build:web
fi

# Check if npm-run-all is installed
if ! npm list npm-run-all > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  npm-run-all not found. Installing...${NC}"
    npm install --save-dev npm-run-all
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping all servers...${NC}"
    kill 0
    exit
}

trap cleanup SIGINT SIGTERM

# Display server information
echo -e "${GREEN}Starting production servers:${NC}"
echo "  📡 Backend API: http://localhost:3000"
echo "  🌐 Web App: http://localhost:3001"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Start servers
npm run start

