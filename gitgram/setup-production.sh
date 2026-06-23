#!/bin/bash

echo "🚀 Gitgram Production Setup"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Step 1: Database Setup${NC}"
echo "---------------------"
echo ""
echo "Choose your database provider:"
echo "1. Supabase (Recommended - Free tier)"
echo "2. Neon (Serverless PostgreSQL)"
echo "3. Railway (All-in-one)"
echo ""
echo "Visit:"
echo "  Supabase: https://supabase.com"
echo "  Neon: https://neon.tech"
echo "  Railway: https://railway.app"
echo ""
read -p "Press Enter when you have your DATABASE_URL..."
echo ""

echo -e "${BLUE}Step 2: Storage Setup${NC}"
echo "-------------------"
echo ""
echo "Choose your storage provider:"
echo "1. Cloudinary (Recommended - Free tier)"
echo "2. AWS S3"
echo ""
echo "Visit:"
echo "  Cloudinary: https://cloudinary.com"
echo "  AWS S3: https://aws.amazon.com/s3"
echo ""
read -p "Press Enter when you have your storage credentials..."
echo ""

echo -e "${BLUE}Step 3: Redis Setup (Optional but Recommended)${NC}"
echo "--------------------------------------------"
echo ""
echo "For caching and rate limiting:"
echo "  Upstash: https://upstash.com (Free tier)"
echo ""
read -p "Press Enter to continue..."
echo ""

echo -e "${BLUE}Step 4: Email Service${NC}"
echo "-------------------"
echo ""
echo "For transactional emails:"
echo "  Resend: https://resend.com (Free: 3K emails/month)"
echo ""
read -p "Press Enter when you have your RESEND_API_KEY..."
echo ""

echo -e "${BLUE}Step 5: Monitoring (Optional)${NC}"
echo "---------------------------"
echo ""
echo "For error tracking:"
echo "  Sentry: https://sentry.io (Free tier)"
echo ""
read -p "Press Enter to continue..."
echo ""

echo -e "${BLUE}Step 6: GitHub Token (Recommended)${NC}"
echo "--------------------------------"
echo ""
echo "For repository features (5000 req/hour vs 60):"
echo "1. Go to: https://github.com/settings/tokens"
echo "2. Generate new token (classic)"
echo "3. Select scope: public_repo"
echo "4. Copy token"
echo ""
read -p "Press Enter when you have your GITHUB_TOKEN..."
echo ""

echo -e "${BLUE}Step 7: Generate Secrets${NC}"
echo "---------------------"
echo ""
echo "Generating secure secrets..."

JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

echo ""
echo -e "${GREEN}✅ Secrets generated!${NC}"
echo ""

echo -e "${BLUE}Step 8: Create .env File${NC}"
echo "---------------------"
echo ""

cat > backend/.env.production << EOF
# Database
DATABASE_URL=your_database_url_here

# JWT Secrets
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET

# Email
RESEND_API_KEY=your_resend_key_here

# Storage (Choose one)
# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# OR AWS S3
# AWS_ACCESS_KEY_ID=your_access_key
# AWS_SECRET_ACCESS_KEY=your_secret_key
# AWS_S3_BUCKET=your_bucket_name
# AWS_REGION=us-east-1

# Redis (Optional)
REDIS_URL=your_redis_url_here

# Sentry (Optional)
SENTRY_DSN=your_sentry_dsn_here

# GitHub (Recommended)
GITHUB_TOKEN=your_github_token_here

# OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# App
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-domain.com
CORS_ORIGIN=https://your-domain.com
EOF

echo -e "${GREEN}✅ Created backend/.env.production${NC}"
echo ""
echo "Edit this file and add your actual credentials:"
echo "  nano backend/.env.production"
echo ""

cat > web/.env.production << EOF
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api
NEXT_PUBLIC_SOCKET_URL=https://api.your-domain.com
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn_here
EOF

echo -e "${GREEN}✅ Created web/.env.production${NC}"
echo ""

echo -e "${BLUE}Step 9: Run Database Migrations${NC}"
echo "-----------------------------"
echo ""
echo "After adding your DATABASE_URL, run:"
echo "  cd backend"
echo "  npx prisma migrate deploy"
echo ""
read -p "Press Enter to continue..."
echo ""

echo -e "${GREEN}✅ Production Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env.production with your credentials"
echo "2. Edit web/.env.production with your API URL"
echo "3. Run: cd backend && npx prisma migrate deploy"
echo "4. Deploy backend (Railway/Render)"
echo "5. Deploy frontend (Vercel)"
echo ""
echo "See DEPLOYMENT_CHECKLIST.md for detailed instructions"
echo ""
