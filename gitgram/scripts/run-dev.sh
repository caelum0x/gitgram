#!/bin/bash

# Gitgram - Run Development Servers
# This script runs all development servers concurrently

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Gitgram development servers...${NC}"
echo ""

# Check if npm-run-all is installed
if ! command -v npm-run-all &> /dev/null; then
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

# Start all servers
echo -e "${GREEN}Starting servers:${NC}"
echo "  - Backend: http://localhost:3000"
echo "  - Web: http://localhost:3001"
echo "  - Mobile: Expo DevTools"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

npm run dev:all

