# Gitgram Backend - Complete Setup Guide

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
DATABASE_URL=postgresql://...  # Your PostgreSQL URL
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
RESEND_API_KEY=re_xxxxx        # Get from resend.com
```

### 3. Setup Database
```bash
npx prisma generate
npx prisma db push
```

### 4. Start Server
```bash
npm run build
npm start
```

Server runs on http://localhost:4000 ✅

---

## 📋 Detailed Setup

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL database
- Resend account (free tier works)

### Step-by-Step

#### 1. Database Setup

**Option A: Local PostgreSQL**
```bash
# Install PostgreSQL
brew install postgresql  # macOS
# or
sudo apt install postgresql  # Linux

# Create database
createdb gitgram

# Update .env
DATABASE_URL=postgresql://localhost:5432/gitgram
```

**Option B: Neon (Recommended)**
1. Go to [neon.tech](https://neon.tech)
2. Create free account
3. Create new project
4. Copy connection string
5. Add to `.env`

**Option C: Supabase**
1. Go to [supabase.com](https://supabase.com)
2. Create project
3. Get connection string from Settings → Database
4. Add to `.env`

#### 2. Email Setup (Resend)

1. Go to [resend.com](https://resend.com)
2. Sign up (free tier: 3,000 emails/month)
3. Create API key
4. Add to `.env`:
```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Gitgram <noreply@yourdomain.com>
```

**For Development:**
- Use test API key
- Emails go to your verified email only

**For Production:**
- Add your domain
- Verify DNS records
- Update `EMAIL_FROM`

#### 3. JWT Secrets

Generate secure secrets:
```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add to `.env`

#### 4. CORS Configuration

Update for your frontend URLs:
```env
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000,http://localhost:8081
```

---

## 🧪 Testing the Setup

### 1. Health Check
```bash
curl http://localhost:4000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": 123,
  "database": { "status": "healthy" },
  "memory": { "used": 50, "total": 100 }
}
```

### 2. Register User
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Upload Image
```bash
curl -X POST http://localhost:4000/api/v1/upload/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/image.jpg"
```

### 4. Test Socket.io
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:4000', {
  auth: { token: 'YOUR_TOKEN' }
});

socket.on('connect', () => {
  console.log('Connected!');
});
```

---

## 🔧 Development Scripts

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio

# Development mode (with hot reload)
npm run dev:backend

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Lint code
npm run lint
```

---

## 📦 Package List

### Core Dependencies
- express - Web framework
- @prisma/client - Database ORM
- socket.io - Real-time
- jsonwebtoken - JWT auth
- bcryptjs - Password hashing
- resend - Email service
- multer - File upload
- sharp - Image processing

### Dev Dependencies
- typescript - Type safety
- @types/* - Type definitions
- ts-node - TypeScript execution
- nodemon - Hot reload
- prisma - Database toolkit

---

## 🐛 Troubleshooting

### Database Connection Error
```
Error: Can't reach database server
```

**Solution:**
- Check DATABASE_URL is correct
- Ensure PostgreSQL is running
- Check network/firewall settings

### Port Already in Use
```
Error: EADDRINUSE: address already in use :::4000
```

**Solution:**
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Or use different port
PORT=5000 npm start
```

### Prisma Generate Error
```
Error: Prisma schema not found
```

**Solution:**
```bash
cd backend
npx prisma generate
```

### Upload Directory Error
```
Error: ENOENT: no such file or directory
```

**Solution:**
```bash
mkdir -p uploads/thumbnails
```

### Email Not Sending
```
Error: Invalid API key
```

**Solution:**
- Check RESEND_API_KEY is correct
- Verify email domain (production)
- Check Resend dashboard for errors

---

## 🚀 Deployment

### Deploy to Production

#### 1. Build
```bash
npm run build
```

#### 2. Set Environment Variables
```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=...
RESEND_API_KEY=...
FRONTEND_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
```

#### 3. Run Migrations
```bash
npx prisma migrate deploy
```

#### 4. Start Server
```bash
npm start
```

### Deploy to Vercel/Railway/Render

1. Connect GitHub repo
2. Set environment variables
3. Build command: `npm run build`
4. Start command: `npm start`
5. Deploy!

---

## 📊 Performance Tips

### 1. Enable Redis
```env
REDIS_URL=redis://localhost:6379
```

### 2. Database Connection Pooling
Already configured in Prisma

### 3. Enable Compression
Already enabled in Express

### 4. Use CDN for Media
For production, use:
- Cloudinary
- AWS S3 + CloudFront
- Vercel Blob

---

## 🎯 What You Get

✅ **75+ API endpoints** ready to use  
✅ **Real-time messaging** with Socket.io  
✅ **Image optimization** with Sharp  
✅ **Email service** with Resend  
✅ **Complete authentication** with JWT  
✅ **Social features** (follow, like, comment)  
✅ **Stories** with 24h expiry  
✅ **Search & discovery**  
✅ **Analytics & insights**  
✅ **Production-ready** code  

---

## 📞 Support

- **Documentation:** See `*.md` files in root
- **API Reference:** `API_DOCUMENTATION.md`
- **Socket.io:** `SOCKET_IO_GUIDE.md`
- **Media/Email:** `MEDIA_EMAIL_GUIDE.md`

---

**Server:** http://localhost:4000  
**Status:** ✅ Running  
**Completion:** 100%  

**🎉 You're all set! Start building your frontend!**
