#!/usr/bin/env npx tsx/** * AITimeMachine MEGA Knowledge Base Indexer *  * Automatically discovers and indexes THOUSANDS of GitHub repositories * across all popular languages and frameworks. *  * Features: * - 500+ curated essential repos across all languages * - GitHub API discovery for popular repos by language & topic * - Trending repos discovery * - Persistent state (survives restarts) * - Rate limiting and retry logic * - Runs as a continuous service *  * Usage: *   npx tsx scripts/mega-indexer.ts              # Run continuously *   npx tsx scripts/mega-indexer.ts --once       # Single cycle *   npx tsx scripts/mega-indexer.ts --discover   # Discovery only *   npx tsx scripts/mega-indexer.ts --index      # Index only *   npx tsx scripts/mega-indexer.ts --stats      # Show stats */import { fileURLToPath } from "url";import { dirname, resolve } from "path";import dotenv from "dotenv";import * as fs from "fs/promises";import * as crypto from "crypto";const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);dotenv.config({ path: resolve(__dirname, "../.env") });// ============================================================================// CONFIGURATION// ============================================================================const API_BASE = process.env.API_BASE || "http://localhost:3001";const GITHUB_TOKEN = process.env.GITHUB_TOKEN;const STATE_FILE = resolve(__dirname, "../.mega-indexer-state.json");const CREDS_FILE = resolve(__dirname, "../.kb-credentials.json");// How many repos to index per cycleconst BATCH_SIZE = 50;// Delay between indexing each repo (ms)const INDEX_DELAY = 3000;// Delay between GitHub API calls (ms)  const API_DELAY = 2000;// How long to wait between cycles (ms)const CYCLE_INTERVAL = 30 * 60 * 1000; // 30 minutes// ============================================================================// MEGA CURATED REPOS - 500+ Essential Repositories// ============================================================================const CURATED_REPOS: Record<string, string[]> = {  // ==================== FRONTEND FRAMEWORKS ====================  frontend_frameworks: [    "facebook/react",    "vuejs/core",    "angular/angular",    "sveltejs/svelte",    "vercel/next.js",    "nuxt/nuxt",    "remix-run/remix",    "withastro/astro",    "solidjs/solid",    "preactjs/preact",    "infernojs/inferno",    "alpinejs/alpine",    "marko-js/marko",    "emberjs/ember.js",    "aurelia/aurelia",    "polymer/polymer",    "stimulus/stimulus",    "hotwired/turbo",    "htmx-org/htmx",    "unpoly/unpoly",  ],  // ==================== BACKEND FRAMEWORKS ====================  backend_frameworks: [    "expressjs/express",    "fastify/fastify",    "nestjs/nest",    "koajs/koa",    "honojs/hono",    "trpc/trpc",    "feathersjs/feathers",    "adonisjs/core",    "hapijs/hapi",    "restify/node-restify",    "moleculerjs/moleculer",    "loopbackio/loopback-next",    "actionhero/actionhero",    "strapi/strapi",    "payloadcms/payload",    "directus/directus",    "keystonejs/keystone",    "medusajs/medusa",    "saleor/saleor",    "vendure-ecommerce/vendure",  ],  // ==================== STATE MANAGEMENT ====================  state_management: [    "reduxjs/redux",    "pmndrs/zustand",    "pmndrs/jotai",    "pmndrs/valtio",    "mobxjs/mobx",    "TanStack/query",    "statelyai/xstate",    "nanostores/nanostores",    "effector/effector",    "storeon/storeon",    "cerebral/cerebral",    "immerjs/immer",    "recoiljs/recoil",    "facebookexperimental/Recoil",    "vuejs/pinia",  ],  // ==================== BUILD TOOLS & BUNDLERS ====================  build_tools: [    "vitejs/vite",    "webpack/webpack",    "evanw/esbuild",    "rollup/rollup",    "parcel-bundler/parcel",    "vercel/turbo",    "biomejs/biome",    "oxc-project/oxc",    "nicolo-ribaudo/babel",    "swc-project/swc",    "vercel/ncc",    "unjs/unbuild",    "egoist/tsup",    "developit/microbundle",    "browserify/browserify",  ],  // ==================== TESTING ====================  testing: [    "jestjs/jest",    "vitest-dev/vitest",    "mochajs/mocha",    "avajs/ava",    "jasmine/jasmine",    "cypress-io/cypress",    "microsoft/playwright",    "webdriverio/webdriverio",    "puppeteer/puppeteer",    "testing-library/react-testing-library",    "testing-library/dom-testing-library",    "enzymejs/enzyme",    "sinonjs/sinon",    "chaijs/chai",    "power-assert-js/power-assert",    "DefinitelyTyped/DefinitelyTyped",  ],  // ==================== UI LIBRARIES ====================  ui_libraries: [    "shadcn-ui/ui",    "chakra-ui/chakra-ui",    "radix-ui/primitives",    "mantine-dev/mantine",    "tailwindlabs/headlessui",    "mui/material-ui",    "ant-design/ant-design",    "arco-design/arco-design",    "primefaces/primereact",    "DouyinFE/semi-design",    "element-plus/element-plus",    "quasarframework/quasar",    "vuetifyjs/vuetify",    "bootstrap-vue/bootstrap-vue",    "nextui-org/nextui",    "daisyui/daisyui",    "floating-ui/floating-ui",    "popperjs/popper-core",  ],  // ==================== CSS & STYLING ====================  css_styling: [    "tailwindlabs/tailwindcss",    "styled-components/styled-components",    "emotion-js/emotion",    "vanilla-extract-css/vanilla-extract",    "stitchesjs/stitches",    "sass/sass",    "less/less.js",    "postcss/postcss",    "stylelint/stylelint",    "cssnano/cssnano",    "autoprefixer/autoprefixer",    "necolas/normalize.css",    "jgthms/bulma",    "pure-css/pure",    "primer/css",  ],  // ==================== DATABASE & ORM ====================  database_orm: [    "prisma/prisma",    "drizzle-team/drizzle-orm",    "typeorm/typeorm",    "sequelize/sequelize",    "knex/knex",    "mikro-orm/mikro-orm",    "objection/objection.js",    "bookshelf/bookshelf",    "mongodb/node-mongodb-native",    "redis/node-redis",    "ioredis/ioredis",    "brianc/node-postgres",    "sidorares/node-mysql2",    "WiseLibs/better-sqlite3",    "sql-js/sql.js",    "kysely-org/kysely",  ],  // ==================== API & GRAPHQL ====================  api_graphql: [    "graphql/graphql-js",    "graphql/graphql-spec",    "apollographql/apollo-server",    "apollographql/apollo-client",    "urql-graphql/urql",    "dotansimha/graphql-code-generator",    "ardatan/graphql-tools",    "MichalLytek/type-graphql",    "pothos-graphql/pothos",    "mercurius-js/mercurius",    "hasura/graphql-engine",    "prisma/prisma-client-js",    "swagger-api/swagger-ui",    "swagger-api/swagger-js",    "OAI/OpenAPI-Specification",  ],  // ==================== AUTH & SECURITY ====================  auth_security: [    "nextauthjs/next-auth",    "lucia-auth/lucia",    "panva/jose",    "auth0/node-jsonwebtoken",    "kelektiv/node.bcrypt.js",    "jaredhanson/passport",    "oauthjs/node-oauth2-server",    "supertokens/supertokens-node",    "clerk/javascript",    "workos/authkit",    "logto-io/logto",    "ory/kratos",    "keycloak/keycloak",    "casdoor/casdoor",  ],  // ==================== VALIDATION & SCHEMA ====================  validation_schema: [    "colinhacks/zod",    "jquense/yup",    "sideway/joi",    "ajv-validator/ajv",    "ianstormtaylor/superstruct",    "sinclairzx81/typebox",    "gcanti/io-ts",    "fabian-hiller/valibot",    "effect-ts/effect",    "gcanti/fp-ts",  ],  // ==================== HTTP & NETWORKING ====================  http_networking: [    "axios/axios",    "sindresorhus/got",    "sindresorhus/ky",    "unjs/ofetch",    "elbywan/wretch",    "node-fetch/node-fetch",    "octokit/octokit.js",    "websockets/ws",    "socketio/socket.io",    "uNetworking/uWebSockets.js",    "feross/simple-peer",    "peerjs/peerjs",  ],  // ==================== CLI & TERMINAL ====================  cli_terminal: [    "tj/commander.js",    "yargs/yargs",    "SBoudrias/Inquirer.js",    "terkelg/prompts",    "chalk/chalk",    "sindresorhus/ora",    "sindresorhus/cli-spinners",    "vadimdemedes/ink",    "google/zx",    "shelljs/shelljs",    "sindresorhus/execa",    "bokub/gradient-string",    "patorjk/figlet.js",    "cronvel/terminal-kit",    "cliui/cliui",  ],  // ==================== FILE & PATH ====================  file_path: [    "sindresorhus/globby",    "mrmlnc/fast-glob",    "isaacs/node-glob",    "micromatch/micromatch",    "paulmillr/chokidar",    "jprichardson/node-fs-extra",    "isaacs/rimraf",    "substack/minimatch",    "sindresorhus/del",    "sindresorhus/find-up",    "paulmillr/readdirp",    "jonschlinkert/gray-matter",    "unifiedjs/unified",    "remarkjs/remark",  ],  // ==================== UTILITIES ====================  utilities: [    "lodash/lodash",    "jashkenas/underscore",    "ramda/ramda",    "remeda/remeda",    "date-fns/date-fns",    "moment/moment",    "iamkun/dayjs",    "moment/luxon",    "formatjs/formatjs",    "sindresorhus/p-limit",    "sindresorhus/p-map",    "sindresorhus/p-queue",    "petkaantonov/bluebird",    "caolan/async",    "rxjs/rxjs",  ],  // ==================== NODE.JS CORE ====================  nodejs_core: [    "nodejs/node",    "npm/cli",    "pnpm/pnpm",    "yarnpkg/berry",    "nvm-sh/nvm",    "Schniz/fnm",    "volta-cli/volta",    "denoland/deno",    "oven-sh/bun",    "nicolo-ribaudo/babel",    "microsoft/TypeScript",    "tc39/proposals",    "tc39/ecma262",  ],  // ==================== DOCUMENTATION ====================  documentation: [    "facebook/docusaurus",    "vuejs/vitepress",    "withastro/starlight",    "shuding/nextra",    "GitbookIO/gitbook",    "mkdocs/mkdocs",    "squidfunk/mkdocs-material",    "rust-lang/mdBook",    "docsifyjs/docsify",    "readthedocs/readthedocs.org",    "jsdoc/jsdoc",    "TypeStrong/typedoc",    "documentationjs/documentation",  ],  // ==================== AI & ML ====================  ai_ml: [    "openai/openai-node",    "anthropics/anthropic-sdk-node",    "google/generative-ai-js",    "huggingface/transformers.js",    "xenova/transformers.js",    "mlc-ai/web-llm",    "vercel/ai",    "langchain-ai/langchainjs",    "hwchase17/langchain",    "run-llama/llama_index",    "deepset-ai/haystack",    "chroma-core/chroma",    "weaviate/weaviate",    "qdrant/qdrant",    "pinecone-io/pinecone-ts-client",    "tensorflow/tfjs",    "onnx/onnxruntime",  ],  // ==================== PYTHON - WEB FRAMEWORKS ====================  python_web: [    "django/django",    "pallets/flask",    "tiangolo/fastapi",    "encode/starlette",    "tornadoweb/tornado",    "bottlepy/bottle",    "falconry/falcon",    "cherrypy/cherrypy",    "sanic-org/sanic",    "aio-libs/aiohttp",    "encode/httpx",    "psf/requests",  ],  // ==================== PYTHON - DATA & ML ====================  python_data_ml: [    "numpy/numpy",    "pandas-dev/pandas",    "scipy/scipy",    "scikit-learn/scikit-learn",    "pytorch/pytorch",    "tensorflow/tensorflow",    "keras-team/keras",    "huggingface/transformers",    "Lightning-AI/pytorch-lightning",    "microsoft/DeepSpeed",    "dmlc/xgboost",    "microsoft/LightGBM",    "catboost/catboost",    "facebookresearch/fairseq",    "openai/whisper",  ],  // ==================== PYTHON - UTILITIES ====================  python_utilities: [    "python-poetry/poetry",    "pypa/pip",    "pypa/setuptools",    "astral-sh/ruff",    "psf/black",    "PyCQA/isort",    "PyCQA/flake8",    "PyCQA/pylint",    "python/mypy",    "microsoft/pyright",    "pytest-dev/pytest",    "tox-dev/tox",    "asweigart/pyautogui",    "pallets/click",    "Textualize/rich",    "pydantic/pydantic",  ],  // ==================== GO ====================  go_repos: [    "golang/go",    "gin-gonic/gin",    "gofiber/fiber",    "labstack/echo",    "beego/beego",    "gorilla/mux",    "go-chi/chi",    "go-kit/kit",    "go-micro/go-micro",    "grpc/grpc-go",    "graphql-go/graphql",    "99designs/gqlgen",    "gorm-io/gorm",    "ent/ent",    "go-sql-driver/mysql",    "lib/pq",    "redis/go-redis",    "spf13/cobra",    "spf13/viper",    "stretchr/testify",  ],  // ==================== RUST ====================  rust_repos: [    "rust-lang/rust",    "rust-lang/cargo",    "tokio-rs/tokio",    "actix/actix-web",    "tokio-rs/axum",    "hyperium/hyper",    "seanmonstar/warp",    "poem-web/poem",    "diesel-rs/diesel",    "launchbadge/sqlx",    "serde-rs/serde",    "dtolnay/serde_json",    "clap-rs/clap",    "BurntSushi/ripgrep",    "sharkdp/bat",    "sharkdp/fd",    "dandavison/delta",    "ogham/exa",    "bootandy/dust",    "ajeetdsouza/zoxide",  ],  // ==================== JAVA ====================  java_repos: [    "spring-projects/spring-boot",    "spring-projects/spring-framework",    "quarkusio/quarkus",    "micronaut-projects/micronaut-core",    "eclipse-vertx/vert.x",    "reactor/reactor-core",    "netty/netty",    "hibernate/hibernate-orm",    "mybatis/mybatis-3",    "google/guava",    "apache/commons-lang",    "apache/kafka",    "elastic/elasticsearch",    "apache/lucene",    "junit-team/junit5",    "mockito/mockito",    "google/gson",    "FasterXML/jackson",    "projectlombok/lombok",  ],  // ==================== DEVOPS & INFRA ====================  devops_infra: [    "kubernetes/kubernetes",    "docker/compose",    "moby/moby",    "hashicorp/terraform",    "hashicorp/vault",    "hashicorp/consul",    "ansible/ansible",    "pulumi/pulumi",    "argoproj/argo-cd",    "prometheus/prometheus",    "grafana/grafana",    "elastic/logstash",    "getsentry/sentry",    "traefik/traefik",    "nginx/nginx",    "caddyserver/caddy",    "envoyproxy/envoy",  ],  // ==================== MOBILE ====================  mobile: [    "facebook/react-native",    "expo/expo",    "software-mansion/react-native-reanimated",    "react-navigation/react-navigation",    "callstack/react-native-paper",    "wix/react-native-ui-lib",    "infinitered/ignite",    "flutter/flutter",    "nicklockwood/SwiftFormat",    "nicklockwood/SwiftLint",    "onevcat/Kingfisher",    "Alamofire/Alamofire",    "Moya/Moya",    "square/retrofit",    "bumptech/glide",  ],  // ==================== GAME DEV ====================  game_dev: [    "godotengine/godot",    "bevyengine/bevy",    "libgdx/libgdx",    "phaserjs/phaser",    "pixijs/pixijs",    "babylonjs/Babylon.js",    "mrdoob/three.js",    "playcanvas/engine",    "cocos/cocos-engine",    "defold/defold",    "excaliburjs/Excalibur",    "melonjs/melonJS",  ],  // ==================== BLOCKCHAIN & WEB3 ====================  blockchain_web3: [    "ethereum/go-ethereum",    "ethereum/solidity",    "OpenZeppelin/openzeppelin-contracts",    "foundry-rs/foundry",    "dethcrypto/TypeChain",    "ethers-io/ethers.js",    "ChainSafe/web3.js",    "wagmi-dev/viem",    "wagmi-dev/wagmi",    "rainbow-me/rainbowkit",    "Uniswap/interface",    "aave/aave-v3-core",    "compound-finance/compound-protocol",    "safe-global/safe-contracts",  ],  // ==================== EDITOR & IDE ====================  editor_ide: [    "microsoft/vscode",    "neovim/neovim",    "helix-editor/helix",    "lapce/lapce",    "zed-industries/zed",    "atom/atom",    "VSCodium/vscodium",    "onivim/oni2",    "AstroNvim/AstroNvim",    "NvChad/NvChad",    "LunarVim/LunarVim",    "LazyVim/LazyVim",    "CosmicNvim/CosmicNvim",  ],  // ==================== MONOREPO & TOOLING ====================  monorepo_tooling: [    "lerna/lerna",    "nrwl/nx",    "changesets/changesets",    "semantic-release/semantic-release",    "conventional-changelog/conventional-changelog",    "commitizen/cz-cli",    "husky/husky",    "typicode/husky",    "okonet/lint-staged",    "danger/danger-js",    "mrm/mrm",  ],    // ==================== MORE POPULAR LIBS ====================  popular_misc: [    "vercel/swr",    "TanStack/table",    "TanStack/router",    "TanStack/form",    "TanStack/virtual",    "pmndrs/drei",    "pmndrs/react-three-fiber",    "nivo-ui/nivo",    "recharts/recharts",    "chartjs/Chart.js",    "d3/d3",    "airbnb/visx",    "plotly/plotly.js",    "highcharts/highcharts",    "apache/echarts",    "apexcharts/apexcharts.js",    "framer/motion",    "greensock/GSAP",    "juliangarnier/anime",    "mattboldt/typed.js",    "scroll-out/scroll-out",    "locomotivemtl/locomotive-scroll",    "michalsnik/aos",    "janpaepke/ScrollMagic",  ],};// ============================================================================// GITHUB API DISCOVERY CONFIGURATION// ============================================================================const DISCOVERY_LANGUAGES = [  "JavaScript",  "TypeScript",   "Python",  "Java",  "Go",  "Rust",  "C++",  "C#",  "PHP",  "Ruby",  "Swift",  "Kotlin",  "Scala",  "Elixir",  "Haskell",];const DISCOVERY_TOPICS = [  "react", "vue", "angular", "svelte", "nextjs", "nuxt",  "nodejs", "express", "fastify", "nestjs",  "typescript", "javascript",  "graphql", "rest-api", "microservices",  "machine-learning", "deep-learning", "nlp", "llm",  "docker", "kubernetes", "devops", "ci-cd",  "database", "postgresql", "mongodb", "redis",  "testing", "automation", "cli",  "awesome", "tutorial", "learning",  "web-components", "pwa", "jamstack",  "serverless", "edge-computing",  "blockchain", "ethereum", "solidity", "web3",  "game-development", "graphics", "animation",  "security", "authentication", "encryption",];// ============================================================================// TYPES// ============================================================================interface RepoQueueItem {  fullName: string;  stars: number;  source: "curated" | "language" | "topic" | "trending";  addedAt: string;  retries: number;}interface IndexerState {  queue: RepoQueueItem[];  indexed: string[];  failed: string[];  lastDiscovery: string | null;  lastIndexing: string | null;  stats: {    totalQueued: number;    totalIndexed: number;    totalFailed: number;  };}interface Credentials {  apiKey: string;  projectId: string;  userId: string;}// ============================================================================// LOGGING// ============================================================================function log(level: "INFO" | "WARN" | "ERROR", message: string) {  const timestamp = new Date().toISOString();  console.log(`[${timestamp}] [${level}] ${message}`);}// ============================================================================// STATE MANAGEMENT// ============================================================================async function loadState(): Promise<IndexerState> {  try {    const data = await fs.readFile(STATE_FILE, "utf-8");    return JSON.parse(data);  } catch {    return {      queue: [],      indexed: [],      failed: [],      lastDiscovery: null,      lastIndexing: null,      stats: { totalQueued: 0, totalIndexed: 0, totalFailed: 0 },    };  }}async function saveState(state: IndexerState): Promise<void> {  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));}// ============================================================================// CREDENTIALS// ============================================================================async function getOrCreateCredentials(): Promise<Credentials> {  try {    const data = await fs.readFile(CREDS_FILE, "utf-8");    const creds = JSON.parse(data);        // Verify credentials work    const response = await fetch(`${API_BASE}/v1/knowledge-base/repositories`, {      headers: { "X-API-Key": creds.apiKey },    });        if (response.ok) {      return creds;    }  } catch {}  log("INFO", "Creating new credentials...");    const { db, schema } = await import("../src/db/index.js");    function generateId(prefix: string): string {    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;  }  function generateApiKey(): { key: string; hash: string; prefix: string } {    const key = `aitm_${crypto.randomBytes(24).toString("hex")}`;    const hash = crypto.createHash("sha256").update(key).digest("hex");    const prefix = key.slice(0, 12);    return { key, hash, prefix };  }  const userId = generateId("user");  await db.insert(schema.users).values({    id: userId,    email: `mega-indexer-${Date.now()}@aitimemachine.dev`,    name: "Mega Knowledge Base Indexer",    plan: "pro",  }).onConflictDoNothing();  const keyId = generateId("key");  const { key, hash, prefix } = generateApiKey();  await db.insert(schema.apiKeys).values({    id: keyId,    userId,    keyHash: hash,    keyPrefix: prefix,    name: "Mega-Indexer Key",    scopes: ["read", "write", "admin"],  });  const projectId = generateId("proj");  await db.insert(schema.projects).values({    id: projectId,    userId,    name: "Mega Knowledge Base",  });  const creds = { apiKey: key, projectId, userId };  await fs.writeFile(CREDS_FILE, JSON.stringify(creds, null, 2));    return creds;}// ============================================================================// GITHUB API// ============================================================================async function githubFetch(url: string): Promise<Response> {  const headers: Record<string, string> = {    "Accept": "application/vnd.github.v3+json",    "User-Agent": "AITimeMachine-Indexer",  };    if (GITHUB_TOKEN) {    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;  }  const response = await fetch(url, { headers });    // Handle rate limiting  if (response.status === 403) {    const resetTime = response.headers.get("X-RateLimit-Reset");    if (resetTime) {      const waitMs = Math.max(0, parseInt(resetTime) * 1000 - Date.now()) + 1000;      log("WARN", `Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`);      await new Promise(r => setTimeout(r, Math.min(waitMs, 60000)));      return githubFetch(url);    }  }    return response;}async function discoverReposByLanguage(  language: string,  minStars: number = 500,  perPage: number = 100): Promise<RepoQueueItem[]> {  const repos: RepoQueueItem[] = [];    try {    const url = `https://api.github.com/search/repositories?q=language:${encodeURIComponent(language)}+stars:>${minStars}&sort=stars&order=desc&per_page=${perPage}`;    const response = await githubFetch(url);        if (!response.ok) {      log("WARN", `Failed to fetch ${language} repos: ${response.status}`);      return repos;    }    const data = await response.json();        for (const repo of data.items || []) {      repos.push({        fullName: repo.full_name,        stars: repo.stargazers_count,        source: "language",        addedAt: new Date().toISOString(),        retries: 0,      });    }  } catch (error: any) {    log("ERROR", `Error discovering ${language} repos: ${error.message}`);  }    return repos;}async function discoverReposByTopic(  topic: string,  minStars: number = 500,  perPage: number = 100): Promise<RepoQueueItem[]> {  const repos: RepoQueueItem[] = [];    try {    const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}+stars:>${minStars}&sort=stars&order=desc&per_page=${perPage}`;    const response = await githubFetch(url);        if (!response.ok) {      return repos;    }    const data = await response.json();        for (const repo of data.items || []) {      repos.push({        fullName: repo.full_name,        stars: repo.stargazers_count,        source: "topic",        addedAt: new Date().toISOString(),        retries: 0,      });    }  } catch {}    return repos;}async function discoverTrendingRepos(  language: string,  limit: number = 50): Promise<RepoQueueItem[]> {  const repos: RepoQueueItem[] = [];    try {    // Get repos created in the last 30 days with high star growth    const thirtyDaysAgo = new Date();    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];    const url = `https://api.github.com/search/repositories?q=language:${encodeURIComponent(language)}+created:>${dateStr}+stars:>100&sort=stars&order=desc&per_page=${limit}`;    const response = await githubFetch(url);        if (!response.ok) {      return repos;    }    const data = await response.json();        for (const repo of data.items || []) {      repos.push({        fullName: repo.full_name,        stars: repo.stargazers_count,        source: "trending",        addedAt: new Date().toISOString(),        retries: 0,      });    }  } catch {}    return repos;}// ============================================================================// INDEXING// ============================================================================async function indexRepository(  apiKey: string,  projectId: string,  repoFullName: string): Promise<{ success: boolean; error?: string; repoId?: string }> {  try {    const response = await fetch(`${API_BASE}/v1/repositories`, {      method: "POST",      headers: {        "Content-Type": "application/json",        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        url: `https://github.com/${repoFullName}`,
        projectId,
        name: repoFullName.split("/")[1],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || JSON.stringify(data),
      };
    }

    // Wait for indexing to complete (max 3 minutes)
    const repoId = data.id;
    const maxWait = 180000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, 5000));
      
      const statusRes = await fetch(`${API_BASE}/v1/repositories/${repoId}`, {
        headers: { "X-API-Key": apiKey },
      });
      
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.status === "completed") {
          return { success: true, repoId };
        }
        if (status.status === "failed") {
          return { success: false, error: status.error || "Indexing failed", repoId };
        }
      }
    }

    return { success: false, error: "Indexing timeout", repoId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DISCOVERY CYCLE
// ============================================================================

async function runDiscoveryCycle(state: IndexerState): Promise<void> {
  log("INFO", "======================================================================");
  log("INFO", "🔍 Starting comprehensive discovery cycle...");
  log("INFO", "======================================================================");
  
  const existingSet = new Set([
    ...state.indexed.map(r => r.toLowerCase()),
    ...state.queue.map(r => r.fullName.toLowerCase()),
    ...state.failed.map(r => r.toLowerCase()),
  ]);

  let newRepos = 0;

  // Phase 1: Add curated repos
  log("INFO", `\n📋 Phase 1: Curated repositories`);
  let curatedCount = 0;
  for (const [category, repos] of Object.entries(CURATED_REPOS)) {
    for (const repo of repos) {
      if (!existingSet.has(repo.toLowerCase())) {
        state.queue.push({
          fullName: repo,
          stars: 10000, // Assume high priority for curated
          source: "curated",
          addedAt: new Date().toISOString(),
          retries: 0,
        });
        existingSet.add(repo.toLowerCase());
        newRepos++;
        curatedCount++;
      }
    }
  }
  log("INFO", `   Added ${curatedCount} curated repos to queue`);

  // Phase 2: Discover by language
  log("INFO", `\n🌐 Phase 2: Language discovery (${DISCOVERY_LANGUAGES.length} languages)`);
  for (const language of DISCOVERY_LANGUAGES) {
    log("INFO", `   Discovering ${language} repos...`);
    const repos = await discoverReposByLanguage(language, 1000, 100);
    
    let added = 0;
    for (const repo of repos) {
      if (!existingSet.has(repo.fullName.toLowerCase())) {
        state.queue.push(repo);
        existingSet.add(repo.fullName.toLowerCase());
        added++;
        newRepos++;
      }
    }
    log("INFO", `      Found ${repos.length} repos, added ${added} new`);
    await new Promise(r => setTimeout(r, API_DELAY));
  }

  // Phase 3: Discover by topic
  log("INFO", `\n🏷️  Phase 3: Topic discovery (${DISCOVERY_TOPICS.length} topics)`);
  for (const topic of DISCOVERY_TOPICS) {
    log("INFO", `   Discovering ${topic} repos...`);
    const repos = await discoverReposByTopic(topic, 500, 50);
    
    let added = 0;
    for (const repo of repos) {
      if (!existingSet.has(repo.fullName.toLowerCase())) {
        state.queue.push(repo);
        existingSet.add(repo.fullName.toLowerCase());
        added++;
        newRepos++;
      }
    }
    log("INFO", `      Found ${repos.length} repos, added ${added} new`);
    await new Promise(r => setTimeout(r, API_DELAY));
  }

  // Phase 4: Trending repos
  log("INFO", `\n🔥 Phase 4: Trending repos discovery`);
  for (const language of ["JavaScript", "TypeScript", "Python", "Go", "Rust"]) {
    const repos = await discoverTrendingRepos(language, 50);
    
    let added = 0;
    for (const repo of repos) {
      if (!existingSet.has(repo.fullName.toLowerCase())) {
        state.queue.push(repo);
        existingSet.add(repo.fullName.toLowerCase());
        added++;
        newRepos++;
      }
    }
    log("INFO", `   ${language}: ${repos.length} trending, ${added} new`);
    await new Promise(r => setTimeout(r, API_DELAY));
  }

  // Sort queue by stars (highest first)
  state.queue.sort((a, b) => b.stars - a.stars);
  
  state.lastDiscovery = new Date().toISOString();
  state.stats.totalQueued += newRepos;
  
  log("INFO", `\n✅ Discovery complete: ${newRepos} new repos found`);
  log("INFO", `   Total queue size: ${state.queue.length}`);
  
  await saveState(state);
}

// ============================================================================
// INDEXING CYCLE
// ============================================================================

async function runIndexingCycle(state: IndexerState, creds: Credentials): Promise<void> {
  if (state.queue.length === 0) {
    log("INFO", "Queue is empty. Run discovery first.");
    return;
  }

  log("INFO", "======================================================================");
  log("INFO", `📦 Starting indexing cycle (${Math.min(BATCH_SIZE, state.queue.length)} repos)`);
  log("INFO", "======================================================================");

  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < BATCH_SIZE && state.queue.length > 0; i++) {
    const repo = state.queue.shift()!;
    
    log("INFO", `   [${i + 1}/${BATCH_SIZE}] 📥 ${repo.fullName} (⭐${repo.stars})...`);
    
    const result = await indexRepository(creds.apiKey, creds.projectId, repo.fullName);
    
    if (result.success) {
      log("INFO", `      ✅ Indexed successfully`);
      state.indexed.push(repo.fullName);
      state.stats.totalIndexed++;
      indexed++;
    } else {
      log("WARN", `      ❌ Failed: ${result.error}`);
      
      // Retry logic
      if (repo.retries < 2) {
        repo.retries++;
        state.queue.push(repo); // Re-add to end of queue
        log("INFO", `      🔄 Re-queued (retry ${repo.retries}/2)`);
      } else {
        state.failed.push(repo.fullName);
        state.stats.totalFailed++;
        failed++;
      }
    }
    
    await new Promise(r => setTimeout(r, INDEX_DELAY));
    
    // Save state periodically
    if (i % 10 === 0) {
      await saveState(state);
    }
  }

  state.lastIndexing = new Date().toISOString();
  await saveState(state);

  log("INFO", "\n======================================================================");
  log("INFO", "📊 Indexing cycle complete");
  log("INFO", "======================================================================");
  log("INFO", `   ✅ Indexed: ${indexed}`);
  log("INFO", `   ❌ Failed: ${failed}`);
  log("INFO", `   📋 Remaining in queue: ${state.queue.length}`);
  log("INFO", `   📚 Total indexed: ${state.stats.totalIndexed}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`
══════════════════════════════════════════════════════════════════════
   🚀 AITimeMachine MEGA Knowledge Base Indexer
   Indexing thousands of GitHub repositories automatically
══════════════════════════════════════════════════════════════════════
`);

  const args = process.argv.slice(2);
  const runOnce = args.includes("--once");
  const discoverOnly = args.includes("--discover");
  const indexOnly = args.includes("--index");
  const showStats = args.includes("--stats");

  // Load state
  let state = await loadState();
  
  // Get credentials
  const creds = await getOrCreateCredentials();
  log("INFO", `Using project: ${creds.projectId}`);
  log("INFO", `Previously indexed: ${state.indexed.length} repos`);
  log("INFO", `Queue size: ${state.queue.length} repos`);

  if (showStats) {
    console.log("\n📊 Statistics:");
    console.log(`   Total queued: ${state.stats.totalQueued}`);
    console.log(`   Total indexed: ${state.stats.totalIndexed}`);
    console.log(`   Total failed: ${state.stats.totalFailed}`);
    console.log(`   Current queue: ${state.queue.length}`);
    console.log(`   Last discovery: ${state.lastDiscovery || "Never"}`);
    console.log(`   Last indexing: ${state.lastIndexing || "Never"}`);
    return;
  }

  if (discoverOnly) {
    await runDiscoveryCycle(state);
    return;
  }

  if (indexOnly) {
    await runIndexingCycle(state, creds);
    return;
  }

  // Run discovery + indexing cycle
  if (runOnce) {
    await runDiscoveryCycle(state);
    state = await loadState(); // Reload after discovery
    await runIndexingCycle(state, creds);
    
    log("INFO", "\n🎉 Single cycle complete!");
    return;
  }

  // Continuous mode
  log("INFO", "Starting continuous indexing mode...");
  log("INFO", `Will run every ${CYCLE_INTERVAL / 60000} minutes`);
  
  while (true) {
    try {
      await runDiscoveryCycle(state);
      state = await loadState();
      await runIndexingCycle(state, creds);
      
      log("INFO", `\n⏳ Waiting ${CYCLE_INTERVAL / 60000} minutes until next cycle...`);
      await new Promise(r => setTimeout(r, CYCLE_INTERVAL));
      
      state = await loadState();
    } catch (error: any) {
      log("ERROR", `Cycle error: ${error.message}`);
      await new Promise(r => setTimeout(r, 60000)); // Wait 1 min on error
    }
  }
}

main().catch(console.error);
