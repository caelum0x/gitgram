#!/bin/bash

# Gitgram - Fix Backend TypeScript Type Definitions
# Installs all missing @types packages for the backend

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔧 Installing missing TypeScript type definitions for backend...${NC}"
echo ""

cd backend

# Install all missing type definitions
echo -e "${YELLOW}Installing type definitions...${NC}"
npm install --save-dev --legacy-peer-deps \
  @types/compression \
  @types/cookie-parser \
  @types/csurf \
  @types/helmet \
  @types/speakeasy

echo ""
echo -e "${GREEN}✅ Type definitions installed!${NC}"
echo ""
echo "Note: Some files use require() instead of import. Consider converting them to ES6 imports for better TypeScript support."

cd ..

