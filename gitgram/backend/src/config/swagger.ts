import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Gitgram API',
      version: '1.0.0',
      description: 'API documentation for Gitgram - Instagram + Reels for GitHub projects',
      contact: {
        name: 'Gitgram Support',
        email: 'support@gitgram.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.gitgram.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string' },
            avatar: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true },
            githubUsername: { type: 'string', nullable: true },
            isVerified: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            content: { type: 'string', nullable: true },
            mediaType: { type: 'string', enum: ['image', 'code', 'video', 'text'] },
            mediaUrl: { type: 'string', nullable: true },
            codeSnippet: { type: 'string', nullable: true },
            language: { type: 'string', nullable: true },
            hashtags: { type: 'array', items: { type: 'string' } },
            likesCount: { type: 'number' },
            commentsCount: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object', nullable: true },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            senderId: { type: 'string' },
            receiverId: { type: 'string', nullable: true },
            chatId: { type: 'string', nullable: true },
            content: { type: 'string' },
            isRead: { type: 'boolean' },
            isEdited: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            type: { type: 'string', enum: ['like', 'comment', 'follow', 'mention', 'repost', 'system'] },
            message: { type: 'string' },
            isRead: { type: 'boolean' },
            referenceId: { type: 'string', nullable: true },
            referenceType: { type: 'string', nullable: true },
            actorId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Repository: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            owner: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            language: { type: 'string', nullable: true },
            stars: { type: 'integer' },
            forks: { type: 'integer' },
            followersCount: { type: 'integer' },
            isFollowing: { type: 'boolean' },
            isBookmarked: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Comment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            postId: { type: 'string' },
            userId: { type: 'string' },
            content: { type: 'string' },
            parentId: { type: 'string', nullable: true },
            likesCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        Collection: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            coverImage: { type: 'string', nullable: true },
            isPrivate: { type: 'boolean' },
            postCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Story: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            repositoryId: { type: 'string' },
            userId: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            mediaUrl: { type: 'string', nullable: true },
            expiresAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

