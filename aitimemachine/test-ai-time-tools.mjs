#!/usr/bin/env node

/**
 * Test script for AI Time & Concept Realization tools
 */

import { AITimeConceptTools } from './lib/mcp/ai-time-concept-tools.js';

async function testAITimeTools() {
  console.log('🧪 Testing AI Time & Concept Realization Tools...\n');
  
  try {
    // Mock engine and repo for testing
    const mockEngine = {
      // Add minimal mock methods as needed
    };
    
    const mockRepo = {
      listCheckpointsNewestFirst: (projectId, limit) => [
        {
          checkpointId: 'cp_123',
          name: 'implementing user authentication',
          createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        },
        {
          checkpointId: 'cp_124', 
          name: 'fixed auth bug',
          createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        },
        {
          checkpointId: 'cp_125',
          name: 'working on user store',
          createdAt: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
        }
      ]
    };
    
    const aiTools = new AITimeConceptTools(mockEngine, mockRepo);
    
    console.log('1. Testing Concept Realization...');
    const concepts = await aiTools.realizeCurrentConcepts();
    console.log('✅ Concepts:', {
      phase: concepts.currentState.conceptualPhase,
      confidence: concepts.currentState.confidence,
      activeThemes: concepts.conceptualMap.activeThemes,
      velocity: concepts.temporalAwareness.developmentVelocity
    });
    
    console.log('\n2. Testing Time Realization...');
    const timeContext = await aiTools.realizeTimeContext();
    console.log('✅ Time Context:', {
      sinceLastChange: timeContext.relativeTime.sinceLastChange,
      workingTimeToday: timeContext.relativeTime.workingTimeToday,
      avgInterval: timeContext.temporalPatterns.averageTimeBetweenCheckpoints
    });
    
    console.log('\n3. Testing Focus Suggestion...');
    const focus = await aiTools.suggestConceptualFocus();
    console.log('✅ Focus Suggestion:', {
      primaryFocus: focus.primaryFocus,
      reasoning: focus.reasoning,
      timeAllocation: focus.timeAllocation
    });
    
    console.log('\n4. Testing Transition Analysis...');
    const transitions = await aiTools.analyzeStateTransitions();
    console.log('✅ Transitions:', {
      transitionCount: transitions.transitions.length,
      patterns: transitions.patterns,
      recommendations: transitions.recommendations
    });
    
    console.log('\n🎉 All tests passed! AI Time & Concept tools are working.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAITimeTools();
}
