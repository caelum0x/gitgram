#!/usr/bin/env node

/**
 * Complete demonstration of AI Time & Concept Realization
 */

import { AITimeConceptTools } from './lib/mcp/ai-time-concept-tools.js';
import { SqliteRepo } from './lib/store/sqlite_repo.js';
import { TimeMachineEngine } from './lib/core/engine.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

async function demonstrateAITimeRealization() {
  console.log('🚀 AI Time & Concept Realization Demo\n');
  
  // Setup
  const dataDir = path.join(os.homedir(), '.aitimemachine-demo');
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });
  
  const repo = new SqliteRepo(path.join(dataDir, 'demo.db'));
  const engine = new TimeMachineEngine(process.cwd());
  const aiTools = new AITimeConceptTools(engine, repo);
  
  // Create realistic development scenario
  const projectId = 'demo-project';
  repo.insertProject({
    projectId,
    rootPath: process.cwd(),
    name: 'Authentication System',
    ignoreGlobs: ['node_modules', '.git']
  });
  
  // Simulate development timeline
  const checkpoints = [
    { name: 'exploring authentication options', phase: 'exploration' },
    { name: 'implementing user registration form', phase: 'implementation' },
    { name: 'adding password validation', phase: 'implementation' },
    { name: 'working on database connection', phase: 'implementation' },
    { name: 'stuck on connection pool error', phase: 'debugging' },
    { name: 'fixed database connection issue', phase: 'debugging' },
    { name: 'implementing login flow', phase: 'implementation' },
    { name: 'adding session management', phase: 'implementation' },
    { name: 'refactoring auth middleware', phase: 'refactoring' },
    { name: 'completed authentication system', phase: 'completion' }
  ];
  
  // Insert checkpoints with realistic timestamps
  const now = Date.now();
  checkpoints.forEach((cp, i) => {
    const timestamp = new Date(now - (checkpoints.length - i) * 30 * 60 * 1000); // 30 min intervals
    repo.insertCheckpoint({
      checkpointId: `cp_${i.toString().padStart(3, '0')}`,
      projectId,
      name: cp.name,
      scope: 'files',
      manifestBlobHash: `hash_${i}`,
      createdAt: timestamp.toISOString()
    });
  });
  
  console.log('📊 Development Timeline Created (10 checkpoints over 5 hours)\n');
  
  // Demonstrate AI Time & Concept Realization
  console.log('🧠 AI Concept Realization:');
  console.log('=' .repeat(50));
  const concepts = await aiTools.realizeCurrentConcepts();
  
  console.log(`Phase: ${concepts.currentState.conceptualPhase}`);
  console.log(`Confidence: ${Math.round(concepts.currentState.confidence * 100)}%`);
  console.log(`Active Themes: ${concepts.conceptualMap.activeThemes.join(', ') || 'None'}`);
  console.log(`Completed: ${concepts.conceptualMap.completedConcepts.join(', ') || 'None'}`);
  console.log(`Velocity: ${concepts.temporalAwareness.developmentVelocity}`);
  console.log(`Context Switches: ${concepts.temporalAwareness.contextSwitches}`);
  
  console.log('\n⏰ Time Realization:');
  console.log('=' .repeat(50));
  const timeContext = await aiTools.realizeTimeContext();
  
  console.log(`Since Last Change: ${timeContext.relativeTime.sinceLastChange}`);
  console.log(`Working Time Today: ${timeContext.relativeTime.workingTimeToday}`);
  console.log(`Average Interval: ${timeContext.temporalPatterns.averageTimeBetweenCheckpoints}`);
  console.log(`Most Productive: ${timeContext.temporalPatterns.mostProductiveTimeOfDay}`);
  
  console.log('\n🎯 Focus Recommendation:');
  console.log('=' .repeat(50));
  const focus = await aiTools.suggestConceptualFocus();
  
  console.log(`Primary Focus: ${focus.primaryFocus}`);
  console.log(`Reasoning: ${focus.reasoning}`);
  console.log(`Time Allocation: ${focus.timeAllocation}`);
  
  if (focus.riskFactors.length > 0) {
    console.log(`Risk Factors: ${focus.riskFactors.join(', ')}`);
  }
  
  console.log('\n🔄 Transition Analysis:');
  console.log('=' .repeat(50));
  const transitions = await aiTools.analyzeStateTransitions();
  
  console.log(`Transitions Found: ${transitions.transitions.length}`);
  if (transitions.transitions.length > 0) {
    console.log('Recent Transitions:');
    transitions.transitions.slice(0, 3).forEach(t => {
      console.log(`  ${t.from} → ${t.to} (${t.duration}) ${t.success ? '✅' : '❌'}`);
    });
  }
  
  if (transitions.patterns.length > 0) {
    console.log(`Patterns: ${transitions.patterns.join(', ')}`);
  }
  
  console.log('\n🎉 Demo Complete!');
  console.log('\nThis demonstrates how AI Time & Concept Realization helps AIs:');
  console.log('• Understand temporal context and development rhythm');
  console.log('• Track conceptual progress and identify blockers');
  console.log('• Provide intelligent focus recommendations');
  console.log('• Learn from workflow patterns and transitions');
  console.log('• Maintain context across development sessions');
  
  // Cleanup
  fs.rmSync(dataDir, { recursive: true, force: true });
}

demonstrateAITimeRealization().catch(console.error);
