import { PrismaClient } from '@prisma/client';
import { repositoryService } from '../services/repositoryService';

const prisma = new PrismaClient();

const POPULAR_REPOS = [
  { owner: 'microsoft', name: 'vscode', content: 'Best code editor ever! 🚀' },
  { owner: 'facebook', name: 'react', content: 'React changed web development forever' },
  { owner: 'vercel', name: 'next.js', content: 'Next.js 14 is incredible! App router is amazing' },
  { owner: 'nodejs', name: 'node', content: 'Node.js powers the modern web' },
  { owner: 'denoland', name: 'deno', content: 'Deno is the future of JavaScript runtime' },
  { owner: 'vuejs', name: 'vue', content: 'Vue.js is so elegant and easy to learn' },
  { owner: 'angular', name: 'angular', content: 'Angular is perfect for enterprise apps' },
  { owner: 'sveltejs', name: 'svelte', content: 'Svelte is blazingly fast!' },
  { owner: 'tailwindlabs', name: 'tailwindcss', content: 'Tailwind CSS changed how I style' },
  { owner: 'prisma', name: 'prisma', content: 'Best ORM for TypeScript!' },
  { owner: 'supabase', name: 'supabase', content: 'Open source Firebase alternative 🔥' },
  { owner: 'openai', name: 'openai-python', content: 'Building amazing AI apps with this' },
  { owner: 'python', name: 'cpython', content: 'Python is still the best for data science' },
  { owner: 'rust-lang', name: 'rust', content: 'Rust is the future of systems programming' },
  { owner: 'golang', name: 'go', content: 'Go is perfect for backend services' },
];

async function seedRepositories() {
  console.log('🌱 Seeding popular repositories...');

  // Create a demo user
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@gitgram.app' },
    create: {
      email: 'demo@gitgram.app',
      username: 'gitgram_official',
      password: 'not-used', // OAuth only
      verified: true,
      emailVerified: true,
    },
    update: {},
  });

  console.log(`✅ Demo user: @${demoUser.username}`);

  let count = 0;

  for (const repo of POPULAR_REPOS) {
    try {
      // Fetch and cache repository
      const repository = await repositoryService.getRepository(repo.owner, repo.name);
      console.log(`✅ Cached: ${repository.fullName}`);

      // Get or create an account for the demo user
      let account = await prisma.account.findFirst({
        where: { userId: demoUser.id },
      });
      if (!account) {
        account = await prisma.account.create({
          data: {
            type: 'USER',
            username: demoUser.username || `user_${demoUser.id}`,
            userId: demoUser.id,
          },
        });
      }

      // Create a post about it
      const post = await prisma.post.create({
        data: {
          accountId: account.id,
          userId: demoUser.id,
          content: repo.content,
          repositoryId: repository.id,
          type: 'POST',
        },
      });

      console.log(`✅ Posted about: ${repository.fullName}`);
      count++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`❌ Failed: ${repo.owner}/${repo.name}`, error.message);
    }
  }

  console.log('');
  console.log(`🎉 Seeded ${count} repositories!`);
  console.log('');
  console.log('Visit these pages:');
  console.log('  /repo/microsoft/vscode');
  console.log('  /repo/facebook/react');
  console.log('  /repo/vercel/next.js');
  console.log('');
}

seedRepositories()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
