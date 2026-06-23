import prisma from '../utils/prisma';
import { githubService } from '../services/githubService';
import logger from '../utils/logger';

const DEMO_USERS = [
  {
    username: 'gitgram_official',
    email: 'hello@gitgram.dev',
    password: 'password123',
    bio: 'Official Gitgram account. Follow us for updates!',
    avatar: 'https://github.com/gitgram.png',
    verified: true,
  },
  {
    username: 'react_fan',
    email: 'react@example.com',
    password: 'password123',
    bio: 'React enthusiast. Building the future of UI.',
    avatar: 'https://github.com/facebook.png',
    verified: false,
  },
  {
    username: 'backend_wizard',
    email: 'backend@example.com',
    password: 'password123',
    bio: 'Node.js, Go, and Rust. Scaling systems.',
    avatar: 'https://github.com/nodejs.png',
    verified: false,
  },
];

const POPULAR_REPOS = [
  { owner: 'facebook', name: 'react' },
  { owner: 'vercel', name: 'next.js' },
  { owner: 'microsoft', name: 'TypeScript' },
  { owner: 'tailwindlabs', name: 'tailwindcss' },
  { owner: 'shadcn-ui', name: 'ui' },
  { owner: 'prisma', name: 'prisma' },
  { owner: 'nestjs', name: 'nest' },
  { owner: 'facebook', name: 'react-native' },
  { owner: 'torvalds', name: 'linux' },
  { owner: 'openai', name: 'openai-python' },
];

const SAMPLE_POSTS = [
  "This library changed how I build UIs forever. Absolutely essential!",
  "Just checked the latest release notes. The new features are insane! 🚀",
  "Anyone else using this in production? The performance is incredible.",
  "I've been contributing to this repo for a while now. Great community!",
  "Best documentation I've seen in a long time. Super easy to get started.",
  "Can't imagine building a modern web app without this stack.",
  "The ecosystem around this tool is just massive. So many plugins!",
  "Finally fixed that bug I was tracking. Kudos to the maintainers!",
  "This is the gold standard for open source projects.",
  "Learning so much just by reading the source code of this project.",
];

async function seed() {
  logger.info('🌱 Starting quick seed...');

  try {
    // 1. Create Demo Users
    logger.info('Creating demo users...');
    const users = [];
    for (const userData of DEMO_USERS) {
      const user = await prisma.user.upsert({
        where: { email: userData.email },
        update: {},
        create: userData,
      });
      users.push(user);
      logger.info(`User created/found: ${user.username}`);
    }

    // 2. Sync Repositories & Create Posts
    logger.info('Syncing repositories and creating posts...');

    for (let i = 0; i < POPULAR_REPOS.length; i++) {
      const repoInfo = POPULAR_REPOS[i];
      try {
        // Sync repo
        const repo = await githubService.syncRepositoryToDb(repoInfo.owner, repoInfo.name);
        logger.info(`Synced repo: ${repo.fullName}`);

        // Create a post about it
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomPost = SAMPLE_POSTS[i % SAMPLE_POSTS.length];

        // Get or create an account for the user
        let account = await prisma.account.findFirst({
          where: { userId: randomUser.id },
        });
        if (!account) {
          account = await prisma.account.create({
            data: {
              type: 'USER',
              username: randomUser.username || `user_${randomUser.id}`,
              userId: randomUser.id,
            },
          });
        }

        await prisma.post.create({
          data: {
            content: randomPost,
            accountId: account.id,
            userId: randomUser.id,
            repositoryId: repo.id,
            repoUrl: repo.htmlUrl,
            type: 'REPOSITORY',
          },
        });
        logger.info(`Created post for ${repo.fullName} by ${randomUser.username}`);

      } catch (error) {
        logger.error(`Failed to process ${repoInfo.owner}/${repoInfo.name}:`, error);
      }
    }

    logger.info('✅ Quick seed complete!');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
