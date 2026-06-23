#!/bin/bash

echo "🚀 Gitgram One-Click Deploy"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}\n"

# Step 1: Install dependencies
echo -e "${BLUE}Step 1: Installing dependencies...${NC}"
npm run install:all
echo -e "${GREEN}✅ Dependencies installed${NC}\n"

# Step 2: Database setup
echo -e "${BLUE}Step 2: Database setup${NC}"
cd backend

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
    echo "Creating from template..."
    cp .env.example .env 2>/dev/null || echo "DATABASE_URL=postgresql://user:pass@localhost:5432/gitgram" > .env
    echo -e "${YELLOW}⚠️  Please edit backend/.env with your database URL${NC}"
    read -p "Press Enter when ready..."
fi

echo "Running migrations..."
npx prisma generate
npx prisma migrate deploy
echo -e "${GREEN}✅ Database ready${NC}\n"

cd ..

# Step 3: Seed content
echo -e "${BLUE}Step 3: Seed content${NC}"
echo "This will add popular repos to your feed"
read -p "Seed content? (y/n): " seed_choice

if [ "$seed_choice" = "y" ]; then
    cd backend
    npx ts-node src/scripts/quickSeed.ts
    cd ..
    echo -e "${GREEN}✅ Content seeded${NC}\n"
else
    echo -e "${YELLOW}⚠️  Skipped seeding${NC}\n"
fi

# Step 4: Build
echo -e "${BLUE}Step 4: Building...${NC}"
npm run build
echo -e "${GREEN}✅ Build complete${NC}\n"

# Step 5: Deploy choice
echo -e "${BLUE}Step 5: Deploy${NC}"
echo "Choose deployment option:"
echo "1. Local (test)"
echo "2. Railway (backend) + Vercel (frontend)"
echo "3. Manual (I'll deploy myself)"
echo ""
read -p "Enter choice (1-3): " deploy_choice

if [ "$deploy_choice" = "1" ]; then
    echo -e "${GREEN}Starting local servers...${NC}"
    echo ""
    echo "Backend: http://localhost:3001"
    echo "Frontend: http://localhost:3002"
    echo ""
    npm run dev
elif [ "$deploy_choice" = "2" ]; then
    echo -e "${BLUE}Deploying to production...${NC}"
    
    # Backend
    echo "Deploying backend to Railway..."
    cd backend
    if command -v railway &> /dev/null; then
        railway up
    else
        echo -e "${YELLOW}Railway CLI not found. Install: npm i -g @railway/cli${NC}"
        echo "Or push to Railway via git"
    fi
    cd ..
    
    # Frontend
    echo "Deploying frontend to Vercel..."
    cd web
    if command -v vercel &> /dev/null; then
        vercel --prod
    else
        echo -e "${YELLOW}Vercel CLI not found. Install: npm i -g vercel${NC}"
    fi
    cd ..
    
    echo -e "${GREEN}✅ Deployment initiated${NC}"
else
    echo -e "${YELLOW}Manual deployment selected${NC}"
    echo ""
    echo "Backend deployment:"
    echo "  cd backend && git push railway main"
    echo ""
    echo "Frontend deployment:"
    echo "  cd web && vercel --prod"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 Gitgram is ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Visit your site"
echo "  2. Create your first post"
echo "  3. Share with the world!"
echo ""
echo "Documentation:"
echo "  - LAUNCH_NOW.md - Complete launch guide"
echo "  - START_HERE.md - Quick start"
echo "  - STATUS.md - Current status"
echo ""
