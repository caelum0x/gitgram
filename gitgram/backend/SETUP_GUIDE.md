# Backend Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://gitgram:gitgram_password@localhost:5432/gitgram?schema=public

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-change-in-production
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# GitHub OAuth (optional for development)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Storage (local for development, S3 for production)
STORAGE_TYPE=local
# For S3:
# STORAGE_TYPE=s3
# AWS_ACCESS_KEY_ID=your-aws-access-key
# AWS_SECRET_ACCESS_KEY=your-aws-secret-key
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=gitgram-media
# CDN_URL=https://cdn.gitgram.com

# CORS (comma-separated for multiple origins)
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:8081

# Redis (optional - for caching)
# REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Error Tracking (optional)
# SENTRY_DSN=your-sentry-dsn

# Feature Flags (optional)
# LAUNCHDARKLY_SDK_KEY=your-launchdarkly-key
```

### 3. Database Setup

#### Option A: Using Docker Compose (Recommended)

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for database to be ready, then run migrations
npx prisma migrate dev
npx prisma generate
```

#### Option B: Local PostgreSQL

```bash
# Create database
createdb gitgram

# Run migrations
npx prisma migrate dev
npx prisma generate
```

### 4. Start the Server

#### Development Mode

```bash
npm run dev
```

#### Production Mode

```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

### 5. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Should return:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "uptime": ...,
#   "database": { "status": "healthy" },
#   "memory": { ... }
# }
```

## API Documentation

Once the server is running, visit:
- **Swagger UI**: `http://localhost:3000/api-docs` (development only)

## Testing Endpoints

### Authentication

```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Get Posts (Public)

```bash
curl http://localhost:3000/api/v1/posts
```

### Get Posts (Authenticated)

```bash
curl http://localhost:3000/api/v1/posts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Project Structure

```
backend/
├── src/
│   ├── controllers/     # Request handlers
│   ├── routes/          # Route definitions
│   ├── services/        # Business logic
│   ├── middleware/      # Express middleware
│   ├── utils/           # Utility functions
│   ├── config/          # Configuration files
│   ├── validators/      # Input validation
│   ├── websocket/       # Socket.io handlers
│   └── index.ts         # Entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── uploads/             # Local file storage (if STORAGE_TYPE=local)
├── logs/                # Application logs
├── .env                 # Environment variables (create this)
└── package.json
```

## Common Issues

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker ps

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

### Port Already in Use

```bash
# Change PORT in .env or kill the process
lsof -ti:3000 | xargs kill
```

### Migration Errors

```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Or create a new migration
npx prisma migrate dev --name your_migration_name
```

### CORS Errors

Make sure your frontend origin is in `CORS_ORIGIN` in `.env`:

```env
CORS_ORIGIN=http://localhost:3000,http://localhost:8081
```

## Development Tips

1. **Hot Reload**: Use `npm run dev` for automatic restarts
2. **Database Studio**: Run `npx prisma studio` to view/edit database
3. **Logs**: Check `logs/` directory or console output
4. **API Testing**: Use Postman, Insomnia, or curl
5. **Type Safety**: TypeScript is configured - check types before committing

## Next Steps

1. ✅ Backend is running
2. ✅ Test endpoints with Postman/curl
3. ✅ Connect frontend (web) to backend
4. ✅ Connect mobile app to backend
5. ✅ Test real-time features (Socket.io)

## Production Deployment

See `DEPLOYMENT.md` for production deployment instructions.

