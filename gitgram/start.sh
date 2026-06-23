#!/bin/bash

echo "🚀 Starting Gitgram..."

# Kill existing processes
pkill -f "ts-node" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 2

# Start backend
echo "📦 Starting backend on port 3001..."
cd backend
PORT=3001 npx ts-node --transpile-only src/index.ts > /tmp/gitgram-backend.log 2>&1 &
BACKEND_PID=$!
cd ..

sleep 3

# Start frontend
echo "🌐 Starting frontend on port 3002..."
cd web
npm run dev > /tmp/gitgram-frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 5

# Check status
echo ""
echo "✅ Gitgram is starting..."
echo ""
echo "Backend:  http://localhost:3001/health"
echo "Frontend: http://localhost:3002"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/gitgram-backend.log"
echo "  Frontend: tail -f /tmp/gitgram-frontend.log"
echo ""
echo "To stop: ./stop.sh"
echo ""

# Test backend
sleep 3
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend is UP!"
else
    echo "⚠️  Backend starting... (check logs)"
fi

echo ""
echo "🎉 Ready! Visit http://localhost:3002"
