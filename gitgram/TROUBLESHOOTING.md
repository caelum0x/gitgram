# Gitgram Troubleshooting Guide

## Common Issues and Solutions

### Backend TypeScript Errors

**Issue:** TypeScript compilation errors with missing type definitions.

**Solution:**
```bash
npm run fix:types
```

Or manually:
```bash
cd backend
npm install --save-dev --legacy-peer-deps @types/compression @types/cookie-parser @types/csurf @types/helmet @types/speakeasy
```

### Port Conflicts

**Issue:** Port already in use errors.

**Solution:**
- Backend (default: 3000): Change in `backend/src/config/server.ts`
- Web (default: 3001): Change in `web/package.json` dev script
- Mobile (default: 8081): Expo will prompt to use another port

### npm-run-all Not Found

**Issue:** `sh: npm-run-all: command not found`

**Solution:**
The scripts automatically install it, but you can also:
```bash
npm install --save-dev npm-run-all
```

### Peer Dependency Conflicts

**Issue:** React version conflicts between web (React 18) and mobile (React 19).

**Solution:**
Already handled with `--legacy-peer-deps` flag. Each project installs independently.

### Backend Won't Start

**Issue:** Backend crashes with TypeScript errors.

**Solutions:**
1. Install missing types: `npm run fix:types`
2. Check `backend/tsconfig.json` - strict mode is disabled for compatibility
3. Ensure all dependencies are installed: `npm run install:backend`

### Database Connection Issues

**Issue:** Cannot connect to PostgreSQL.

**Solution:**
1. Check `.env` file in backend directory
2. Ensure PostgreSQL is running
3. Verify `DATABASE_URL` is correct
4. Run migrations: `npm run prisma:migrate`

### Mobile Expo Issues

**Issue:** Expo won't start or port conflicts.

**Solution:**
1. Clear Expo cache: `cd mobile && rm -rf .expo`
2. Restart Expo: `npm run dev:mobile`
3. Use different port if prompted

### Build Errors

**Issue:** Production builds fail.

**Solution:**
1. Clean build artifacts: `npm run clean`
2. Reinstall dependencies: `npm run install:all`
3. Check for TypeScript errors: `cd backend && npm run build`

## Quick Fixes

### Reset Everything
```bash
npm run clean:all
npm run install:all
npm run prisma:generate
```

### Fix TypeScript Issues
```bash
npm run fix:types
cd backend && npm run build
```

### Check All Services
```bash
# Check if ports are available
lsof -i :3000  # Backend
lsof -i :3001  # Web
lsof -i :8081  # Mobile
```

## Getting Help

1. Check logs in terminal output
2. Review error messages carefully
3. Ensure all prerequisites are installed (Node.js >= 18, npm >= 9)
4. Check project-specific README files

