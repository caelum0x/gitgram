/**
 * Gitgram Backend — Database Seed Script
 * --------------------------------------
 * Idempotent development seed. Safe to run repeatedly:
 *   - Clears all seeded content tables (delete-all) in FK-safe order.
 *   - Upserts keyed entities (users, accounts, repositories) on unique fields.
 *
 * Run with:  npx prisma db seed
 *
 * Models referenced (field names mirror prisma/schema.prisma exactly):
 *   User, Account, Repository, Post, Follow, RepositoryFollow,
 *   SavedCollection, SavedPost, SavedPostCollection, Story,
 *   Hashtag, PostHashtag
 *
 * NOTE: Account is the universal social profile. Every User and every
 * Repository must have a backing Account because Post/Story/Follow all
 * reference Account via accountId.
 *
 * eslint-disable no-console — console output is the intended UX for a CLI seed.
 */
/* eslint-disable no-console */

import { PrismaClient, AccountType, PostType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ----------------------------------------------------------------------------
// Static seed data
// ----------------------------------------------------------------------------

const SEED_PASSWORD = 'Password123!'; // dev-only password for all seeded users

interface SeedUser {
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  tier: string; // marketing tier — stored in bio + drives verified/role
  verified: boolean;
  role: UserRole;
  interests: string[];
}

const USERS: SeedUser[] = [
  {
    username: 'caelum0x',
    email: 'caelum0x@gitgram.dev',
    displayName: 'Caelum',
    avatarUrl: 'https://avatars.gitgram.dev/caelum0x.png',
    bio: 'Founder @ Gitgram. Making open source great again. [tier: founder]',
    tier: 'founder',
    verified: true,
    role: UserRole.SUPER_ADMIN,
    interests: ['typescript', 'distributed-systems', 'open-source'],
  },
  {
    username: 'mxvoid',
    email: 'mxvoid@gitgram.dev',
    displayName: 'MX Void',
    avatarUrl: 'https://avatars.gitgram.dev/mxvoid.png',
    bio: 'Low-level wizard. Compilers, kernels, and void pointers. [tier: pro]',
    tier: 'pro',
    verified: true,
    role: UserRole.MODERATOR,
    interests: ['rust', 'c', 'compilers'],
  },
  {
    username: 'natalie_dev',
    email: 'natalie@gitgram.dev',
    displayName: 'Natalie',
    avatarUrl: 'https://avatars.gitgram.dev/natalie_dev.png',
    bio: 'Full-stack dev. React, Node, and good coffee. [tier: pro]',
    tier: 'pro',
    verified: true,
    role: UserRole.USER,
    interests: ['react', 'nodejs', 'design-systems'],
  },
  {
    username: 'rustlord',
    email: 'rustlord@gitgram.dev',
    displayName: 'Rust Lord',
    avatarUrl: 'https://avatars.gitgram.dev/rustlord.png',
    bio: 'Borrow checker enthusiast. Zero-cost abstractions only. [tier: free]',
    tier: 'free',
    verified: false,
    role: UserRole.USER,
    interests: ['rust', 'wasm', 'performance'],
  },
  {
    username: 'aibuilder',
    email: 'aibuilder@gitgram.dev',
    displayName: 'AI Builder',
    avatarUrl: 'https://avatars.gitgram.dev/aibuilder.png',
    bio: 'Building agents that ship 35 PRs a day. [tier: free]',
    tier: 'free',
    verified: false,
    role: UserRole.USER,
    interests: ['ai', 'llm', 'agents'],
  },
];

interface SeedRepo {
  owner: string;
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  watchers: number;
  topics: string[];
}

const REPOS: SeedRepo[] = [
  {
    owner: 'caelum0x',
    name: 'gitgram',
    description: 'The social network for repositories. Every repo is a profile.',
    language: 'TypeScript',
    stars: 12450,
    forks: 980,
    watchers: 12450,
    topics: ['social', 'github', 'typescript', 'nextjs'],
  },
  {
    owner: 'caelum0x',
    name: 'aitimemachine',
    description: 'Deterministic restore system for AI coding agents.',
    language: 'Rust',
    stars: 8230,
    forks: 410,
    watchers: 8230,
    topics: ['ai', 'rust', 'cli', 'agents'],
  },
  {
    owner: 'mxvoid',
    name: 'voidlang',
    description: 'A tiny systems language that compiles to native code.',
    language: 'C',
    stars: 5600,
    forks: 320,
    watchers: 5600,
    topics: ['compiler', 'language', 'c'],
  },
  {
    owner: 'mxvoid',
    name: 'nanokernel',
    description: 'A minimal microkernel for learning OS internals.',
    language: 'C',
    stars: 2100,
    forks: 145,
    watchers: 2100,
    topics: ['kernel', 'os', 'c'],
  },
  {
    owner: 'natalie_dev',
    name: 'react-flux-ui',
    description: 'A headless, accessible React component library.',
    language: 'TypeScript',
    stars: 9870,
    forks: 720,
    watchers: 9870,
    topics: ['react', 'ui', 'accessibility', 'typescript'],
  },
  {
    owner: 'natalie_dev',
    name: 'node-edge-cache',
    description: 'Edge-first caching layer for Node.js APIs.',
    language: 'JavaScript',
    stars: 3340,
    forks: 210,
    watchers: 3340,
    topics: ['nodejs', 'cache', 'edge'],
  },
  {
    owner: 'rustlord',
    name: 'borrow-bench',
    description: 'Benchmark suite for Rust borrow-checker stress tests.',
    language: 'Rust',
    stars: 4420,
    forks: 188,
    watchers: 4420,
    topics: ['rust', 'benchmark', 'performance'],
  },
  {
    owner: 'rustlord',
    name: 'wasm-forge',
    description: 'Toolkit for building WASM modules from Rust.',
    language: 'Rust',
    stars: 6710,
    forks: 402,
    watchers: 6710,
    topics: ['rust', 'wasm', 'tooling'],
  },
  {
    owner: 'aibuilder',
    name: 'agentswarm',
    description: 'Orchestrate fleets of coding agents in parallel.',
    language: 'Python',
    stars: 15230,
    forks: 1340,
    watchers: 15230,
    topics: ['ai', 'agents', 'python', 'llm'],
  },
  {
    owner: 'aibuilder',
    name: 'promptforge',
    description: 'Versioned prompt management for LLM apps.',
    language: 'Python',
    stars: 7890,
    forks: 560,
    watchers: 7890,
    topics: ['ai', 'llm', 'prompts', 'python'],
  },
];

// Posts: mix of TEXT, snippet-style, and REPOSITORY shares. authorIndex maps
// into USERS; repoIndex (optional) maps into REPOS for repo-share posts.
interface SeedPost {
  authorIndex: number;
  type: PostType;
  content: string;
  hashtags: string[];
  repoIndex?: number;
}

const POSTS: SeedPost[] = [
  { authorIndex: 0, type: PostType.TEXT, content: 'Just shipped the new feed ranking. Engagement is up 30%. #gitgram #buildinpublic', hashtags: ['gitgram', 'buildinpublic'] },
  { authorIndex: 0, type: PostType.REPOSITORY, content: 'Check out the repo powering all of this 👇', hashtags: ['opensource'], repoIndex: 0 },
  { authorIndex: 0, type: PostType.TEXT, content: 'Open source needs better social discovery. That is the whole thesis. #opensource', hashtags: ['opensource'] },
  { authorIndex: 1, type: PostType.TEXT, content: 'Spent the night chasing a use-after-free. Valgrind is my best friend. #c #debugging', hashtags: ['c', 'debugging'] },
  { authorIndex: 1, type: PostType.TEXT, content: 'fn parse(tok: &mut Lexer) -> Ast { /* recursive descent, the GOAT */ } #compilers', hashtags: ['compilers', 'rust'] },
  { authorIndex: 1, type: PostType.REPOSITORY, content: 'voidlang now self-hosts. Bootstrapped compiler unlocked.', hashtags: ['compilers'], repoIndex: 2 },
  { authorIndex: 2, type: PostType.TEXT, content: 'Accessibility is not optional. Shipping ARIA-complete dialogs today. #a11y #react', hashtags: ['a11y', 'react'] },
  { authorIndex: 2, type: PostType.TEXT, content: 'const useToggle = (init = false) => { const [on, set] = useState(init); return [on, () => set(v => !v)]; } #react', hashtags: ['react', 'hooks'] },
  { authorIndex: 2, type: PostType.REPOSITORY, content: 'react-flux-ui v2 is out. Headless + accessible. Try it!', hashtags: ['react', 'ui'], repoIndex: 4 },
  { authorIndex: 2, type: PostType.TEXT, content: 'Good coffee + good types = good code. #typescript', hashtags: ['typescript'] },
  { authorIndex: 3, type: PostType.TEXT, content: 'The borrow checker is not your enemy, it is your pair programmer. #rust', hashtags: ['rust'] },
  { authorIndex: 3, type: PostType.TEXT, content: 'impl<T: Clone> Forge<T> { fn build(&self) -> Module { /* zero-cost */ } } #rust #wasm', hashtags: ['rust', 'wasm'] },
  { authorIndex: 3, type: PostType.REPOSITORY, content: 'wasm-forge hit 6.7k stars. Thank you all! 🦀', hashtags: ['rust', 'wasm'], repoIndex: 7 },
  { authorIndex: 3, type: PostType.TEXT, content: 'Benchmarks or it did not happen. #performance', hashtags: ['performance'] },
  { authorIndex: 4, type: PostType.TEXT, content: 'My agent swarm just opened 35 PRs while I slept. The future is here. #ai #agents', hashtags: ['ai', 'agents'] },
  { authorIndex: 4, type: PostType.TEXT, content: 'async def run(agent): tasks = plan(agent); return await gather(*tasks) #python #llm', hashtags: ['python', 'llm'] },
  { authorIndex: 4, type: PostType.REPOSITORY, content: 'agentswarm crossed 15k stars. Orchestration is eating the world.', hashtags: ['ai', 'agents'], repoIndex: 8 },
  { authorIndex: 4, type: PostType.TEXT, content: 'Versioning your prompts is just good engineering. #llm #prompts', hashtags: ['llm', 'prompts'] },
  { authorIndex: 0, type: PostType.TEXT, content: 'Welcome to Gitgram. Make open source great again. #gitgram', hashtags: ['gitgram'] },
  { authorIndex: 1, type: PostType.TEXT, content: 'Microkernels are underrated. Fight me. #os #kernel', hashtags: ['os', 'kernel'] },
];

// Follow graph by username pairs: follower follows following.
const FOLLOWS: Array<[string, string]> = [
  ['mxvoid', 'caelum0x'],
  ['natalie_dev', 'caelum0x'],
  ['rustlord', 'caelum0x'],
  ['aibuilder', 'caelum0x'],
  ['caelum0x', 'mxvoid'],
  ['caelum0x', 'natalie_dev'],
  ['natalie_dev', 'mxvoid'],
  ['rustlord', 'mxvoid'],
  ['aibuilder', 'rustlord'],
  ['rustlord', 'aibuilder'],
];

// Starred repos: username stars "owner/name".
const STARS: Array<[string, string]> = [
  ['mxvoid', 'caelum0x/gitgram'],
  ['natalie_dev', 'caelum0x/gitgram'],
  ['rustlord', 'caelum0x/aitimemachine'],
  ['aibuilder', 'caelum0x/aitimemachine'],
  ['caelum0x', 'aibuilder/agentswarm'],
  ['natalie_dev', 'rustlord/wasm-forge'],
  ['mxvoid', 'rustlord/borrow-bench'],
  ['rustlord', 'mxvoid/voidlang'],
];

// Collections: owner username + name + post indexes (into POSTS) to include.
interface SeedCollection {
  ownerUsername: string;
  name: string;
  description: string;
  isPrivate: boolean;
  postIndexes: number[];
}

const COLLECTIONS: SeedCollection[] = [
  { ownerUsername: 'caelum0x', name: 'Inspiration', description: 'Posts that fire me up.', isPrivate: false, postIndexes: [14, 16] },
  { ownerUsername: 'mxvoid', name: 'Compiler Notes', description: 'Compiler tricks worth saving.', isPrivate: false, postIndexes: [4, 5] },
  { ownerUsername: 'natalie_dev', name: 'React Gems', description: 'Reusable React patterns.', isPrivate: true, postIndexes: [7, 8] },
  { ownerUsername: 'rustlord', name: 'Rust Reads', description: 'Rust posts to revisit.', isPrivate: false, postIndexes: [10, 11, 12] },
  { ownerUsername: 'aibuilder', name: 'Agent Ideas', description: 'Agent orchestration ideas.', isPrivate: false, postIndexes: [14, 17] },
];

// Stories: owner username + media.
interface SeedStory {
  ownerUsername: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
}

const STORIES: SeedStory[] = [
  { ownerUsername: 'caelum0x', mediaUrl: 'https://media.gitgram.dev/stories/launch.png', mediaType: 'image', caption: 'Launch day!' },
  { ownerUsername: 'natalie_dev', mediaUrl: 'https://media.gitgram.dev/stories/uikit.png', mediaType: 'image', caption: 'New UI kit preview' },
  { ownerUsername: 'aibuilder', mediaUrl: 'https://media.gitgram.dev/stories/swarm.mp4', mediaType: 'video', caption: '35 PRs in one night' },
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Clear all seeded content tables in FK-safe order (children before parents). */
async function clearAll(): Promise<void> {
  await prisma.savedPostCollection.deleteMany({});
  await prisma.savedPost.deleteMany({});
  await prisma.savedCollection.deleteMany({});
  await prisma.postHashtag.deleteMany({});
  await prisma.hashtag.deleteMany({});
  await prisma.story.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.repositoryFollow.deleteMany({});
  await prisma.follow.deleteMany({});
  // Accounts, Users and Repositories are upserted (kept), not deleted.
}

// ----------------------------------------------------------------------------
// Seed steps
// ----------------------------------------------------------------------------

/** 1. Users + their USER accounts. Returns maps keyed by username. */
async function seedUsers(): Promise<{
  userByName: Map<string, { id: string }>;
  accountByName: Map<string, { id: string }>;
}> {
  const userByName = new Map<string, { id: string }>();
  const accountByName = new Map<string, { id: string }>();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatarUrl,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        verified: u.verified,
        role: u.role,
        interests: u.interests,
        emailVerified: true,
      },
      create: {
        email: u.email,
        password: passwordHash,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatarUrl,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        verified: u.verified,
        role: u.role,
        interests: u.interests,
        emailVerified: true,
      },
    });

    const account = await prisma.account.upsert({
      where: { username: u.username },
      update: {
        type: AccountType.USER,
        displayName: u.displayName,
        avatar: u.avatarUrl,
        bio: u.bio,
        verified: u.verified,
        userId: user.id,
      },
      create: {
        type: AccountType.USER,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatarUrl,
        bio: u.bio,
        verified: u.verified,
        userId: user.id,
      },
    });

    userByName.set(u.username, user);
    accountByName.set(u.username, account);
  }

  return { userByName, accountByName };
}

/** 2. Repositories + their REPOSITORY accounts. Keyed by "owner/name". */
async function seedRepositories(): Promise<{
  repoByFullName: Map<string, { id: string }>;
}> {
  const repoByFullName = new Map<string, { id: string }>();

  for (const r of REPOS) {
    const fullName = `${r.owner}/${r.name}`;
    const htmlUrl = `https://github.com/${fullName}`;

    const repo = await prisma.repository.upsert({
      where: { fullName },
      update: {
        owner: r.owner,
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stars,
        forks: r.forks,
        watchers: r.watchers,
        topics: r.topics,
        htmlUrl,
      },
      create: {
        owner: r.owner,
        name: r.name,
        fullName,
        description: r.description,
        language: r.language,
        stars: r.stars,
        forks: r.forks,
        watchers: r.watchers,
        topics: r.topics,
        htmlUrl,
      },
    });

    // Repo account handle is the full "owner/name" to stay unique.
    await prisma.account.upsert({
      where: { username: fullName },
      update: {
        type: AccountType.REPOSITORY,
        displayName: r.name,
        bio: r.description,
        repositoryId: repo.id,
      },
      create: {
        type: AccountType.REPOSITORY,
        username: fullName,
        displayName: r.name,
        bio: r.description,
        repositoryId: repo.id,
      },
    });

    repoByFullName.set(fullName, repo);
  }

  return { repoByFullName };
}

/** 3. Posts + hashtags. Returns post ids in declaration order. */
async function seedPosts(
  accountByName: Map<string, { id: string }>,
  userByName: Map<string, { id: string }>,
  repoByFullName: Map<string, { id: string }>,
): Promise<string[]> {
  const postIds: string[] = [];

  for (const p of POSTS) {
    const author = USERS[p.authorIndex];
    const account = accountByName.get(author.username)!;
    const user = userByName.get(author.username)!;

    let repositoryId: string | undefined;
    let repoUrl: string | undefined;
    if (p.repoIndex !== undefined) {
      const r = REPOS[p.repoIndex];
      const fullName = `${r.owner}/${r.name}`;
      repositoryId = repoByFullName.get(fullName)?.id;
      repoUrl = `https://github.com/${fullName}`;
    }

    const post = await prisma.post.create({
      data: {
        accountId: account.id,
        userId: user.id,
        repositoryId,
        repoUrl,
        content: p.content,
        type: p.type,
        status: 'PUBLISHED',
      },
    });
    postIds.push(post.id);

    // Hashtags: upsert the tag (bump count), then link via PostHashtag.
    for (const tag of p.hashtags) {
      const hashtag = await prisma.hashtag.upsert({
        where: { name: tag },
        update: { count: { increment: 1 } },
        create: { name: tag, count: 1 },
      });
      await prisma.postHashtag.upsert({
        where: { postId_hashtagId: { postId: post.id, hashtagId: hashtag.id } },
        update: {},
        create: { postId: post.id, hashtagId: hashtag.id },
      });
    }
  }

  return postIds;
}

/** 4. Follow relationships (Account-level + User-level). */
async function seedFollows(
  accountByName: Map<string, { id: string }>,
  userByName: Map<string, { id: string }>,
): Promise<void> {
  for (const [followerName, followingName] of FOLLOWS) {
    const followerAccount = accountByName.get(followerName)!;
    const followingAccount = accountByName.get(followingName)!;
    const followerUser = userByName.get(followerName)!;
    const followingUser = userByName.get(followingName)!;

    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: followerAccount.id,
          followingId: followingAccount.id,
        },
      },
      update: {},
      create: {
        followerId: followerAccount.id,
        followingId: followingAccount.id,
        followerUserId: followerUser.id,
        followingUserId: followingUser.id,
      },
    });
  }
}

/** 5. Starred repos via RepositoryFollow (user-level). */
async function seedStars(
  accountByName: Map<string, { id: string }>,
  userByName: Map<string, { id: string }>,
  repoByFullName: Map<string, { id: string }>,
): Promise<void> {
  for (const [username, fullName] of STARS) {
    const account = accountByName.get(username)!;
    const user = userByName.get(username)!;
    const repo = repoByFullName.get(fullName)!;

    await prisma.repositoryFollow.upsert({
      where: { userId_repositoryId: { userId: user.id, repositoryId: repo.id } },
      update: {},
      create: {
        accountId: account.id,
        userId: user.id,
        repositoryId: repo.id,
      },
    });
  }
}

/** 6. Collections + saved posts (with many-to-many junction links). */
async function seedCollections(
  accountByName: Map<string, { id: string }>,
  userByName: Map<string, { id: string }>,
  postIds: string[],
): Promise<void> {
  for (const c of COLLECTIONS) {
    const account = accountByName.get(c.ownerUsername)!;
    const user = userByName.get(c.ownerUsername)!;

    const collection = await prisma.savedCollection.upsert({
      where: { userId_name: { userId: user.id, name: c.name } },
      update: {
        description: c.description,
        isPrivate: c.isPrivate,
        accountId: account.id,
      },
      create: {
        accountId: account.id,
        userId: user.id,
        name: c.name,
        description: c.description,
        isPrivate: c.isPrivate,
      },
    });

    for (const idx of c.postIndexes) {
      const postId = postIds[idx];
      if (!postId) continue;

      const savedPost = await prisma.savedPost.upsert({
        where: { userId_postId: { userId: user.id, postId } },
        update: { collectionId: collection.id, accountId: account.id },
        create: {
          accountId: account.id,
          userId: user.id,
          postId,
          collectionId: collection.id,
        },
      });

      await prisma.savedPostCollection.upsert({
        where: {
          savedPostId_collectionId: {
            savedPostId: savedPost.id,
            collectionId: collection.id,
          },
        },
        update: {},
        create: { savedPostId: savedPost.id, collectionId: collection.id },
      });
    }
  }
}

/** 7. Stories (24h TTL). */
async function seedStoriesStep(
  accountByName: Map<string, { id: string }>,
  userByName: Map<string, { id: string }>,
): Promise<void> {
  const expiresAt = new Date(Date.now() + STORY_TTL_MS);

  for (const s of STORIES) {
    const account = accountByName.get(s.ownerUsername)!;
    const user = userByName.get(s.ownerUsername)!;

    await prisma.story.create({
      data: {
        accountId: account.id,
        userId: user.id,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        caption: s.caption,
        expiresAt,
      },
    });
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🌱 Seeding Gitgram database...');

  console.log('  • clearing seeded content tables');
  await clearAll();

  console.log('  • users + accounts');
  const { userByName, accountByName } = await seedUsers();

  console.log('  • repositories + accounts');
  const { repoByFullName } = await seedRepositories();

  console.log('  • posts + hashtags');
  const postIds = await seedPosts(accountByName, userByName, repoByFullName);

  console.log('  • follows');
  await seedFollows(accountByName, userByName);

  console.log('  • starred repos');
  await seedStars(accountByName, userByName, repoByFullName);

  console.log('  • collections + saved posts');
  await seedCollections(accountByName, userByName, postIds);

  console.log('  • stories');
  await seedStoriesStep(accountByName, userByName);

  console.log(
    `✅ Seed complete: ${USERS.length} users, ${REPOS.length} repos, ` +
      `${POSTS.length} posts, ${FOLLOWS.length} follows, ${STARS.length} stars, ` +
      `${COLLECTIONS.length} collections, ${STORIES.length} stories.`,
  );
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
