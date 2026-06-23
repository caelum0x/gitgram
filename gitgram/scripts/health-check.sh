#!/bin/bash

echo "🏥 Gitgram Health Check"
echo "======================="

# Backend
echo -n "Backend: "
if curl -s http://localhost:3001/health > /dev/null; then
  echo "✅ Healthy"
else
  echo "❌ Down"
fi

# Frontend
echo -n "Frontend: "
if curl -s http://localhost:3002 > /dev/null; then
  echo "✅ Healthy"
else
  echo "❌ Down"
fi

# Database
echo -n "Database: "
cd backend
if npx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; then
  echo "✅ Connected"
else
  echo "❌ Disconnected"
fi
cd ..

echo "======================="
