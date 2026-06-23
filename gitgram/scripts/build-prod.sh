#!/bin/bash

# Build Production Script
echo "🚀 Starting Production Build Process..."

# 1. Build Backend
echo "📦 Building Backend..."
cd backend
npm ci
npm run build
cd ..

# 2. Build Web
echo "🌐 Building Web..."
cd web
npm ci
npm run build
cd ..

# 3. Build Mobile (EAS Build would be used in real scenario, here we just check types/lint)
echo "📱 Verifying Mobile..."
cd mobile
npm ci --legacy-peer-deps
npm run lint
# npm run build:mobile # This would be npx expo export or eas build
cd ..

echo "✅ Build Process Complete!"
