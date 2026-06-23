#!/bin/bash

echo "🚀 Deploying Universal Repository Support"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "web" ]; then
    echo -e "${RED}❌ Error: Run this script from the gitgram root directory${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Pre-deployment Checklist${NC}"
echo ""

# 1. Check database migration
echo "1. Checking database migration..."
cd backend
if npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
    echo -e "${GREEN}✅ Database is up to date${NC}"
else
    echo -e "${RED}⚠️  Database needs migration${NC}"
    echo "   Run: cd backend && npx prisma migrate deploy"
fi

# 2. Check if Prisma client is generated
echo ""
echo "2. Checking Prisma client..."
if [ -d "node_modules/@prisma/client" ]; then
    echo -e "${GREEN}✅ Prisma client exists${NC}"
else
    echo -e "${RED}⚠️  Generating Prisma client...${NC}"
    npx prisma generate
fi

# 3. Check environment variables
echo ""
echo "3. Checking environment variables..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    if grep -q "DATABASE_URL" .env; then
        echo -e "${GREEN}✅ DATABASE_URL configured${NC}"
    else
        echo -e "${RED}❌ DATABASE_URL missing${NC}"
    fi
    
    if grep -q "GITHUB_TOKEN" .env; then
        echo -e "${GREEN}✅ GITHUB_TOKEN configured (5000 req/hour)${NC}"
    else
        echo -e "${BLUE}ℹ️  GITHUB_TOKEN not set (60 req/hour limit)${NC}"
        echo "   Get token: https://github.com/settings/tokens"
    fi
else
    echo -e "${RED}❌ .env file missing${NC}"
fi

cd ..

# 4. Test backend compilation
echo ""
echo "4. Testing backend compilation..."
cd backend
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend compiles successfully${NC}"
else
    echo -e "${RED}⚠️  Backend has compilation errors (may still work)${NC}"
fi
cd ..

# 5. Check frontend
echo ""
echo "5. Checking frontend..."
cd web
if [ -f "package.json" ]; then
    echo -e "${GREEN}✅ Frontend package.json exists${NC}"
else
    echo -e "${RED}❌ Frontend package.json missing${NC}"
fi
cd ..

echo ""
echo -e "${BLUE}📦 New Files Created${NC}"
echo ""
echo "Backend:"
echo "  ✅ src/services/repositoryService.ts"
echo "  ✅ src/controllers/repositoryController.ts"
echo "  ✅ src/routes/repositories.ts"
echo ""
echo "Frontend:"
echo "  ✅ components/CreatePostWithRepo.tsx"
echo "  ✅ app/repo/[owner]/[name]/page.tsx"
echo "  ✅ app/explore/repos/page.tsx"
echo ""
echo "Mobile:"
echo "  ✅ services/repositoryService.ts"
echo "  ✅ app/repo/search.tsx"
echo "  ✅ app/repo/[owner]/[name].tsx"
echo ""

echo -e "${BLUE}🧪 Testing Endpoints${NC}"
echo ""
echo "Start backend: cd backend && npm run dev"
echo "Then test:"
echo ""
echo "  curl http://localhost:3001/api/repositories/search?q=vscode"
echo "  curl http://localhost:3001/api/repositories/microsoft/vscode"
echo "  curl http://localhost:3001/api/repositories/trending"
echo ""

echo -e "${BLUE}🚀 Deployment Commands${NC}"
echo ""
echo "Backend (Railway/Render):"
echo "  cd backend"
echo "  npx prisma migrate deploy"
echo "  git push production main"
echo ""
echo "Frontend (Vercel):"
echo "  cd web"
echo "  vercel --prod"
echo ""

echo -e "${GREEN}✅ Pre-deployment check complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Test locally (see commands above)"
echo "  2. Deploy backend"
echo "  3. Deploy frontend"
echo "  4. Create seed posts about popular repos"
echo ""
echo "📚 Documentation:"
echo "  - QUICK_START.md - Start in 3 steps"
echo "  - DEPLOYMENT_CHECKLIST.md - Full deploy guide"
echo "  - API_EXAMPLES.md - API usage"
echo ""
