# Gitgram Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Docker & Docker Compose (for containerized deployment)
- AWS Account (for S3 storage)
- GitHub repository

## Environment Setup

### Backend Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Server
PORT=3000
NODE_ENV=production
API_URL=https://api.gitgram.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/gitgram?schema=public

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Storage
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=gitgram-media
CDN_URL=https://cdn.gitgram.com

# CORS
CORS_ORIGIN=https://app.gitgram.com,https://gitgram.com

# Logging
LOG_LEVEL=info
```

## Database Setup

### 1. Create Production Database

```bash
# Using managed PostgreSQL (recommended)
# AWS RDS, Google Cloud SQL, or similar
```

### 2. Run Migrations

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

## Docker Deployment

### Build and Run

```bash
cd backend
docker-compose -f docker-compose.prod.yml up -d
```

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      # ... other env vars
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Kubernetes Deployment

### Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gitgram-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gitgram-backend
  template:
    metadata:
      labels:
        app: gitgram-backend
    spec:
      containers:
      - name: backend
        image: gitgram/backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: gitgram-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: gitgram-secrets
              key: jwt-secret
```

## Health Checks

The API includes a health check endpoint:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "message": "Gitgram API is running"
}
```

## Monitoring

### Logs

Logs are stored in:
- Development: Console output
- Production: `logs/` directory with daily rotation

### Metrics

Monitor:
- API response times
- Database query performance
- Error rates
- Memory and CPU usage

## Backup Strategy

### Database Backups

```bash
# Automated daily backups (set up cron job)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Media Backups

S3 versioning should be enabled for media files.

## Scaling

### Horizontal Scaling

- Use load balancer (nginx, AWS ALB)
- Multiple backend instances
- Database read replicas
- Redis for session storage

### Vertical Scaling

- Increase database resources
- Optimize queries
- Add caching layer

## Security Checklist

- [ ] All environment variables secured
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Database credentials secured
- [ ] JWT secret is strong (32+ characters)
- [ ] Regular security updates
- [ ] Firewall rules configured
- [ ] DDoS protection enabled

## Rollback Procedure

1. Identify the problematic version
2. Revert database migrations if needed
3. Deploy previous Docker image
4. Verify health checks
5. Monitor error rates

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check DATABASE_URL
   - Verify network connectivity
   - Check database credentials

2. **S3 Upload Failures**
   - Verify AWS credentials
   - Check bucket permissions
   - Verify region configuration

3. **High Memory Usage**
   - Check for memory leaks
   - Review query performance
   - Consider increasing resources

## Support

For issues, contact: support@gitgram.com

