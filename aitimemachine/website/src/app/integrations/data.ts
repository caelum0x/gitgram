// ---------------------------------------------------------------------------
// Integration catalog
// ---------------------------------------------------------------------------
// Shared source of truth for the integrations directory and detail pages.
// ---------------------------------------------------------------------------

export type IntegrationCategory =
  | 'Editors'
  | 'AI Tools'
  | 'CI/CD'
  | 'Version Control'
  | 'Cloud';

export type IntegrationStatus = 'Available' | 'Coming Soon';

export interface SetupStep {
  title: string;
  description: string;
  code?: string;
  language?: string;
}

export interface Integration {
  slug: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  shortDescription: string;
  longDescription: string;
  /** Single-letter / short label used as a logo placeholder. */
  logo: string;
  /** Tailwind gradient classes for the logo placeholder background. */
  accent: string;
  features: string[];
  setupSteps: SetupStep[];
  docsUrl: string;
}

export const CATEGORIES: IntegrationCategory[] = [
  'Editors',
  'AI Tools',
  'CI/CD',
  'Version Control',
  'Cloud',
];

export const integrations: Integration[] = [
  // --- Editors -------------------------------------------------------------
  {
    slug: 'vs-code',
    name: 'VS Code',
    category: 'Editors',
    status: 'Available',
    logo: 'VS',
    accent: 'from-blue-500 to-sky-400',
    shortDescription:
      'Create and restore checkpoints without leaving your editor.',
    longDescription:
      'The AITM extension for Visual Studio Code surfaces your full restore timeline in a side panel. Checkpoint before risky AI edits, diff any two points in time, and roll back a file, a folder, or the whole workspace with a single click.',
    features: [
      'Inline restore timeline in the activity bar',
      'One-click checkpoint and rollback',
      'Visual diff between any two restore points',
      'Auto-checkpoint before AI agent edits',
    ],
    setupSteps: [
      {
        title: 'Install the extension',
        description:
          'Install AITimeMachine directly from the VS Code Marketplace, or from the command line.',
        code: 'code --install-extension aitimemachine.aitm',
        language: 'bash',
      },
      {
        title: 'Authenticate',
        description:
          'Open the command palette and run the sign-in command to link your account.',
        code: '> AITM: Sign In',
        language: 'text',
      },
      {
        title: 'Create your first checkpoint',
        description:
          'Open the AITM side panel and hit “Checkpoint”, or run it from the palette.',
        code: '> AITM: Create Checkpoint',
        language: 'text',
      },
    ],
    docsUrl: '/docs/quick-start',
  },
  {
    slug: 'cursor',
    name: 'Cursor',
    category: 'Editors',
    status: 'Available',
    logo: 'Cu',
    accent: 'from-zinc-400 to-zinc-200',
    shortDescription:
      'Checkpoint before every Cursor agent run and undo bad generations.',
    longDescription:
      'Cursor ships AI edits fast — AITM makes them safe. The VS Code-compatible extension installs cleanly into Cursor and auto-checkpoints before each Composer or agent run so a runaway generation is always one command away from being undone.',
    features: [
      'Works with the Cursor extension host',
      'Auto-checkpoint before Composer runs',
      'Restore a single agent edit or the whole batch',
      'Shared timeline with the AITM CLI',
    ],
    setupSteps: [
      {
        title: 'Install the extension',
        description:
          'Search for “AITimeMachine” in the Cursor extensions panel and install it.',
        code: 'cursor --install-extension aitimemachine.aitm',
        language: 'bash',
      },
      {
        title: 'Enable agent auto-checkpoint',
        description:
          'Turn on auto-checkpointing so AITM snapshots state before each agent run.',
        code: '> AITM: Enable Auto-Checkpoint',
        language: 'text',
      },
    ],
    docsUrl: '/docs/quick-start',
  },
  {
    slug: 'jetbrains',
    name: 'JetBrains',
    category: 'Editors',
    status: 'Coming Soon',
    logo: 'JB',
    accent: 'from-fuchsia-500 to-orange-400',
    shortDescription:
      'Native restore points for IntelliJ, PyCharm, WebStorm and more.',
    longDescription:
      'A first-class AITM plugin for the JetBrains family is in active development. It will hook into local history, the AI Assistant, and the VCS log so you can travel back through any AI-assisted change from inside the IDE.',
    features: [
      'Tool window with the full restore timeline',
      'Hooks into AI Assistant generations',
      'Per-module and per-file restore',
      'Bundled across the JetBrains IDE family',
    ],
    setupSteps: [
      {
        title: 'Join the early access list',
        description:
          'The JetBrains plugin is not yet published. Request early access and we will email you when the build is ready.',
      },
    ],
    docsUrl: '/docs',
  },
  {
    slug: 'neovim',
    name: 'Neovim',
    category: 'Editors',
    status: 'Available',
    logo: 'NV',
    accent: 'from-green-500 to-emerald-400',
    shortDescription:
      'A Lua plugin that drives the AITM CLI from inside Neovim.',
    longDescription:
      'The Neovim plugin wraps the AITM CLI in idiomatic Lua commands and a floating timeline picker. Checkpoint, list, and restore without leaving normal mode — ideal for terminal-first developers running AI agents in tmux.',
    features: [
      'Floating timeline picker',
      'Buffer-local checkpoint commands',
      'Telescope and fzf-lua integration',
      'Zero-config when the CLI is on your PATH',
    ],
    setupSteps: [
      {
        title: 'Install with lazy.nvim',
        description: 'Add the plugin spec to your lazy.nvim configuration.',
        code: "{ 'aitimemachine/aitm.nvim', config = true }",
        language: 'lua',
      },
      {
        title: 'Verify the CLI is installed',
        description: 'The plugin shells out to the AITM CLI, so install it first.',
        code: 'npm install -g @aitimemachine/cli',
        language: 'bash',
      },
      {
        title: 'Create a checkpoint',
        description: 'Run the user command from normal mode.',
        code: ':AITMCheckpoint',
        language: 'text',
      },
    ],
    docsUrl: '/docs/cli-reference',
  },

  // --- AI Tools ------------------------------------------------------------
  {
    slug: 'claude',
    name: 'Claude',
    category: 'AI Tools',
    status: 'Available',
    logo: 'Cl',
    accent: 'from-orange-500 to-amber-400',
    shortDescription:
      'Capture conversation context and checkpoint around every Claude edit.',
    longDescription:
      'AITM exposes an MCP server that Claude Code and Claude Desktop can call directly. Claude checkpoints before it touches a file and after it finishes, capturing the conversation context alongside the code so a restore brings back the full session — not just the diff.',
    features: [
      'Native MCP server (before_action / after_action)',
      'Conversation context captured per checkpoint',
      'Restore code and chat history together',
      'Works with Claude Code and Claude Desktop',
    ],
    setupSteps: [
      {
        title: 'Add the MCP server',
        description:
          'Register AITM as an MCP server in your Claude configuration.',
        code: 'claude mcp add aitm -- npx @aitimemachine/mcp',
        language: 'bash',
      },
      {
        title: 'Let Claude checkpoint automatically',
        description:
          'Add the before/after hooks to your project so Claude snapshots state around every change.',
        code: 'before_action({ action: "describe the change" })',
        language: 'text',
      },
    ],
    docsUrl: '/docs/quick-start',
  },
  {
    slug: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'AI Tools',
    status: 'Available',
    logo: 'Co',
    accent: 'from-slate-400 to-slate-200',
    shortDescription:
      'Auto-checkpoint around Copilot Chat and agent-mode edits.',
    longDescription:
      'When Copilot applies a suggestion or runs in agent mode, the AITM editor extension snapshots the workspace first. If a Copilot edit goes sideways, restore the exact pre-suggestion state in one command.',
    features: [
      'Snapshots before applying Copilot suggestions',
      'Agent-mode batch restore',
      'Pairs with the VS Code extension',
      'No Copilot configuration changes required',
    ],
    setupSteps: [
      {
        title: 'Install the AITM extension',
        description:
          'Copilot integration rides on the AITM editor extension. Install it first.',
        code: 'code --install-extension aitimemachine.aitm',
        language: 'bash',
      },
      {
        title: 'Enable suggestion checkpointing',
        description: 'Turn on checkpointing for applied AI suggestions.',
        code: '> AITM: Checkpoint On AI Edit',
        language: 'text',
      },
    ],
    docsUrl: '/docs/quick-start',
  },
  {
    slug: 'gemini-cli',
    name: 'Gemini CLI',
    category: 'AI Tools',
    status: 'Available',
    logo: 'Ge',
    accent: 'from-blue-500 to-indigo-400',
    shortDescription:
      'Wrap Gemini CLI runs so every agent change is restorable.',
    longDescription:
      'The AITM CLI wraps Gemini CLI invocations and checkpoints before and after each run. Combined with AITM session capture, you get a complete, restorable record of everything the Gemini agent touched.',
    features: [
      'Pre- and post-run checkpoints',
      'Captures the agent transcript',
      'Restore a single Gemini run',
      'Drop-in CLI wrapper',
    ],
    setupSteps: [
      {
        title: 'Install the AITM CLI',
        description: 'Install the CLI globally.',
        code: 'npm install -g @aitimemachine/cli',
        language: 'bash',
      },
      {
        title: 'Wrap your Gemini command',
        description: 'Prefix Gemini CLI runs with the AITM wrapper.',
        code: 'aitm run -- gemini "refactor the auth module"',
        language: 'bash',
      },
    ],
    docsUrl: '/docs/cli-reference',
  },
  {
    slug: 'openai',
    name: 'OpenAI',
    category: 'AI Tools',
    status: 'Coming Soon',
    logo: 'AI',
    accent: 'from-teal-500 to-emerald-400',
    shortDescription:
      'Checkpoint around the Codex CLI and the OpenAI Agents SDK.',
    longDescription:
      'Integration with the OpenAI Codex CLI and Agents SDK is on the roadmap. AITM will hook the tool-call boundary so every file the agent writes is wrapped in a restore point automatically.',
    features: [
      'Codex CLI run wrapping',
      'Agents SDK tool-call hooks',
      'Per-agent-run restore',
      'Transcript capture',
    ],
    setupSteps: [
      {
        title: 'Join the early access list',
        description:
          'This integration is in development. Request early access and we will let you know when it ships.',
      },
    ],
    docsUrl: '/docs',
  },

  // --- CI/CD ---------------------------------------------------------------
  {
    slug: 'github-actions',
    name: 'GitHub Actions',
    category: 'CI/CD',
    status: 'Available',
    logo: 'GA',
    accent: 'from-sky-500 to-blue-400',
    shortDescription:
      'Checkpoint your pipeline state with a single reusable action.',
    longDescription:
      'The AITM GitHub Action snapshots the workspace at any point in your pipeline — before a migration, after a build — so a failed deploy can be traced and restored from CI. Pairs with the GitHub integration to checkpoint before every AI-generated PR.',
    features: [
      'Reusable composite action',
      'Checkpoint before migrations and deploys',
      'Restore pipeline artifacts from a run',
      'Auto-checkpoint before AI PRs',
    ],
    setupSteps: [
      {
        title: 'Add the action to your workflow',
        description:
          'Reference the AITM action in any job step that should be checkpointed.',
        code: [
          '- name: AITM checkpoint',
          '  uses: aitimemachine/checkpoint-action@v1',
          '  with:',
          '    token: ${{ secrets.AITM_TOKEN }}',
        ].join('\n'),
        language: 'yaml',
      },
      {
        title: 'Add your token',
        description:
          'Create an AITM_TOKEN repository secret from your dashboard API keys.',
      },
    ],
    docsUrl: '/docs/deployment',
  },
  {
    slug: 'gitlab-ci',
    name: 'GitLab CI',
    category: 'CI/CD',
    status: 'Available',
    logo: 'GL',
    accent: 'from-orange-500 to-red-400',
    shortDescription:
      'Add a checkpoint job to your .gitlab-ci.yml in two lines.',
    longDescription:
      'Include the AITM CI template to add restore-point jobs to any GitLab pipeline. Checkpoint before risky stages and restore the exact pipeline state when a job fails downstream.',
    features: [
      'Includable CI template',
      'Stage-level checkpoints',
      'Restore failed pipeline state',
      'Works with GitLab.com and self-managed',
    ],
    setupSteps: [
      {
        title: 'Include the AITM template',
        description: 'Add the remote include to your .gitlab-ci.yml.',
        code: [
          'include:',
          "  - remote: 'https://cdn.aitimemachine.dev/ci/gitlab.yml'",
        ].join('\n'),
        language: 'yaml',
      },
      {
        title: 'Set your token',
        description:
          'Add AITM_TOKEN as a masked CI/CD variable in your project settings.',
      },
    ],
    docsUrl: '/docs/deployment',
  },
  {
    slug: 'circleci',
    name: 'CircleCI',
    category: 'CI/CD',
    status: 'Coming Soon',
    logo: 'CC',
    accent: 'from-zinc-400 to-zinc-200',
    shortDescription:
      'A CircleCI orb for checkpointing and restoring pipeline state.',
    longDescription:
      'An official AITM orb for CircleCI is on the way. It will add checkpoint and restore commands you can drop into any job, with built-in caching of restore points across workflow runs.',
    features: [
      'Official CircleCI orb',
      'Checkpoint and restore commands',
      'Cross-workflow restore caching',
      'Context-based token management',
    ],
    setupSteps: [
      {
        title: 'Join the early access list',
        description:
          'The orb is not yet published. Request early access to test the beta.',
      },
    ],
    docsUrl: '/docs',
  },

  // --- Version Control -----------------------------------------------------
  {
    slug: 'git',
    name: 'Git',
    category: 'Version Control',
    status: 'Available',
    logo: 'Gi',
    accent: 'from-orange-500 to-amber-400',
    shortDescription:
      'Capture everything git ignores — context, env, and untracked state.',
    longDescription:
      'AITM complements git rather than replacing it. Where git tracks committed code, AITM snapshots the full working state: untracked files, environment variables, terminal history, and AI conversation context. Restore points are anchored to commits so the two timelines stay in sync.',
    features: [
      'Snapshots untracked and ignored files',
      'Captures env vars and terminal history',
      'Restore points anchored to commits',
      'Pre-commit and post-merge hooks',
    ],
    setupSteps: [
      {
        title: 'Install the git hooks',
        description:
          'Run the init command in any git repository to wire up the hooks.',
        code: 'aitm git init',
        language: 'bash',
      },
      {
        title: 'Checkpoint alongside a commit',
        description:
          'AITM automatically creates a restore point on each commit, or trigger one manually.',
        code: 'aitm checkpoint --message "before refactor"',
        language: 'bash',
      },
    ],
    docsUrl: '/docs/cli-reference',
  },
  {
    slug: 'github',
    name: 'GitHub',
    category: 'Version Control',
    status: 'Available',
    logo: 'GH',
    accent: 'from-slate-400 to-slate-200',
    shortDescription:
      'Auto-checkpoint before every AI-generated pull request.',
    longDescription:
      'The GitHub App watches your repositories and creates a restore point before every AI-generated PR and after each merge. When a batch of agent PRs introduces a regression, restore the repository to any point in the sequence — no manual git bisect required.',
    features: [
      'Checkpoint before every AI PR',
      'Post-merge restore points',
      'Sequence restore across PR batches',
      'Status checks linked to restore points',
    ],
    setupSteps: [
      {
        title: 'Install the GitHub App',
        description:
          'Connect AITM to your GitHub account and select the repositories to protect.',
        code: '> Connect GitHub from your dashboard',
        language: 'text',
      },
      {
        title: 'Pick repositories',
        description:
          'Choose which repositories should be checkpointed on each AI PR.',
      },
    ],
    docsUrl: '/docs',
  },
  {
    slug: 'gitlab',
    name: 'GitLab',
    category: 'Version Control',
    status: 'Coming Soon',
    logo: 'GL',
    accent: 'from-orange-500 to-red-400',
    shortDescription:
      'Merge-request checkpointing for GitLab.com and self-managed.',
    longDescription:
      'A GitLab integration that mirrors the GitHub experience is in development — checkpoint before every merge request, restore across MR batches, and link restore points to pipeline status on both GitLab.com and self-managed instances.',
    features: [
      'Checkpoint before merge requests',
      'Restore across MR batches',
      'Self-managed support',
      'Pipeline status linkage',
    ],
    setupSteps: [
      {
        title: 'Join the early access list',
        description:
          'The GitLab integration is not yet available. Request early access to help shape it.',
      },
    ],
    docsUrl: '/docs',
  },

  // --- Cloud ---------------------------------------------------------------
  {
    slug: 'aws',
    name: 'AWS',
    category: 'Cloud',
    status: 'Available',
    logo: 'AW',
    accent: 'from-amber-500 to-orange-400',
    shortDescription:
      'Back restore points with your own S3 bucket and IAM roles.',
    longDescription:
      'Store cloud-synced restore points in your own AWS account. AITM uses S3 for object storage and supports IAM role assumption, so your snapshots never leave your infrastructure or compliance boundary.',
    features: [
      'Bring-your-own S3 bucket',
      'IAM role assumption',
      'Server-side encryption support',
      'Region pinning for data residency',
    ],
    setupSteps: [
      {
        title: 'Configure your bucket',
        description:
          'Point AITM at an S3 bucket in your account from the dashboard storage settings.',
        code: 'aitm storage set --provider aws --bucket my-aitm-bucket',
        language: 'bash',
      },
      {
        title: 'Grant access',
        description:
          'Attach an IAM policy that allows AITM to read and write objects in the bucket.',
      },
    ],
    docsUrl: '/docs/deployment',
  },
  {
    slug: 'cloudflare-r2',
    name: 'Cloudflare R2',
    category: 'Cloud',
    status: 'Available',
    logo: 'R2',
    accent: 'from-orange-500 to-yellow-400',
    shortDescription:
      'Zero-egress restore point storage on Cloudflare R2.',
    longDescription:
      'R2 is the default managed storage backend for AITM cloud sync. With zero egress fees and S3-compatible APIs, R2 keeps restore-point storage fast and inexpensive. Bring your own R2 bucket or use the managed pool.',
    features: [
      'Zero egress fees',
      'S3-compatible API',
      'Managed or bring-your-own bucket',
      'Global edge distribution',
    ],
    setupSteps: [
      {
        title: 'Create an R2 bucket',
        description:
          'Create a bucket in your Cloudflare dashboard and generate an API token.',
      },
      {
        title: 'Connect it to AITM',
        description: 'Register the bucket and credentials with the CLI.',
        code: 'aitm storage set --provider r2 --bucket my-aitm-bucket',
        language: 'bash',
      },
    ],
    docsUrl: '/docs/deployment',
  },
  {
    slug: 's3',
    name: 'S3-Compatible',
    category: 'Cloud',
    status: 'Available',
    logo: 'S3',
    accent: 'from-emerald-500 to-green-400',
    shortDescription:
      'Use any S3-compatible store: MinIO, Backblaze B2, Wasabi and more.',
    longDescription:
      'AITM speaks the S3 protocol, so any S3-compatible object store works as a restore-point backend. Point it at MinIO for self-hosting, Backblaze B2 for cheap archival, or Wasabi for hot storage — just supply an endpoint and credentials.',
    features: [
      'Works with any S3-compatible endpoint',
      'Self-host with MinIO',
      'Custom endpoint and path-style addressing',
      'Per-project storage routing',
    ],
    setupSteps: [
      {
        title: 'Set a custom endpoint',
        description:
          'Provide your S3-compatible endpoint and credentials to the CLI.',
        code: 'aitm storage set --provider s3 --endpoint https://minio.example.com',
        language: 'bash',
      },
      {
        title: 'Verify connectivity',
        description: 'Run a health check to confirm AITM can reach the bucket.',
        code: 'aitm storage check',
        language: 'bash',
      },
    ],
    docsUrl: '/docs/deployment',
  },
];

export function getIntegration(slug: string): Integration | undefined {
  return integrations.find((integration) => integration.slug === slug);
}
