#!/bin/bash

# Gitgram - Development Server Launcher (All Projects)
# Starts backend, web, and mobile development servers

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting All Gitgram Development Servers...${NC}"
echo ""

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
echo -e "${GREEN}Starting servers:${NC}"
echo "  📡 Backend API: http://localhost:3000"
echo "  🌐 Web App: http://localhost:3001"
echo "  📱 Mobile: Expo DevTools (check terminal)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Start all servers
npm run dev:all

