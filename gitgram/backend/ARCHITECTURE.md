# Gitgram Architecture

## System Overview

Gitgram is a social media platform for developers to showcase GitHub projects, built with:
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Mobile**: React Native with Expo
- **Real-time**: Socket.io
- **Storage**: AWS S3 (production) / Local (development)

## Architecture Diagram

```
┌─────────────┐
│   Mobile    │
│    App      │
│  (Expo)     │
└──────┬──────┘
       │
       │ HTTPS/REST API
       │ WebSocket
       │
┌──────▼──────────────────┐
│   Load Balancer         │
│   (Nginx/ALB)           │
└──────┬──────────────────┘
       │
       ├─────────────┬─────────────┐
       │             │             │
┌──────▼──────┐ ┌───▼──────┐ ┌───▼──────┐
│  Backend    │ │ Backend  │ │ Backend  │
│  Instance 1 │ │Instance 2│ │Instance 3│
└──────┬──────┘ └───┬──────┘ └───┬──────┘
       │            │             │
       └────────────┼─────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼──┐  ┌─────▼─────┐  ┌─▼──────┐
│PostgreSQL│  │   Redis   │  │  S3    │
│ (Primary)│  │  (Cache)  │  │(Media) │
└──────────┘  └───────────┘  └─────────┘
     │
     │
┌────▼──────┐
│PostgreSQL │
│ (Replica) │
└───────────┘
```

## Backend Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Express middleware
│   ├── models/          # Data models (Prisma)
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Utilities
│   ├── validators/       # Input validation
│   └── websocket/        # Socket.io handlers
├── prisma/               # Database schema
├── tests/                # Test files
└── dist/                 # Compiled JavaScript
```

## API Architecture

### RESTful API

- **Base URL**: `/api/v1`
- **Authentication**: JWT Bearer tokens
- **Response Format**: JSON
- **Error Handling**: Standardized error responses

### Endpoints

- `/api/v1/auth` - Authentication
- `/api/v1/posts` - Posts management
- `/api/v1/reels` - Reels (videos)
- `/api/v1/stories` - Stories (24h)
- `/api/v1/messages` - Direct messages
- `/api/v1/users` - User management
- `/api/v1/github` - GitHub integration

## Database Schema

### Key Models

- **User**: User accounts and profiles
- **Post**: Text, image, code posts
- **Reel**: Video content
- **Story**: Ephemeral content (24h)
- **Message**: Direct messages
- **Notification**: User notifications
- **GitHubProject**: Synced GitHub repositories

### Relationships

- User → Posts (1:N)
- User → Reels (1:N)
- User → Stories (1:N)
- User → Followers (N:M)
- Post → Comments (1:N)
- Post → Likes (N:M)

## Security

### Authentication Flow

1. User registers/logs in
2. Server generates access token (15min) + refresh token (7 days)
3. Client stores tokens securely
4. Client sends access token in Authorization header
5. On expiration, client uses refresh token to get new access token

### Authorization

- Role-based access control (user, admin, moderator)
- Resource ownership validation
- Rate limiting per endpoint

## Storage

### Media Storage

- **Development**: Local filesystem
- **Production**: AWS S3 with CDN
- **File Types**: Images, videos, code snippets
- **Max Size**: 50MB per file

## Real-time Features

### Socket.io

- Real-time messaging
- Typing indicators
- Live notifications
- Connection management

## Performance Optimizations

- Database indexes on frequently queried fields
- Response compression (gzip)
- API response caching (Redis - planned)
- Connection pooling
- Pagination for large datasets

## Monitoring

- Winston logging with daily rotation
- Request logging middleware
- Error tracking (Sentry - planned)
- Health check endpoints

## Deployment

- Docker containerization
- Kubernetes/ECS for orchestration
- CI/CD with GitHub Actions
- Automated testing on PR
- Staging and production environments

