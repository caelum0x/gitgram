#!/bin/bash

set -e

echo "🏗️  Building Gitgram for Production..."

# Backend
echo "📦 Building backend..."
cd backend
npm install --production=false
npx prisma generate
npm run build
echo "✅ Backend built"
cd ..

# Frontend
echo "📦 Building frontend..."
cd web
npm install
npm run build
echo "✅ Frontend built"
cd ..

# Mobile (optional)
echo "📦 Building mobile..."
cd mobile
npm install
echo "✅ Mobile dependencies installed"
cd ..

echo "🎉 All builds complete!"
