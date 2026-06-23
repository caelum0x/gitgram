import { PrismaClient } from '@prisma/client';
import { Octokit } from '@octokit/rest';

const prisma = new PrismaClient();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function fetchTrending() {
  console.log('🔥 Fetching trending repositories...\n');

  const languages = ['typescript', 'javascript', 'python', 'rust', 'go'];
  const date = new Date();
  date.setDate(date.getDate() - 7); // Last week

  for (const language of languages) {
    try {
      const { data } = await octokit.search.repos({
        q: `language:${language} created:>${date.toISOString().split('T')[0]}`,
        sort: 'stars',
        per_page: 5,
      });

      console.log(`\n📊 Trending ${language.toUpperCase()} repos:`);
      
      for (const repo of data.items) {
        await prisma.repository.upsert({
          where: { owner_name: { owner: repo.owner!.login, name: repo.name } },
          create: {
            owner: repo.owner!.login,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language,
            topics: repo.topics || [],
            htmlUrl: repo.html_url,
            lastFetched: new Date(),
          },
          update: {
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            lastFetched: new Date(),
          },
        });

        console.log(`  ✅ ${repo.full_name} (⭐ ${repo.stargazers_count})`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`❌ Failed for ${language}:`, error.message);
    }
  }

  console.log('\n✅ Trending repos cached!\n');
}

fetchTrending()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
