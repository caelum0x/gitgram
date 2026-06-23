import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { CopyLinkButton } from './CopyLinkButton';

type Paragraph =
  | { type: 'text'; text: string }
  | { type: 'bold-lead'; bold: string; rest: string }
  | { type: 'code'; lang: string; code: string };

interface Section {
  heading: string;
  id: string;
  paragraphs: Paragraph[];
}

interface ArticleData {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  authorRole: string;
  date: string;
  readTime: string;
  tags: string[];
  gradient: string;
  sections: Section[];
}

const articles: ArticleData[] = [
  {
    slug: 'how-ai-agents-changed-our-git-workflow',
    title: 'How AI Agents Changed Our Git Workflow Forever',
    excerpt:
      'When we started letting Claude and GPT make commits autonomously, everything we thought we knew about version control broke down.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'June 15, 2026',
    readTime: '8 min read',
    tags: ['Engineering', 'AI', 'Git'],
    gradient: 'from-blue-900/60 via-purple-900/40 to-pink-900/20',
    sections: [
      {
        heading: 'The Night Everything Broke',
        id: 'the-night-everything-broke',
        paragraphs: [
          {
            type: 'text',
            text: 'It was 2:17 AM when our CI pipeline went completely silent. Not red — silent. No failures, no successes. Just nothing. We had been running Claude Code autonomously on our main branch for six days straight, averaging about 35 pull requests per day. The agent was doing everything right by every metric we had set up: tests passed, linting was clean, type-checks succeeded. But somewhere around PR #211, the agent had started writing code that was syntactically and semantically correct yet architecturally catastrophic. It had refactored our entire event bus into a polling loop. Correct polling, mind you. But polling.',
          },
          {
            type: 'text',
            text: 'The problem was not the code. The problem was that we had no way to understand when this decision had been made, why it had seemed reasonable at the time, and what state the agent was in when it made the call. Traditional git gives you a commit graph. It does not give you an agent\'s cognitive context.',
          },
        ],
      },
      {
        heading: 'What Git Was Never Built For',
        id: 'what-git-was-never-built-for',
        paragraphs: [
          {
            type: 'text',
            text: 'Git was designed around a fundamental assumption: a human developer makes a change, understands what they did, and writes a message explaining it. Every piece of git\'s UX — commit messages, blame, log, bisect — exists to help humans understand human decisions. AI agents demolish this assumption entirely.',
          },
          {
            type: 'text',
            text: 'An agent running at 35 PRs per day is making tens of thousands of micro-decisions. It does not pause to contemplate the architectural implications of replacing an event bus with a polling mechanism. It solves the immediate problem it has been given, passes the tests that have been defined, and moves on. The git log becomes a forensic record of symptoms, not causes.',
          },
          {
            type: 'bold-lead',
            bold: 'Contextual drift.',
            rest: ' The agent\'s understanding of the codebase shifts over time as it reads and writes files. By PR #150, the agent was operating with a mental model of the system that was 40% different from reality. Git shows you every individual change but gives you no way to reconstruct that accumulated divergence.',
          },
          {
            type: 'bold-lead',
            bold: 'Invisible state.',
            rest: ' The agent\'s behavior is shaped by environment variables, temporary files, cached tool outputs, and the precise state of the filesystem at each moment. None of this is in git. When we tried to reproduce a bug, we could reset the code but not the environment.',
          },
          {
            type: 'bold-lead',
            bold: 'Atomicity mismatch.',
            rest: ' An agent\'s atomic unit of work is a complete thought, which might span twenty files, three configuration changes, and a schema migration. Git\'s atomic unit is a commit, which may capture half a thought or three thoughts mushed together.',
          },
        ],
      },
      {
        heading: 'Building the Missing Layer',
        id: 'building-the-missing-layer',
        paragraphs: [
          {
            type: 'text',
            text: 'AITM started as an internal debugging tool. We needed to answer one question: what exactly was true about this repository at 2:17 AM on Tuesday? Not just which files contained which bytes, but what environment variables were set, what the terminal history looked like, what configuration the agent was using, and what the filesystem state was below the git root.',
          },
          {
            type: 'text',
            text: 'We built a checkpointing system that captures a complete snapshot of development state every time an agent starts a new task. Each checkpoint includes the git tree hash, the full filesystem diff from the previous checkpoint, all environment variables, terminal command history, and the AI conversation context that preceded the checkpoint. The result is something closer to a flight data recorder than a version control system.',
          },
        ],
      },
      {
        heading: 'The Bisect That Actually Works',
        id: 'the-bisect-that-actually-works',
        paragraphs: [
          {
            type: 'text',
            text: 'Git bisect is a beautiful tool for human-authored codebases. Run a test, mark good or bad, repeat. But it assumes you can reproduce any commit\'s behavior by checking it out. With AI agents, that assumption fails because the behavior depends on the entire development environment, not just the source files.',
          },
          {
            type: 'text',
            text: 'AITM\'s bisect command restores the complete environment snapshot, not just the file state. When you mark a checkpoint as "bad", it resets the filesystem, environment variables, and agent context to exactly that moment. We found the polling-loop PR using this in under four minutes. The agent had received a tool response with a malformed JSON payload and, instead of erroring, had silently adapted its architecture to work around the broken data format. That adaptation was correct given the bad data. We fixed the tool, not the agent.',
          },
        ],
      },
      {
        heading: 'What We Changed in Our Workflow',
        id: 'what-we-changed',
        paragraphs: [
          {
            type: 'text',
            text: 'Six months of running autonomous agents has produced a set of workflow principles we now consider non-negotiable.',
          },
          {
            type: 'bold-lead',
            bold: 'Checkpoint before every agent session.',
            rest: ' Not every commit — every agent invocation. We use "aitm checkpoint --auto" wired into our MCP server configuration so Claude Code creates a named checkpoint before starting any task.',
          },
          {
            type: 'bold-lead',
            bold: 'Name your checkpoints semantically.',
            rest: ' "aitm checkpoint before-payment-refactor" is infinitely more useful than a timestamp. The agent has access to these labels and can use them to orient itself.',
          },
          {
            type: 'bold-lead',
            bold: 'Treat restore as a first-class operation.',
            rest: ' We instrumented our metrics to track how often developers use "aitm undo". It is not a failure metric — it is a velocity metric. Teams that restore aggressively iterate faster because they are not afraid to let agents try risky changes.',
          },
          {
            type: 'bold-lead',
            bold: 'Separate agent context from code state.',
            rest: ' The AI conversation that produced a change is as important as the change itself. AITM stores this separately from the code diff, so you can read the agent\'s reasoning even if you never intend to restore the state.',
          },
          {
            type: 'text',
            text: 'The two-AM CI silence still happens occasionally. But now when it does, we can travel back to exactly the moment before it went wrong, understand precisely what the agent was doing, and fix the actual problem rather than its downstream symptoms. That capability has changed how fearless we are willing to be with autonomous development.',
          },
        ],
      },
    ],
  },
  {
    slug: '35-prs-a-day-claude-gpt-simultaneously',
    title: '35 PRs a Day: Running Claude and GPT Simultaneously in Production',
    excerpt:
      'We run two competing AI agents on the same codebase simultaneously. This is the architecture, the chaos, and why deterministic restore makes it actually work.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'June 10, 2026',
    readTime: '12 min read',
    tags: ['AI', 'Product', 'Engineering'],
    gradient: 'from-violet-900/60 via-blue-900/40 to-cyan-900/20',
    sections: [
      {
        heading: 'Why Two Agents?',
        id: 'why-two-agents',
        paragraphs: [
          {
            type: 'text',
            text: 'The decision to run Claude and GPT-4o simultaneously on our main codebase was not born from a desire to be interesting. It was born from a specific failure we kept observing: single-agent blindspots. Every large language model has consistent failure modes. Claude tends to over-engineer abstractions. GPT tends to under-document. Neither is wrong — they are different tools with different strengths.',
          },
          {
            type: 'text',
            text: 'When you run both, you get natural error correction. Claude writes an elegant abstraction layer. GPT writes a working but simpler alternative. Our job shifts from writing code to evaluating two implementations and selecting the better one. On a good day, this feels like having two senior engineers who never sleep.',
          },
        ],
      },
      {
        heading: 'The Architecture',
        id: 'the-architecture',
        paragraphs: [
          {
            type: 'text',
            text: 'Each agent operates on its own branch, forked from main at the start of each task cycle. We use a custom orchestrator — built on top of AITM\'s MCP server — that assigns tasks from our Jira backlog to both agents simultaneously. Each agent works independently, creates a PR, and our CI runs the full test suite.',
          },
          {
            type: 'text',
            text: 'We then have a third agent (also Claude, but configured as a code reviewer rather than an implementer) that reads both PRs and writes a comparative analysis. The analysis covers correctness, test coverage, readability, performance implications, and architectural fit. This comparative review takes about 40 seconds and surfaces differences a human reviewer would spend 20 minutes finding.',
          },
          {
            type: 'text',
            text: 'The human engineer makes the final merge decision. Crucially, this is not rubber-stamping — the comparative review actually makes the decision harder because you are often choosing between two genuinely good approaches.',
          },
        ],
      },
      {
        heading: 'Checkpoint Strategy for Multi-Agent Work',
        id: 'checkpoint-strategy',
        paragraphs: [
          {
            type: 'text',
            text: 'Running two agents on the same codebase requires a rigorous checkpointing strategy. Each agent gets its own checkpoint namespace in AITM, prefixed with the agent identifier. When agent A finishes a task, its final state is checkpointed as "claude/task-XYZ-complete". When agent B finishes, it is "gpt/task-XYZ-complete".',
          },
          {
            type: 'text',
            text: 'This naming convention lets us do something powerful: environment diffing across agents. We can run "aitm diff" between the two agent checkpoints to see not just the code differences but the full environmental differences — which files were touched in what order, what tool calls were made, what the intermediate states looked like.',
          },
          {
            type: 'text',
            text: 'This diff has repeatedly shown us why two agents arrived at different implementations. Claude often touches the types first, then the implementation, then the tests. GPT tends to write tests first. These ordering differences produce different mental models of the problem, which produce different code.',
          },
        ],
      },
      {
        heading: 'What 35 PRs Per Day Looks Like',
        id: 'what-35-prs-looks-like',
        paragraphs: [
          {
            type: 'text',
            text: 'On a typical Tuesday, our orchestrator runs from 8 AM to 6 PM with a 10-minute break every two hours to let the human reviewers process the queue. Each agent handles roughly 8 to 10 tasks per day. About 70% of tasks produce a PR from both agents. About 15% produce a PR from only one agent — the other hit an unrecoverable error or a context limit. About 15% produce no mergeable output from either agent, which tells us the task was under-specified.',
          },
          {
            type: 'text',
            text: 'Of the PRs that pass CI, roughly 60% are merged on the day they are created. Another 25% are merged the following day after a human adds clarifying tests. The remaining 15% are closed, either because neither implementation was satisfactory or because the task became obsolete. Net result: we ship about 22 production features per day with a two-person engineering team.',
          },
        ],
      },
      {
        heading: 'The Disasters and What We Learned',
        id: 'disasters-and-lessons',
        paragraphs: [
          {
            type: 'bold-lead',
            bold: 'Incident 1: Schema migration race.',
            rest: ' Both agents independently decided to add a deleted_at column to the users table on the same day. The migrations conflicted at deploy time. Fix: we now maintain a reserved migration numbers list that agents must check before generating a migration file.',
          },
          {
            type: 'bold-lead',
            bold: 'Incident 2: Test helper divergence.',
            rest: ' One agent rewrote a shared test helper to be more expressive. The other rewrote the same helper to be more performant. Both passed CI individually. Together, they broke 40 tests. Fix: test helpers now require human approval before an agent can modify them.',
          },
          {
            type: 'bold-lead',
            bold: 'Incident 3: Documentation wars.',
            rest: ' The two agents had different opinions about how a particular API should be documented. Over three days, they kept overwriting each other\'s work. Fix: each module now has a designated documentation agent for the sprint.',
          },
          {
            type: 'bold-lead',
            bold: 'Incident 4: The philosophical disagreement.',
            rest: ' Claude decided our error handling should use a Result type pattern. GPT decided it should use try-catch with typed error classes. Both made sweeping changes across 60 files. The CI was chaos for two days. Fix: architectural decisions now require human sign-off before agents can propagate them beyond a single file.',
          },
        ],
      },
    ],
  },
  {
    slug: 'deterministic-restore-why-rollback-matters',
    title: 'Deterministic Restore: Why Rollback Matters More Than Commit',
    excerpt:
      'The entire industry has optimized for committing fast. We think that is backwards. In an agentic world, the ability to restore deterministically is the most important primitive.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'June 5, 2026',
    readTime: '10 min read',
    tags: ['Engineering', 'Tutorials'],
    gradient: 'from-emerald-900/60 via-teal-900/40 to-blue-900/20',
    sections: [
      {
        heading: 'The Commit Fetish',
        id: 'the-commit-fetish',
        paragraphs: [
          {
            type: 'text',
            text: 'The software industry has spent thirty years optimizing for one thing: making it easier to commit code. Continuous integration, trunk-based development, feature flags, pull request automation — all of it is infrastructure for getting changes into production faster. We have built an entire culture around the velocity of forward progress.',
          },
          {
            type: 'text',
            text: 'This is completely rational for human developers. Humans are expensive, thoughtful, and slow. When a human decides to make a change, that decision has already been filtered through years of experience, context, and professional judgment. The bottleneck is the time it takes to express that decision in code. So we optimize for fast commits. AI agents break this entirely. An agent commits at whatever rate the hardware allows. The bottleneck is not expression — it is judgment.',
          },
        ],
      },
      {
        heading: 'Determinism as a Design Principle',
        id: 'determinism-as-design-principle',
        paragraphs: [
          {
            type: 'text',
            text: 'When we designed AITM\'s restore system, we made one commitment above all others: every restore must be perfectly deterministic. If you restore checkpoint #143 today and restore checkpoint #143 six months from now, you must get byte-for-byte identical results.',
          },
          {
            type: 'text',
            text: 'This sounds obvious but is surprisingly difficult. Most backup systems are eventually consistent — they make best-effort attempts to restore a state that was never captured atomically in the first place. AITM captures state atomically by treating each checkpoint as a content-addressable snapshot of the entire development environment, hashed and signed at creation time.',
          },
          {
            type: 'text',
            text: 'The hash covers file contents, file permissions, symbolic links, environment variables (with configurable exclusions for secrets), and terminal history. The signature ensures you can detect any tampering or corruption. When you run "aitm restore #143", you get exactly what was there at checkpoint #143, or the command fails with an explicit error.',
          },
        ],
      },
      {
        heading: 'The Atomic Backup Protocol',
        id: 'atomic-backup-protocol',
        paragraphs: [
          {
            type: 'text',
            text: 'Creating a checkpoint is a two-phase operation. In phase one, AITM creates a content snapshot by reading all files and computing their hashes. This phase is read-only and safe to interrupt at any time — a partial phase-one checkpoint is simply discarded. In phase two, AITM writes the snapshot manifest to its local store and, if cloud sync is enabled, uploads new content blocks to the remote.',
          },
          {
            type: 'text',
            text: 'Blocks are deduplicated by hash, so a large checkpoint that differs from the previous by only three files takes roughly the time and space of those three files. Restore is the inverse: files are written to a temporary staging area, verified against their stored hashes, and then atomically swapped into place. If the verification fails at any point, the restore aborts and the original state is preserved.',
          },
        ],
      },
      {
        heading: 'Why Restore Velocity Matters More Than Commit Velocity',
        id: 'why-restore-velocity-matters',
        paragraphs: [
          {
            type: 'text',
            text: 'Here is the mental model shift that changed how we think about AI-native development: instead of asking "how fast can we commit?", ask "how fast can we safely experiment?" Fast experiment speed requires fast restore speed.',
          },
          {
            type: 'text',
            text: 'If restoring a bad state takes 20 minutes of manual work — reverting commits, resetting environment variables, re-seeding databases — you will be conservative about what you let agents attempt. If restoring a bad state takes 3 seconds with "aitm undo", you will give agents ambitious, high-reward tasks because the downside of failure is negligible.',
          },
          {
            type: 'text',
            text: 'We measured this on our own team. Before AITM, our average agent task scope was 3 files and 2 hours of estimated work. After implementing AITM with sub-5-second restore, our average agent task scope grew to 12 files and 8 hours of estimated work. We became dramatically more ambitious with what we asked agents to do, because we knew we could always go back.',
          },
        ],
      },
      {
        heading: 'Getting Started with Deterministic Restore',
        id: 'getting-started',
        paragraphs: [
          {
            type: 'text',
            text: 'If you want to start using AITM\'s restore system today, the setup takes about three minutes. Install the CLI with "npm install -g aitimemachine", run "aitm init" in your project root, and create your first checkpoint with "aitm checkpoint initial-state".',
          },
          {
            type: 'code',
            lang: 'json',
            code: '{\n  "hooks": {\n    "pre_session": "aitm checkpoint --auto"\n  }\n}',
          },
          {
            type: 'text',
            text: 'Add the hook above to your Claude Code or Cursor configuration to ensure you always have a clean restore point before an agent starts work. When something goes wrong — and it will — "aitm undo" gets you back to that point instantly. Start simple. Get the restore reflex first. The rest builds on top of it.',
          },
        ],
      },
    ],
  },
  {
    slug: 'aitm-2-architecture-agent-safe-version-control',
    title: 'AITM 2.0: The Architecture Behind Agent-Safe Version Control',
    excerpt:
      'A deep dive into how we rebuilt AITM\'s core storage engine to handle the throughput of autonomous agents while keeping every checkpoint atomic and inspectable.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'May 28, 2026',
    readTime: '15 min read',
    tags: ['Engineering', 'Product'],
    gradient: 'from-orange-900/60 via-red-900/40 to-pink-900/20',
    sections: [
      {
        heading: 'Why We Had to Rebuild the Storage Engine',
        id: 'why-rebuild',
        paragraphs: [
          {
            type: 'text',
            text: 'AITM 1.0 used a simple append-only log with SQLite for metadata. This worked beautifully for human-paced development: a developer makes a few checkpoints per hour, the log stays manageable, queries are fast. When we started running autonomous agents at 35 PRs per day, the storage engine collapsed under its own weight.',
          },
          {
            type: 'text',
            text: 'The core problem was snapshot granularity. Each agent invocation generated dozens of micro-checkpoints — before tool calls, after tool calls, before file writes, after file writes. A full workday of agent activity produced 800 to 1,200 checkpoint events. SQLite, with its single-writer model, became the bottleneck. Checkpoint creation went from 40ms to 4 seconds under load. Agents started timing out waiting for the checkpoint to complete. We needed a storage architecture designed for concurrent, high-frequency writes with atomic reads.',
          },
        ],
      },
      {
        heading: 'Content-Addressable Object Store',
        id: 'content-addressable-store',
        paragraphs: [
          {
            type: 'text',
            text: 'The new storage engine is a content-addressable object store — conceptually similar to git\'s object database but optimized for full environment snapshots rather than source trees. Every file, every environment variable set, every terminal command sequence is stored as a content-addressed blob, keyed by the SHA-256 hash of its contents.',
          },
          {
            type: 'bold-lead',
            bold: 'Deduplication is automatic.',
            rest: ' If 95% of files are unchanged between two checkpoints, the new checkpoint stores only the 5% that changed. We observed a 40x reduction in storage usage compared to AITM 1.0 for agent-heavy workloads.',
          },
          {
            type: 'bold-lead',
            bold: 'Integrity is verifiable.',
            rest: ' Every blob has a hash. The manifest has a hash. You can verify the integrity of any checkpoint without trusting the storage backend. This matters for compliance scenarios where customers need proof that historical states have not been tampered with.',
          },
          {
            type: 'bold-lead',
            bold: 'Concurrent writes are safe.',
            rest: ' Writing a blob is a pure function of its content. Two concurrent writers writing the same content produce the same key. No locks needed for the write path.',
          },
        ],
      },
      {
        heading: 'The Manifest Format',
        id: 'manifest-format',
        paragraphs: [
          {
            type: 'text',
            text: 'A AITM 2.0 checkpoint manifest is a structured document with five sections. Meta contains the checkpoint ID (ULID for chronological ordering), creation timestamp, agent identifier if applicable, parent checkpoint ID, and the signing key fingerprint.',
          },
          {
            type: 'text',
            text: 'Tree is a sorted list of (path, hash, mode) tuples covering every tracked file. Environment is a list of (key, hash) tuples for environment variables — actual values are stored as encrypted blobs. Terminal contains a reference to the terminal history blob for the period since the previous checkpoint. Context is an optional reference to a conversation context blob, used when the checkpoint was created by an AI agent.',
          },
          {
            type: 'text',
            text: 'Total manifest size for a typical checkpoint is 4 to 12 KB. The referenced blobs are typically 200 KB to 2 MB, depending on project size and the number of changed files.',
          },
        ],
      },
      {
        heading: 'Restore Performance Engineering',
        id: 'restore-performance',
        paragraphs: [
          {
            type: 'text',
            text: 'Our target for restore latency was 500ms for projects under 100 MB and 3 seconds for projects under 1 GB. Achieving this required careful engineering at every layer.',
          },
          {
            type: 'bold-lead',
            bold: 'Parallel file restoration.',
            rest: ' The restore engine reads the manifest, identifies all files that differ from the current state, and dispatches their restoration in parallel using a thread pool sized to the number of CPU cores. Files are written to a temp directory first, then atomically moved to their final paths.',
          },
          {
            type: 'bold-lead',
            bold: 'Incremental delta loading.',
            rest: ' Rather than re-downloading all blob data for a restore, the engine first checks which blobs are already in the local cache. Only missing blobs are fetched from cloud storage. For restores of recent checkpoints, the cache hit rate is typically above 90%.',
          },
          {
            type: 'bold-lead',
            bold: 'Copy-on-write for large files.',
            rest: ' Files larger than 10 MB use a copy-on-write strategy backed by OS-level reflinks on supported filesystems. This allows large binaries and compiled artifacts to be "restored" in microseconds, with the actual copy deferred until the file is modified.',
          },
          {
            type: 'text',
            text: 'In production, our p50 restore latency is 340ms. Our p99 is 2.1 seconds, on projects up to 800 MB.',
          },
        ],
      },
      {
        heading: 'MCP Integration Design',
        id: 'mcp-integration-design',
        paragraphs: [
          {
            type: 'text',
            text: 'The biggest architectural decision in AITM 2.0 was making the MCP server a first-class component rather than an afterthought. In AITM 1.0, the MCP server was a thin wrapper around the CLI. In AITM 2.0, the MCP server is the canonical interface to the storage engine, and the CLI is a wrapper around the MCP server.',
          },
          {
            type: 'text',
            text: 'This inversion matters because it gives AI agents the same capabilities as human developers, with the same atomicity guarantees. An agent calling the create_checkpoint MCP tool gets the same content-addressed, signed, deduplicated checkpoint as a developer running "aitm checkpoint" from the terminal.',
          },
          {
            type: 'text',
            text: 'The MCP tool surface is intentionally minimal: create_checkpoint, restore_checkpoint, list_checkpoints, diff_checkpoints, and search_checkpoints. Everything else is built on top of these five primitives. This minimalism makes it easy for agents to reason about the tool interface and reduces the surface area for misuse.',
          },
        ],
      },
    ],
  },
  {
    slug: 'from-github-to-gitgram-social-layer-for-developers',
    title: 'From GitHub to Gitgram: The Next Social Layer for Developers',
    excerpt:
      'GitHub turned repositories into products. Gitgram turns them into profiles. Here is the vision for a social network where your commit history is your portfolio.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'May 20, 2026',
    readTime: '7 min read',
    tags: ['Product', 'AI'],
    gradient: 'from-pink-900/60 via-purple-900/40 to-indigo-900/20',
    sections: [
      {
        heading: 'What GitHub Got Right, and What It Left on the Table',
        id: 'what-github-got-right',
        paragraphs: [
          {
            type: 'text',
            text: 'GitHub\'s genius was the social graph around code. Stars, forks, issues — these turned a collaboration tool into a discovery platform. You could find a developer\'s entire public portfolio by looking at their profile. You could discover new libraries by seeing what people you respected were starring. The social layer made the technical layer more navigable.',
          },
          {
            type: 'text',
            text: 'But GitHub\'s social features were designed for a world where humans write code. The social unit is the repository, and the repository\'s story is told through commit messages, README files, and issue threads. In a world where AI agents make most of the commits, these artifacts no longer tell a coherent story about the human developer behind the keyboard.',
          },
        ],
      },
      {
        heading: 'Repositories as Social Objects',
        id: 'repositories-as-social-objects',
        paragraphs: [
          {
            type: 'text',
            text: 'On Gitgram, a repository is not a bucket of files with a history attached. It is a living document of a developer\'s intent and execution. The feed for a repository looks more like a TikTok creator\'s profile than a GitHub repository: you see the outcomes, the progression, the story of how the thing was built.',
          },
          {
            type: 'text',
            text: 'Each AITM checkpoint becomes a "moment" in the repository\'s timeline. Moments can be shared, reacted to, and commented on. Watching a developer\'s repository go from an empty scaffold to a working product — moment by moment — is genuinely interesting content. We have found that developers spend an average of 8 minutes on a repository\'s timeline during their first visit, compared to 90 seconds on GitHub.',
          },
        ],
      },
      {
        heading: 'The AI-Native Profile',
        id: 'ai-native-profile',
        paragraphs: [
          {
            type: 'text',
            text: 'A developer\'s Gitgram profile surfaces something GitHub never could: their effectiveness as an agent orchestrator. The metrics that matter are not lines of code written or commits made — they are outcomes delivered, agents deployed, and systems shipped.',
          },
          {
            type: 'text',
            text: 'Your profile shows the repositories you have steered, the velocity you maintain, the types of problems you tend to tackle, and the tools you use. It shows how you collaborate with AI: do you give agents large, ambitious tasks or small, constrained ones? Do you restore frequently (high experimentation rate) or rarely (high precision)? These patterns reveal genuine engineering judgment that lines-of-code metrics never could.',
          },
        ],
      },
      {
        heading: 'Open Source as Content',
        id: 'open-source-as-content',
        paragraphs: [
          {
            type: 'text',
            text: 'The deepest bet Gitgram makes is that open source development is inherently interesting content. Not the final product — the making of it. The struggle, the false starts, the architectural pivots, the moments where everything clicked. AITM makes this content capturable. Every checkpoint is a frame in the story.',
          },
          {
            type: 'text',
            text: 'We have seen solo developers build audiences of 50,000 followers by sharing the development of a non-trivial side project over six weeks. Not because they are famous, but because watching a skilled developer — human and AI working together — build something real is genuinely compelling. Open source is not dead. It is about to become the most interesting content on the internet.',
          },
        ],
      },
    ],
  },
  {
    slug: 'pal-mcp-python-sandbox-for-ai-agents',
    title: 'PAL MCP: Giving Your AI Agent a Python Sandbox',
    excerpt:
      'PAL (Python Agent Layer) is our MCP server that gives AI agents a safe, deterministic Python execution environment. Setup with Claude Code in under 5 minutes.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'May 12, 2026',
    readTime: '6 min read',
    tags: ['Tutorials', 'AI', 'Engineering'],
    gradient: 'from-cyan-900/60 via-blue-900/40 to-violet-900/20',
    sections: [
      {
        heading: 'The Problem with Agents Running Raw Python',
        id: 'problem-with-raw-python',
        paragraphs: [
          {
            type: 'text',
            text: 'Every AI agent that can write Python can, in principle, delete your home directory, make network requests to arbitrary endpoints, and consume all available CPU and memory. Most developers understand this in the abstract but still run agents with unrestricted Python execution because the alternative — carefully sandboxed execution — has historically been too slow and too restrictive to be useful.',
          },
          {
            type: 'text',
            text: 'PAL MCP changes this. It provides a Python execution environment that is fast enough for real work (median execution latency under 200ms), restrictive enough to prevent unintended side effects, and integrated with AITM so every execution is checkpointed and reversible.',
          },
        ],
      },
      {
        heading: 'How PAL Works',
        id: 'how-pal-works',
        paragraphs: [
          {
            type: 'text',
            text: 'PAL uses a combination of operating system namespaces and seccomp-bpf syscall filtering to create a lightweight sandbox for each Python execution. Unlike container-based sandboxes, PAL\'s sandbox starts in under 10ms because it does not need to boot a container runtime. The Python interpreter is pre-warmed and forked for each execution.',
          },
          {
            type: 'text',
            text: 'The sandbox provides a controlled filesystem view: read access to the project directory by default, write access to a designated workspace directory, and no access to the rest of the system. Network access is configurable — you can allow all outbound connections, restrict to specific hosts, or disable networking entirely. Each execution gets a fresh Python environment with a configurable set of pre-installed packages.',
          },
        ],
      },
      {
        heading: 'Installation and Claude Code Setup',
        id: 'installation-setup',
        paragraphs: [
          {
            type: 'text',
            text: 'Installing PAL takes three commands: "npm install -g aitimemachine", "aitm pal install", then "aitm pal start". The pal install command downloads the sandbox binary and installs the system dependencies. The pal start command starts the PAL MCP server and prints its socket path.',
          },
          {
            type: 'code',
            lang: 'json',
            code: '{\n  "mcpServers": {\n    "pal": {\n      "transport": "unix",\n      "path": "~/.aitm/pal.sock"\n    }\n  }\n}',
          },
          {
            type: 'text',
            text: 'Add the configuration above to your Claude Code settings. Restart Claude Code and the agent will have access to the python_execute, python_install_package, and python_list_files tools. The agent can now write and run Python code safely, with every execution checkpointed to AITM.',
          },
        ],
      },
      {
        heading: 'Configuring the Sandbox Policy',
        id: 'configuring-sandbox-policy',
        paragraphs: [
          {
            type: 'text',
            text: 'PAL\'s sandbox policy is configured in ~/.aitm/pal.toml. The default policy is conservative: filesystem write access is limited to ~/.aitm/pal-workspace/, network access is disabled, and execution time is limited to 30 seconds. For data science workflows, you can broaden access. For security-sensitive environments, you can tighten things further — restricting memory, disabling network entirely, and limiting execution time to 10 seconds.',
          },
          {
            type: 'code',
            lang: 'toml',
            code: '[sandbox]\nfilesystem_read = ["$PROJECT_ROOT", "$HOME/data"]\nfilesystem_write = ["$HOME/pal-workspace"]\nnetwork = "outbound"\ntimeout_seconds = 120\n\n[packages]\npreinstalled = ["numpy", "pandas", "matplotlib", "requests"]',
          },
          {
            type: 'text',
            text: 'The policy is hot-reloaded — changes take effect on the next execution without restarting the server.',
          },
        ],
      },
      {
        heading: 'Integrating with AITM Checkpoints',
        id: 'integrating-with-aitm',
        paragraphs: [
          {
            type: 'text',
            text: 'PAL integrates with AITM automatically when both are running. Before each Python execution, PAL checks whether a checkpoint exists for the current workspace state. If not, it creates one. If the execution produces an error or the agent marks it as problematic, the workspace can be restored to its pre-execution state with "aitm undo".',
          },
          {
            type: 'text',
            text: 'This integration is particularly valuable for data transformation pipelines where an agent might run dozens of sequential Python scripts to process a dataset. Each script\'s execution is checkpointed, so if a script halfway through corrupts the output data, you can restore to the exact state before that script ran and try a different approach.',
          },
          {
            type: 'text',
            text: 'The combination of a safe execution environment and deterministic restore means you can give agents genuinely powerful Python capabilities without the anxiety of wondering what they might accidentally break. The sandbox prevents most accidental damage. AITM reverses the rest.',
          },
        ],
      },
    ],
  },
];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return {};
  return {
    title: `${article.title} — AITM Blog`,
    description: article.excerpt,
  };
}

const categoryColors: Record<string, string> = {
  Engineering: 'bg-blue-500/20 text-blue-300 border-blue-700/50',
  Product: 'bg-purple-500/20 text-purple-300 border-purple-700/50',
  AI: 'bg-pink-500/20 text-pink-300 border-pink-700/50',
  Tutorials: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/50',
  Git: 'bg-orange-500/20 text-orange-300 border-orange-700/50',
};

function ParagraphBlock({ para }: { para: Paragraph }) {
  if (para.type === 'code') {
    return (
      <pre className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto text-sm text-green-300 font-mono leading-relaxed">
        <code>{para.code}</code>
      </pre>
    );
  }
  if (para.type === 'bold-lead') {
    return (
      <p className="text-gray-300 leading-relaxed">
        <strong className="text-white">{para.bold}</strong>
        {para.rest}
      </p>
    );
  }
  return <p className="text-gray-300 leading-relaxed">{para.text}</p>;
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    notFound();
  }

  const relatedArticles = articles
    .filter(
      (a) =>
        a.slug !== article.slug &&
        a.tags.some((t) => article.tags.includes(t))
    )
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero banner */}
      <div className={`relative bg-gradient-to-br ${article.gradient}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-950" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>

          <div className="flex flex-wrap gap-2 mb-5">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className={`text-xs px-3 py-1 rounded-full border ${categoryColors[tag] ?? 'bg-gray-700/50 text-gray-300 border-gray-600'}`}
              >
                {tag}
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-6 max-w-4xl">
            {article.title}
          </h1>

          <p className="text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed">
            {article.excerpt}
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                {article.author[0]}
              </div>
              <div>
                <p className="font-semibold">{article.author}</p>
                <p className="text-sm text-gray-400">{article.authorRole}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {article.date}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {article.readTime}
              </span>
            </div>

            <CopyLinkButton />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-12 items-start">
          {/* Article body */}
          <article className="flex-1 min-w-0">
            {article.sections.map((section) => (
              <section key={section.id} id={section.id} className="mb-12">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-5 pb-3 border-b border-gray-800">
                  {section.heading}
                </h2>
                <div className="space-y-5">
                  {section.paragraphs.map((para, i) => (
                    <ParagraphBlock key={i} para={para} />
                  ))}
                </div>
              </section>
            ))}

            {/* Author card */}
            <div className="mt-12 p-6 bg-gray-900/50 border border-gray-800 rounded-2xl flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold shrink-0">
                {article.author[0]}
              </div>
              <div>
                <p className="font-semibold text-white">{article.author}</p>
                <p className="text-sm text-blue-400 mb-2">{article.authorRole}</p>
                <p className="text-sm text-gray-400">
                  Building the version control infrastructure for the age of autonomous AI agents.
                  Previously built developer tools at several early-stage startups.
                </p>
              </div>
            </div>
          </article>

          {/* Table of contents sidebar */}
          <aside className="hidden lg:block w-60 shrink-0 sticky top-24">
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                On this page
              </p>
              <nav className="space-y-2">
                {article.sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block text-sm text-gray-400 hover:text-white transition-colors py-1 leading-snug"
                  >
                    {section.heading}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </div>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <section className="border-t border-gray-800 bg-gray-900/30 py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold mb-8">Related Articles</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedArticles.map((related) => (
                <Link
                  key={related.slug}
                  href={`/blog/${related.slug}`}
                  className="group bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-all"
                >
                  <div className={`h-24 bg-gradient-to-br ${related.gradient}`} />
                  <div className="p-5">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {related.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors leading-snug mb-2">
                      {related.title}
                    </h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {related.readTime}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all articles
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
