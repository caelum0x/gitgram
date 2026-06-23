/**
 * Auth Commands
 *
 * login, logout, whoami, register, api-key, audit, team-create,
 * teams, user-create, users
 */

import { Command } from 'commander';
import { C } from './cli-helpers.js';
import * as readline from 'readline';

export function registerAuthCommands(program: Command): void {

  // Login
  program
    .command('login')
    .description('Login to AITimeMachine')
    .option('--api-key <key>', 'Login with API key directly')
    .option('--email <email>', 'Login with email/password')
    .option('--password <password>', 'Password (use with --email)')
    .action(async (opts) => {
      const { loginWithApiKey, loginWithPassword, loginWithBrowser, getStoredAuth } = await import('../auth/index.js');
      const existing = getStoredAuth();
      if (existing) {
        console.log(`${C.yellow}Already logged in as ${existing.email}${C.reset}`);
        console.log(`Run 'aitm logout' first to switch accounts.`);
        return;
      }
      let result;
      if (opts.apiKey) {
        console.log('Validating API key...');
        result = await loginWithApiKey(opts.apiKey);
      } else if (opts.email && opts.password) {
        console.log('Logging in...');
        result = await loginWithPassword(opts.email, opts.password);
      } else if (opts.email) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const password = await new Promise<string>(resolve => {
          process.stdout.write('Password: ');
          rl.question('', (answer) => { rl.close(); resolve(answer); });
        });
        result = await loginWithPassword(opts.email, password);
      } else {
        result = await loginWithBrowser();
      }
      if (result.success) {
        const auth = getStoredAuth();
        console.log(`${C.green}\u2713 Logged in as ${auth?.email}${C.reset}`);
      } else {
        console.error(`${C.red}Login failed: ${result.error}${C.reset}`);
        process.exit(1);
      }
    });

  // Logout
  program
    .command('logout')
    .description('Logout from AITimeMachine')
    .action(async () => {
      const { clearAuth, getStoredAuth } = await import('../auth/index.js');
      const auth = getStoredAuth();
      if (auth) { clearAuth(); console.log(`${C.green}\u2713 Logged out${C.reset}`); }
      else { console.log('Not logged in.'); }
    });

  // Whoami
  program
    .command('whoami')
    .description('Show current user')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { getStoredAuth } = await import('../auth/index.js');
      const auth = getStoredAuth();
      if (opts.json) {
        if (auth) { console.log(JSON.stringify({ authenticated: true, user: { email: auth.email, id: auth.userId }, cloudSync: !!auth.apiKey })); }
        else { console.log(JSON.stringify({ authenticated: false })); }
      } else {
        if (auth) { console.log(`${C.cyan}User:${C.reset}  ${auth.email}`); console.log(`${C.cyan}ID:${C.reset}    ${auth.userId}`); }
        else { console.log('Not logged in. Run: aitm login'); }
      }
    });

  // Register
  program
    .command('register')
    .description('Create a new account')
    .option('--email <email>', 'Email address')
    .option('--password <password>', 'Password (min 8 chars)')
    .action(async (opts) => {
      const { AuthService } = await import('../auth/index.js');
      const { saveAuth } = await import('../auth/index.js');
      let email = opts.email;
      let password = opts.password;
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));
      if (!email) email = await ask('Email: ');
      if (!password) password = await ask('Password (min 8 chars): ');
      rl.close();
      const authService = new AuthService();
      const result = authService.register(email, password);
      if (result.success && result.user) {
        saveAuth({ apiKey: result.user.apiKey, userId: result.user.id, email: result.user.email });
        console.log(`${C.green}\u2713 Account created!${C.reset}`);
        console.log(`${C.cyan}API Key:${C.reset} ${result.user.apiKey}`);
        console.log(`\nSave this API key - you'll need it to login on other devices.`);
      } else {
        console.error(`${C.red}Registration failed: ${result.error}${C.reset}`);
        process.exit(1);
      }
    });

  // API key
  program
    .command('api-key')
    .description('Show or regenerate API key')
    .option('--regenerate', 'Generate a new API key')
    .action(async (opts) => {
      const { getStoredAuth, saveAuth } = await import('../auth/index.js');
      const { AuthService } = await import('../auth/index.js');
      const auth = getStoredAuth();
      if (!auth) { console.log('Not logged in. Run: aitm login'); process.exit(1); }
      if (opts.regenerate) {
        const authService = new AuthService();
        const newKey = authService.regenerateApiKey(auth.userId);
        if (newKey) {
          saveAuth({ ...auth, apiKey: newKey });
          console.log(`${C.green}\u2713 New API key generated${C.reset}`);
          console.log(`${C.cyan}API Key:${C.reset} ${newKey}`);
        } else { console.error(`${C.red}Failed to regenerate key${C.reset}`); }
      } else { console.log(`${C.cyan}API Key:${C.reset} ${auth.apiKey}`); }
    });

  // Audit
  program
    .command('audit')
    .description('View audit logs')
    .option('-n, --limit <n>', 'Number of entries', '20')
    .option('--user <id>', 'Filter by user ID')
    .option('--action <type>', 'Filter by action type')
    .action(async (opts) => {
      const { getAuditLogs } = await import('../auth/index.js');
      let logs = getAuditLogs(parseInt(opts.limit) * 5);
      if (opts.user) { logs = logs.filter(l => l.userId === opts.user); }
      if (opts.action) { logs = logs.filter(l => l.action.includes(opts.action)); }
      logs = logs.slice(0, parseInt(opts.limit));
      if (logs.length === 0) { console.log('No audit logs found.'); return; }
      console.log(`\n${C.bright}Audit Logs${C.reset}\n`);
      for (const log of logs) {
        const status = log.success ? `${C.green}\u2713${C.reset}` : `${C.red}\u2717${C.reset}`;
        const time = new Date(log.timestamp).toLocaleString();
        console.log(`${status} ${C.dim}${time}${C.reset} ${C.cyan}${log.action}${C.reset}`);
        if (log.userId) console.log(`  User: ${log.userId}`);
        if (log.resource) console.log(`  Resource: ${log.resource}`);
        console.log();
      }
    });

  // Team create
  program
    .command('team-create <name>')
    .description('Create a new team')
    .action(async (name) => {
      const { TeamManager } = await import('../team-manager.js');
      const tm = new TeamManager();
      const users = tm.listUsers();
      if (users.length === 0) { console.log('[!] Create a user first: aitm user-create <name> <email>'); return; }
      const team = tm.createTeam(name, users[0].id);
      console.log(`[+] Team created: ${team.name} (${team.id.slice(0, 8)})`);
    });

  // Teams
  program
    .command('teams')
    .description('List all teams')
    .action(async () => {
      const { TeamManager } = await import('../team-manager.js');
      const tm = new TeamManager();
      const teams = tm.listTeams();
      if (teams.length === 0) { console.log('No teams'); return; }
      console.log(`\n${C.bright}Teams${C.reset}\n`);
      for (const t of teams) { console.log(`  ${t.name} (${t.members.length} members, ${t.projects.length} projects)`); }
      console.log();
    });

  // User create
  program
    .command('user-create <name> <email>')
    .description('Create a new user')
    .option('-r, --role <role>', 'Role: admin, member, viewer', 'member')
    .action(async (name, email, options) => {
      const { TeamManager } = await import('../team-manager.js');
      const tm = new TeamManager();
      const user = tm.createUser(name, email, options.role);
      console.log(`[+] User created: ${user.name} <${user.email}>`);
      console.log(`    API Key: ${user.apiKey}`);
    });

  // Users
  program
    .command('users')
    .description('List all users')
    .action(async () => {
      const { TeamManager } = await import('../team-manager.js');
      const tm = new TeamManager();
      const users = tm.listUsers();
      if (users.length === 0) { console.log('No users'); return; }
      console.log(`\n${C.bright}Users${C.reset}\n`);
      for (const u of users) { console.log(`  ${u.name} <${u.email}> [${u.role}]`); }
      console.log();
    });
}
