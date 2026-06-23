#!/bin/bash

echo "🔍 Gitgram Setup Verification"
echo "=============================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${RED}✗${NC} $2"
        return 1
    fi
}

check_env_var() {
    if grep -q "^$2=" "$1" 2>/dev/null && ! grep -q "^$2=your_" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        return 0
    else
        echo -e "${RED}✗${NC} $3"
        return 1
    fi
}

check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $2 (port $1)"
        return 0
    else
        echo -e "${RED}✗${NC} $2 (port $1)"
        return 1
    fi
}

echo "📁 File Structure:"
check_file "backend/.env" "Backend .env file"
check_file "web/.env.local" "Frontend .env.local file"
check_file "backend/node_modules" "Backend dependencies"
check_file "web/node_modules" "Frontend dependencies"
check_file "backend/prisma/schema.prisma" "Prisma schema"

echo ""
echo "🔑 Backend Environment Variables:"
check_env_var "backend/.env" "DATABASE_URL" "DATABASE_URL configured"
check_env_var "backend/.env" "JWT_SECRET" "JWT_SECRET configured"
check_env_var "backend/.env" "GITHUB_CLIENT_ID" "GITHUB_CLIENT_ID configured"
check_env_var "backend/.env" "GITHUB_CLIENT_SECRET" "GITHUB_CLIENT_SECRET configured"
check_env_var "backend/.env" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_ID configured"
check_env_var "backend/.env" "GOOGLE_CLIENT_SECRET" "GOOGLE_CLIENT_SECRET configured"

echo ""
echo "🔑 Frontend Environment Variables:"
check_env_var "web/.env.local" "NEXT_PUBLIC_GITHUB_CLIENT_ID" "NEXT_PUBLIC_GITHUB_CLIENT_ID configured"
check_env_var "web/.env.local" "NEXT_PUBLIC_GOOGLE_CLIENT_ID" "NEXT_PUBLIC_GOOGLE_CLIENT_ID configured"
check_env_var "web/.env.local" "NEXT_PUBLIC_API_URL" "NEXT_PUBLIC_API_URL configured"

echo ""
echo "🚀 Running Services:"
check_port 4000 "Backend server"
check_port 3000 "Frontend server"

echo ""
echo "📦 Code Implementation:"
check_file "backend/src/controllers/authController.ts" "Auth controller"
check_file "backend/src/routes/auth.ts" "Auth routes"
check_file "backend/src/routes/github.ts" "GitHub routes"
check_file "backend/src/controllers/githubController.ts" "GitHub controller"
check_file "web/app/(auth)/login/page.tsx" "Login page"
check_file "web/app/auth/github/callback/page.tsx" "GitHub callback"
check_file "web/app/auth/google/callback/page.tsx" "Google callback"
check_file "web/app/claim/page.tsx" "Claim account page"
check_file "web/services/githubService.ts" "GitHub service"

echo ""
echo "📊 Summary:"
echo ""

if [ -f "backend/.env" ] && [ -f "web/.env.local" ]; then
    echo -e "${GREEN}✓${NC} Environment files configured"
else
    echo -e "${RED}✗${NC} Environment files missing"
fi

if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null 2>&1 && lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Both servers running"
    echo ""
    echo "🎉 Ready to test!"
    echo ""
    echo "Test URLs:"
    echo "  → http://localhost:3000/login (GitHub/Google login)"
    echo "  → http://localhost:3000/claim (Account claiming)"
    echo "  → http://localhost:3000/projects (Project syncing)"
else
    echo -e "${YELLOW}⚠${NC} Servers not running"
    echo ""
    echo "Start servers with:"
    echo "  Terminal 1: cd backend && npm run dev"
    echo "  Terminal 2: cd web && npm run dev"
fi

echo ""
