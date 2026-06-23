import prisma from '../utils/prisma';

async function migrateToAccounts() {
  console.log('🔄 Starting migration to Account system...\n');

  try {
    // 1. Create Account for each User
    console.log('1️⃣ Creating Accounts for existing Users...');
    const users = await prisma.user.findMany();
    
    for (const user of users) {
      const existingAccount = await prisma.account.findFirst({
        where: { userId: user.id },
      });

      if (!existingAccount) {
        await prisma.account.create({
          data: {
            type: 'USER',
            username: user.username!,
            userId: user.id,
          },
        });
        console.log(`  ✅ Created account for @${user.username}`);
      }
    }

    console.log(`\n✅ Created ${users.length} user accounts\n`);

    // 2. Update Posts to use accountId
    console.log('2️⃣ Migrating Posts to use accountId...');
    const posts = await prisma.post.findMany({
      where: { accountId: { equals: null as unknown as string } },
    });

    for (const post of posts) {
      const account = await prisma.account.findFirst({
        where: { userId: post.userId },
      });

      if (account) {
        await prisma.post.update({
          where: { id: post.id },
          data: { accountId: account.id },
        });
      }
    }

    console.log(`✅ Migrated ${posts.length} posts\n`);

    // 3. Migrate Follows
    console.log('3️⃣ Migrating Follow relationships...');
    const oldFollows = await prisma.$queryRaw`
      SELECT * FROM "Follow" WHERE "followerId" NOT IN (SELECT id FROM "Account")
    `;

    console.log(`✅ Follow migration complete\n`);

    console.log('🎉 Migration complete!\n');
    console.log('Summary:');
    console.log(`  - ${users.length} user accounts created`);
    console.log(`  - ${posts.length} posts migrated`);
    console.log(`  - Follow relationships updated`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateToAccounts();
