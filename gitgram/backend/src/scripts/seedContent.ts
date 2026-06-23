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
  {
    username: 'ai_researcher',
    email: 'ai@example.com',
    password: 'password123',
    bio: 'Exploring LLMs and Transformers.',
    avatar: 'https://github.com/openai.png',
    verified: false,
  },
  {
    username: 'mobile_dev',
    email: 'mobile@example.com',
    password: 'password123',
    bio: 'iOS and Android developer. Flutter & React Native.',
    avatar: 'https://github.com/google.png',
    verified: false,
  },
];

const REPO_CATEGORIES = {
  frontend: [
    { owner: 'facebook', name: 'react' },
    { owner: 'vercel', name: 'next.js' },
    { owner: 'vuejs', name: 'vue' },
    { owner: 'angular', name: 'angular' },
    { owner: 'sveltejs', name: 'svelte' },
    { owner: 'tailwindlabs', name: 'tailwindcss' },
  ],
  backend: [
    { owner: 'nodejs', name: 'node' },
    { owner: 'nestjs', name: 'nest' },
    { owner: 'expressjs', name: 'express' },
    { owner: 'prisma', name: 'prisma' },
    { owner: 'supabase', name: 'supabase' },
    { owner: 'strapi', name: 'strapi' },
  ],
  mobile: [
    { owner: 'facebook', name: 'react-native' },
    { owner: 'flutter', name: 'flutter' },
    { owner: 'expo', name: 'expo' },
  ],
  ai: [
    { owner: 'openai', name: 'openai-python' },
    { owner: 'tensorflow', name: 'tensorflow' },
    { owner: 'pytorch', name: 'pytorch' },
    { owner: 'huggingface', name: 'transformers' },
  ],
  tools: [
    { owner: 'microsoft', name: 'vscode' },
    { owner: 'neovim', name: 'neovim' },
    { owner: 'docker', name: 'docker' },
    { owner: 'kubernetes', name: 'kubernetes' },
    { owner: 'git', name: 'git' },
  ],
};

const POST_TEMPLATES = [
  "Just discovered {repo}! This is exactly what I needed for my new project.",
  "The documentation for {repo} is top-notch. Makes integration a breeze.",
  "Anyone else facing issues with the latest version of {repo}? Let's discuss.",
  "I love how {repo} handles {feature}. Such a smart design choice.",
  "Big shoutout to the maintainers of {repo}. You folks are doing amazing work!",
  "Comparing {repo} with alternatives, and I think it wins on performance.",
  "Just merged my first PR to {repo}! Feeling accomplished 🚀",
  "The community around {repo} is so helpful. Solved my issue in minutes.",
  "Can't wait to try the new features announced for {repo}.",
  "{repo} + {other_tech} is a killer combination for modern apps.",
];

async function seed() {
  logger.info('🚀 Starting full content seed...');

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

    // 2. Process Categories
    for (const [category, repos] of Object.entries(REPO_CATEGORIES)) {
      logger.info(`Processing category: ${category}`);

      for (const repoInfo of repos) {
        try {
          // Sync repo
          const repo = await githubService.syncRepositoryToDb(repoInfo.owner, repoInfo.name);
          logger.info(`Synced repo: ${repo.fullName}`);

          // Create 1-3 posts for each repo
          const numPosts = Math.floor(Math.random() * 3) + 1;

          for (let i = 0; i < numPosts; i++) {
            const randomUser = users[Math.floor(Math.random() * users.length)];
            let content = POST_TEMPLATES[Math.floor(Math.random() * POST_TEMPLATES.length)];

            content = content.replace('{repo}', repo.name);
            content = content.replace('{feature}', 'state management'); // Simple replacement
            content = content.replace('{other_tech}', 'TypeScript');

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
                content,
                accountId: account.id,
                userId: randomUser.id,
                repositoryId: repo.id,
                repoUrl: repo.htmlUrl,
                type: 'REPOSITORY',
                likesCount: Math.floor(Math.random() * 50), // Random initial likes
                viewsCount: Math.floor(Math.random() * 500), // Random initial views
              },
            });
          }
          logger.info(`Created ${numPosts} posts for ${repo.fullName}`);

        } catch (error) {
          logger.error(`Failed to process ${repoInfo.owner}/${repoInfo.name}:`, error);
        }
      }
    }

    logger.info('✅ Full seed complete!');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
