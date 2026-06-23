# Gitgram Backend API

A social media platform API for developers where GitHub repositories become social pages. Think Instagram + Reels for GitHub projects.

## Features

- **Repository-as-Account Architecture**: GitHub repositories can have their own social profiles
- **Authentication**: JWT-based auth with refresh tokens, 2FA support, OAuth (GitHub/Google)
- **Posts & Feed**: Create posts with code snippets, images, videos; personalized feed algorithm
- **Stories & Reels**: Short-form content with 24-hour expiration
- **Real-time**: WebSocket support for notifications, messaging, typing indicators
- **GitHub Integration**: Sync projects, trending repositories, recommendations
- **Social Features**: Follow/unfollow, likes, comments, collections, messaging
- **Content Moderation**: Automated NSFW detection and content filtering
- **Premium Subscriptions**: Polar.sh integration for premium features

## Tech Stack

- **Runtime**: Node.js with Express 5
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Real-time**: Socket.io
- **Storage**: AWS S3
- **Authentication**: JWT, OAuth 2.0
- **Payments**: Polar.sh
- **Testing**: Jest + Supertest

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+ (optional, for caching)
- pnpm (recommended) or npm

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/gitgram.git
   cd gitgram/backend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (see Environment Variables section below)

4. **Set up the database**
   ```bash
   # Generate Prisma client
   pnpm prisma:generate

   # Run migrations
   pnpm prisma:migrate
   ```

5. **Start the development server**
   ```bash
   pnpm dev
   ```

The API will be available at `http://localhost:4000`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 4000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for access tokens | Yes |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | Yes |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No |
| `REDIS_URL` | Redis connection URL | No |
| `SMTP_HOST` | SMTP server host | No |
| `SMTP_PORT` | SMTP server port | No |
| `SMTP_USER` | SMTP username | No |
| `SMTP_PASS` | SMTP password | No |
| `AWS_ACCESS_KEY_ID` | AWS access key | No |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | No |
| `AWS_REGION` | AWS region | No |
| `AWS_S3_BUCKET` | S3 bucket name | No |
| `POLAR_ACCESS_TOKEN` | Polar.sh access token | No |
| `POLAR_WEBHOOK_SECRET` | Polar.sh webhook secret | No |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix ESLint issues |
| `pnpm format` | Format code with Prettier |
| `pnpm prisma:generate` | Generate Prisma client |
| `pnpm prisma:migrate` | Run database migrations |
| `pnpm prisma:studio` | Open Prisma Studio |

## API Documentation

Interactive API documentation is available at `/api-docs` when the server is running.

### Main API Endpoints

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/2fa/setup` - Set up 2FA
- `POST /api/v1/auth/github` - GitHub OAuth
- `POST /api/v1/auth/google` - Google OAuth

#### Posts
- `GET /api/v1/posts/feed` - Get personalized feed
- `GET /api/v1/posts/explore` - Get explore feed
- `GET /api/v1/posts/trending` - Get trending posts
- `POST /api/v1/posts` - Create post
- `GET /api/v1/posts/:id` - Get post
- `DELETE /api/v1/posts/:id` - Delete post
- `POST /api/v1/posts/:id/like` - Like post
- `POST /api/v1/posts/:id/comments` - Add comment

#### GitHub Integration
- `GET /api/v1/github/trending/:period` - Get trending repos
- `GET /api/v1/github/search` - Search repositories
- `GET /api/v1/github/recommended` - Get recommendations
- `POST /api/v1/github/follow/:owner/:repo` - Follow repository
- `GET /api/v1/github/stats/:owner/:repo` - Get repo stats

#### Stories & Reels
- `GET /api/v1/stories` - Get stories feed
- `POST /api/v1/stories` - Create story
- `GET /api/v1/reels` - Get reels feed
- `POST /api/v1/reels` - Create reel

#### Users
- `GET /api/v1/users/:username` - Get user profile
- `PUT /api/v1/users/profile` - Update profile
- `POST /api/v1/users/:id/follow` - Follow user
- `GET /api/v1/users/:id/followers` - Get followers

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration (swagger, etc.)
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utilities
│   ├── validators/      # Input validation
│   ├── websocket/       # Socket.io handlers
│   └── index.ts         # Entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/               # Test files
├── logs/                # Application logs
└── uploads/             # Local file uploads
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Database Schema

The database uses a **Repository-as-Account** architecture where:

- **Account**: Universal entity that can be a User, Repository, or Organization
- **User**: Human users with authentication
- **Repository**: GitHub repositories that can act as social accounts
- **Post**: Content created by any account type
- **Story/Reel**: Short-form content with expiration

See `prisma/schema.prisma` for the complete schema.

## WebSocket Events

Connect to the WebSocket server with a JWT token:

```javascript
const socket = io('http://localhost:4000', {
  auth: { token: 'your-jwt-token' }
});
```

### Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `send_message` | Client -> Server | Send a message |
| `receive_message` | Server -> Client | Receive a message |
| `typing` | Client -> Server | Typing indicator |
| `user_typing` | Server -> Client | User is typing |
| `receive_notification` | Server -> Client | New notification |
| `user_online` | Server -> Client | User came online |
| `user_offline` | Server -> Client | User went offline |

## Deployment

### Using Docker

```bash
docker build -t gitgram-backend .
docker run -p 4000:4000 --env-file .env gitgram-backend
```

### Manual Deployment

1. Build the project:
   ```bash
   pnpm build
   ```

2. Run migrations:
   ```bash
   pnpm prisma:migrate deploy
   ```

3. Start the server:
   ```bash
   pnpm start
   ```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC
