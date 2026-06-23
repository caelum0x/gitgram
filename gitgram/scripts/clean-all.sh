#!/bin/bash

# Gitgram - Clean All Build Artifacts and Dependencies
# This script removes node_modules, build artifacts, and cache files

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🧹 Cleaning Gitgram project...${NC}"
echo ""

# Clean backend
echo -e "${BLUE}Cleaning backend...${NC}"
cd backend
rm -rf node_modules dist .env.local
cd ..

# Clean mobile
echo -e "${BLUE}Cleaning mobile...${NC}"
cd mobile
rm -rf node_modules .expo .expo-shared
cd ..

# Clean web
echo -e "${BLUE}Cleaning web...${NC}"
cd web
rm -rf node_modules .next .env.local
cd ..

# Clean root
echo -e "${BLUE}Cleaning root...${NC}"
rm -rf node_modules

echo ""
echo -e "${GREEN}✅ Clean complete!${NC}"
echo ""
echo "Run 'npm run install:all' to reinstall dependencies"

