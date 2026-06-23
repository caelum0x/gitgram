/**
 * Inspect Commands
 *
 * db-state, container-state, gemini-sessions, pack-info, pack-verify,
 * repack, gc, ai-concepts, ai-focus, timeline-interactive
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, timeAgo } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function registerInspectCommands(program: Command): void {

  // Database state
  program
    .command('db-state')
    .description('Show database state for current project')
    .action(async () => {
      const { DatabaseCollector } = await import('../collectors/database-collector.js');
      const collector = new DatabaseCollector(process.cwd());
      const databases = collector.capture();
      if (databases.length === 0) { console.log(`${C.dim}No databases detected${C.reset}`); return; }
      console.log(`\n${C.bright}Database State${C.reset}\n`);
      for (const db of databases) {
        console.log(`  ${C.cyan}${db.type}${C.reset}`);
        if (db.files) console.log(`    Files: ${db.files.join(', ')}`);
        if (db.schema) console.log(`    Schema: ${db.schema}`);
        if (db.tables?.length) console.log(`    Tables: ${db.tables.slice(0, 10).join(', ')}${db.tables.length > 10 ? '...' : ''}`);
      }
      console.log();
    });

  // Container state
  program
    .command('container-state')
    .description('Show Docker/container state')
    .action(async () => {
      const { ContainerCollector } = await import('../collectors/container-collector.js');
      const collector = new ContainerCollector(process.cwd());
      const state = collector.capture();
      if (!state.hasDocker) { console.log(`${C.dim}Docker not available${C.reset}`); return; }
      console.log(`\n${C.bright}Container State${C.reset}\n`);
      if (state.containers.length > 0) {
        console.log(`  ${C.cyan}Running Containers:${C.reset}`);
        for (const c of state.containers) { console.log(`    ${c.name} (${c.image}) - ${c.status}`); }
      }
      if (state.compose) { console.log(`  ${C.cyan}Docker Compose:${C.reset} ${state.compose.file}`); console.log(`    Services: ${state.compose.services.join(', ')}`); }
      if (state.images.length > 0) { console.log(`  ${C.cyan}Local Images:${C.reset} ${state.images.length}`); }
      console.log();
    });

  // Gemini sessions
  program
    .command('gemini-sessions')
    .description('List Gemini CLI sessions')
    .action(async () => {
      const { GeminiCollector } = await import('../collectors/gemini-collector.js');
      const collector = new GeminiCollector();
      if (!collector.isAvailable()) { console.log(`${C.dim}Gemini CLI not found${C.reset}`); return; }
      const sessions = collector.getAllSessions();
      if (sessions.length === 0) { console.log(`${C.dim}No Gemini sessions found${C.reset}`); return; }
      console.log(`\n${C.bright}Gemini CLI Sessions${C.reset}\n`);
      for (const s of sessions.slice(0, 20)) {
        console.log(`  ${C.cyan}${s.id.slice(0, 16)}${C.reset} ${timeAgo(s.createdAt)}`);
        if (s.messages.length > 0) { console.log(`    ${C.dim}${s.messages[0].content.slice(0, 60)}...${C.reset}`); }
      }
      console.log();
    });

  // GC
  program
    .command('gc')
    .description('Run garbage collection and create pack files')
    .option('--keep-days <days>', 'Keep checkpoints from last N days', '7')
    .option('--keep-minimum <count>', 'Keep at least N recent checkpoints', '10')
    .option('--dry-run', 'Show what would be deleted without deleting')
    .action(async (options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const { runGC } = await import('../core/gc.js');
      console.log(`${C.bright}Running garbage collection...${C.reset}\n`);
      const result = runGC(engine, {
        keepDays: parseInt(options.keepDays), keepMinimum: parseInt(options.keepMinimum), dryRun: options.dryRun,
      });
      console.log(`Checkpoints removed: ${result.checkpointsRemoved}`);
      console.log(`Blobs removed: ${result.blobsRemoved}`);
      console.log(`Space reclaimed: ${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB`);
      if (result.sla) {
        const statusColor = result.sla.healthy ? C.green : C.red;
        console.log(`${statusColor}Retention SLA:${C.reset} ${result.sla.healthy ? "healthy" : "alerting"}`);
        console.log(`Pending deletions: ${result.sla.pendingDeletions}`);
        console.log(`GC duration: ${result.sla.runDurationMs} ms`);
        if (result.sla.alerts.length > 0) {
          result.sla.alerts.slice(0, 5).forEach(a =>
            console.log(`  ${a.severity === 'critical' ? C.red : C.yellow}[${a.severity}]${C.reset} ${a.code}: ${a.message}`)
          );
        }
      }
      if (result.packCreated) {
        const ratio = ((1 - result.packSize! / (result.bytesFreed + result.packSize!)) * 100).toFixed(1);
        console.log(`${C.green}Pack created:${C.reset} ${(result.packSize! / 1024 / 1024).toFixed(2)} MB (${ratio}% compression)`);
      }
      console.log();
    });

  // Pack info
  program
    .command('pack-info')
    .description('Show pack file information')
    .action(async () => {
      const packPath = path.join(process.cwd(), '.aitimemachine', 'packs');
      if (!fs.existsSync(packPath)) { console.log(`${C.dim}No pack files found${C.reset}`); return; }
      const packs = fs.readdirSync(packPath).filter(f => f.endsWith('.pack'));
      if (packs.length === 0) { console.log(`${C.dim}No pack files found${C.reset}`); return; }
      console.log(`\n${C.bright}Pack Files${C.reset}\n`);
      let totalSize = 0;
      for (const pack of packs) {
        const packFile = path.join(packPath, pack);
        const idxFile = packFile.replace('.pack', '.idx');
        const packSize = fs.statSync(packFile).size;
        const idx = JSON.parse(fs.readFileSync(idxFile, 'utf-8'));
        const objectCount = Object.keys(idx.objects).length;
        totalSize += packSize;
        console.log(`  ${C.cyan}${pack}${C.reset}`);
        console.log(`    Size: ${(packSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    Objects: ${objectCount}`);
        console.log(`    Avg: ${(packSize / objectCount / 1024).toFixed(2)} KB/object`);
        console.log();
      }
      console.log(`${C.bright}Total:${C.reset} ${(totalSize / 1024 / 1024).toFixed(2)} MB in ${packs.length} pack(s)\n`);
    });

  // Pack verify
  program
    .command('pack-verify')
    .description('Verify pack file integrity')
    .action(async () => {
      const packPath = path.join(process.cwd(), '.aitimemachine', 'packs');
      if (!fs.existsSync(packPath)) { console.log(`${C.dim}No pack files found${C.reset}`); return; }
      const packs = fs.readdirSync(packPath).filter(f => f.endsWith('.pack'));
      if (packs.length === 0) { console.log(`${C.dim}No pack files found${C.reset}`); return; }
      console.log(`\n${C.bright}Verifying pack files...${C.reset}\n`);
      const { PackVerifier } = await import('../core/pack/verifier.js');
      let allValid = true;
      for (const pack of packs) {
        const packFile = path.join(packPath, pack);
        const result = PackVerifier.verify(packFile);
        if (result.valid) { console.log(`  ${C.green}\u2713${C.reset} ${pack}`); }
        else { console.log(`  ${C.red}\u2717${C.reset} ${pack}`); result.errors.forEach(err => console.log(`    ${C.red}${err}${C.reset}`)); allValid = false; }
      }
      console.log();
      if (allValid) { console.log(`${C.green}All packs verified successfully${C.reset}\n`); }
      else { console.log(`${C.red}Some packs failed verification${C.reset}\n`); process.exit(1); }
    });

  // Repack
  program
    .command('repack')
    .description('Repack all pack files for better compression')
    .action(async () => {
      const packPath = path.join(process.cwd(), '.aitimemachine', 'packs');
      if (!fs.existsSync(packPath)) { console.log(`${C.dim}No pack files found${C.reset}`); return; }
      const packs = fs.readdirSync(packPath).filter(f => f.endsWith('.pack'));
      if (packs.length === 0) { console.log(`${C.dim}No pack files found${C.reset}`); return; }
      console.log(`\n${C.bright}Repacking ${packs.length} pack file(s)...${C.reset}\n`);
      const { PackReader } = await import('../core/pack/reader.js');
      const { PackWriter } = await import('../core/pack/writer.js');
      const allObjects = new Map<string, Buffer>();
      let totalOldSize = 0;
      for (const pack of packs) {
        const packFile = path.join(packPath, pack);
        const reader = new PackReader(packFile);
        const hashes = reader.listObjects();
        totalOldSize += fs.statSync(packFile).size;
        for (const hash of hashes) { const content = reader.get(hash); if (content) allObjects.set(hash, content); }
      }
      console.log(`Loaded ${allObjects.size} objects from ${packs.length} pack(s)`);
      console.log(`Old size: ${(totalOldSize / 1024 / 1024).toFixed(2)} MB\n`);
      const writer = new PackWriter();
      for (const [hash, content] of allObjects) { writer.addObject(hash, content); }
      const newPackFile = path.join(packPath, `pack-${Date.now()}.pack`);
      writer.write(newPackFile);
      const newSize = fs.statSync(newPackFile).size;
      const savings = ((1 - newSize / totalOldSize) * 100).toFixed(1);
      console.log(`${C.green}New pack created:${C.reset} ${(newSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`${C.green}Savings:${C.reset} ${savings}%\n`);
      for (const pack of packs) {
        fs.unlinkSync(path.join(packPath, pack));
        fs.unlinkSync(path.join(packPath, pack.replace('.pack', '.idx')));
      }
      console.log(`${C.green}Deleted ${packs.length} old pack(s)${C.reset}\n`);
      const engine = new TimeMachineEngine(process.cwd());
      engine.reloadPacks();
    });

  // AI concepts
  program
    .command('ai-concepts')
    .description('Analyze current conceptual context')
    .action(async () => {
      try {
        const { AITimeConceptTools } = await import('../mcp/ai-time-concept-tools.js');
        const { SqliteRepo } = await import('../store/sqlite_repo.js');
        const dataDir = path.join(os.homedir(), '.aitimemachine');
        const repo = new SqliteRepo(path.join(dataDir, 'events.db'));
        const engine = new TimeMachineEngine(process.cwd());
        const aiTools = new AITimeConceptTools(engine, repo);
        const context = await aiTools.realizeCurrentConcepts();
        console.log(`${C.bright}Conceptual Context Analysis${C.reset}\n`);
        console.log(`${C.cyan}Phase:${C.reset} ${context.currentState.conceptualPhase}`);
        console.log(`${C.cyan}Confidence:${C.reset} ${Math.round(context.currentState.confidence * 100)}%`);
        console.log(`${C.cyan}Velocity:${C.reset} ${context.temporalAwareness.developmentVelocity}\n`);
        if (context.conceptualMap.activeThemes.length > 0) { console.log(`${C.green}Active Themes:${C.reset} ${context.conceptualMap.activeThemes.join(', ')}`); }
        if (context.conceptualMap.completedConcepts.length > 0) { console.log(`${C.blue}Completed:${C.reset} ${context.conceptualMap.completedConcepts.join(', ')}`); }
        if (context.conceptualMap.blockedConcepts.length > 0) { console.log(`${C.red}Blocked:${C.reset} ${context.conceptualMap.blockedConcepts.join(', ')}`); }
        if (context.causalChain.predictedNext.length > 0) {
          console.log(`\n${C.yellow}Predicted Next Actions:${C.reset}`);
          context.causalChain.predictedNext.forEach(action => { console.log(`  - ${action}`); });
        }
      } catch (error) { console.error(`${C.red}Error:${C.reset} ${error instanceof Error ? error.message : 'Unknown error'}`); process.exit(1); }
    });

  // AI focus
  program
    .command('ai-focus')
    .description('Get AI-driven focus recommendations')
    .action(async () => {
      try {
        const { AITimeConceptTools } = await import('../mcp/ai-time-concept-tools.js');
        const { SqliteRepo } = await import('../store/sqlite_repo.js');
        const dataDir = path.join(os.homedir(), '.aitimemachine');
        const repo = new SqliteRepo(path.join(dataDir, 'events.db'));
        const engine = new TimeMachineEngine(process.cwd());
        const aiTools = new AITimeConceptTools(engine, repo);
        const suggestion = await aiTools.suggestConceptualFocus();
        console.log(`${C.bright}Focus Recommendation${C.reset}\n`);
        console.log(`${C.green}Primary Focus:${C.reset} ${suggestion.primaryFocus}`);
        console.log(`${C.cyan}Reasoning:${C.reset} ${suggestion.reasoning}`);
        console.log(`${C.yellow}Time Allocation:${C.reset} ${suggestion.timeAllocation}\n`);
        if (suggestion.riskFactors.length > 0) {
          console.log(`${C.red}Risk Factors:${C.reset}`);
          suggestion.riskFactors.forEach(risk => { console.log(`  - ${risk}`); });
          console.log();
        }
        console.log(`${C.green}Success Metrics:${C.reset}`);
        suggestion.successMetrics.forEach(metric => { console.log(`  - ${metric}`); });
      } catch (error) { console.error(`${C.red}Error:${C.reset} ${error instanceof Error ? error.message : 'Unknown error'}`); process.exit(1); }
    });

  // Interactive timeline
  program
    .command('timeline-interactive')
    .alias('tli')
    .alias('tui')
    .description('Browse timeline interactively with keyboard navigation (TUI)')
    .action(async () => {
      const { runTUI } = await import('./tui-timeline.js');
      await runTUI(process.cwd());
    });
}
