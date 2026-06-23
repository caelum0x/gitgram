#!/bin/bash

echo "🚀 Gitgram OAuth Setup Script"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Please run this script from the project root directory${NC}"
    exit 1
fi

echo "📋 Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm $(npm -v)"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} PostgreSQL CLI not found (optional)"
else
    echo -e "${GREEN}✓${NC} PostgreSQL installed"
fi

echo ""
echo "📦 Installing dependencies..."
echo ""

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
cd ..
echo -e "${GREEN}✓${NC} Backend dependencies installed"

# Install web dependencies
echo "Installing web dependencies..."
cd web
npm install
cd ..
echo -e "${GREEN}✓${NC} Web dependencies installed"

echo ""
echo "⚙️  Setting up environment files..."
echo ""

# Backend .env
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo -e "${YELLOW}⚠${NC} Created backend/.env - Please configure it"
else
    echo -e "${GREEN}✓${NC} backend/.env exists"
fi

# Web .env.local
if [ ! -f "web/.env.local" ]; then
    cp web/.env.example web/.env.local
    echo -e "${YELLOW}⚠${NC} Created web/.env.local - Please configure it"
else
    echo -e "${GREEN}✓${NC} web/.env.local exists"
fi

echo ""
echo "🔑 OAuth Configuration Needed:"
echo ""
echo "1. GitHub OAuth App:"
echo "   → https://github.com/settings/developers"
echo "   → Callback URL: http://localhost:3000/auth/github/callback"
echo ""
echo "2. Google OAuth Credentials:"
echo "   → https://console.cloud.google.com/apis/credentials"
echo "   → Callback URL: http://localhost:3000/auth/google/callback"
echo ""
echo "3. Update backend/.env with:"
echo "   - GITHUB_CLIENT_ID"
echo "   - GITHUB_CLIENT_SECRET"
echo "   - GOOGLE_CLIENT_ID"
echo "   - GOOGLE_CLIENT_SECRET"
echo "   - DATABASE_URL"
echo "   - JWT_SECRET"
echo ""
echo "4. Update web/.env.local with:"
echo "   - NEXT_PUBLIC_GITHUB_CLIENT_ID"
echo "   - NEXT_PUBLIC_GOOGLE_CLIENT_ID"
echo ""

read -p "Have you configured the OAuth credentials? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠${NC} Please configure OAuth credentials and run this script again"
    exit 0
fi

echo ""
echo "🗄️  Setting up database..."
echo ""

cd backend

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate
echo -e "${GREEN}✓${NC} Prisma client generated"

# Run migrations
echo "Running database migrations..."
if npx prisma migrate deploy 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Database migrations applied"
else
    echo -e "${YELLOW}⚠${NC} Migration failed - you may need to run 'npx prisma migrate dev' manually"
fi

cd ..

echo ""
echo "✅ Setup Complete!"
echo ""
echo "🚀 To start the application:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend && npm run dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd web && npm run dev"
echo ""
echo "Or use the root command:"
echo "  npm run dev"
echo ""
echo "📝 Access the application:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000"
echo ""
echo "📚 Next steps:"
echo "  1. Test GitHub login at http://localhost:3000/login"
echo "  2. Test Google login at http://localhost:3000/login"
echo "  3. Claim account at http://localhost:3000/claim"
echo "  4. Sync projects at http://localhost:3000/projects"
echo ""
