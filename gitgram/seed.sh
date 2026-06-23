#!/bin/bash

echo "🌱 Gitgram Content Seeding"
echo "========================="
echo ""
echo "Choose seeding option:"
echo "1. Quick Seed (10 repos, ~2 min)"
echo "2. Full Seed (30+ repos, ~5 min)"
echo ""
read -p "Enter choice (1 or 2): " choice

cd backend

if [ "$choice" = "1" ]; then
    echo ""
    echo "⚡ Running quick seed..."
    npx ts-node src/scripts/quickSeed.ts
elif [ "$choice" = "2" ]; then
    echo ""
    echo "🚀 Running full seed..."
    npx ts-node src/scripts/seedContent.ts
else
    echo "Invalid choice"
    exit 1
fi

echo ""
echo "✅ Seeding complete!"
echo ""
echo "Visit: http://localhost:3002/feed"
echo ""
