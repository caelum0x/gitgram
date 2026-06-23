/**
 * AI Time & Concept Realization Tools
 * 
 * Enhanced MCP tools to help AIs understand temporal context and conceptual relationships
 * in development workflows. Addresses common AI confusion about time, state, and causality.
 */

import { TimeMachineEngine } from '../core/engine.js';
import { CheckpointRow, Repo } from '../store/repo.js';

type ConceptThemes = {
  active: string[];
  completed: string[];
  blocked: string[];
  emerging: string[];
};

type FocusDecision = {
  concept: string;
  reasoning: string;
  suggestedTime: string;
};

type StateTransition = {
  from: string;
  to: string;
  trigger: string;
  duration: string;
  success: boolean;
};

export interface ConceptualContext {
  currentState: {
    timestamp: string;
    checkpointId?: string;
    workingDirectory: string;
    conceptualPhase: string; // "exploration", "implementation", "debugging", "refactoring"
    confidence: number; // 0-1 how certain we are about current state
  };
  temporalAwareness: {
    timeElapsed: string;
    lastSignificantChange: string;
    developmentVelocity: 'slow' | 'moderate' | 'fast';
    contextSwitches: number; // how many different concepts worked on
  };
  conceptualMap: {
    activeThemes: string[]; // current focus areas
    completedConcepts: string[]; // what's been finished
    blockedConcepts: string[]; // what's stuck
    emergingPatterns: string[]; // new insights discovered
  };
  causalChain: {
    lastActions: Array<{
      action: string;
      timestamp: string;
      outcome: 'success' | 'failure' | 'partial' | 'unknown';
      conceptualImpact: string;
    }>;
    predictedNext: string[]; // likely next actions
  };
}

export interface TimeRealizationContext {
  absoluteTime: {
    now: string;
    sessionStart: string;
    lastCheckpoint: string;
  };
  relativeTime: {
    sinceLastChange: string;
    sinceLastSuccess: string;
    sinceLastFailure: string;
    workingTimeToday: string;
  };
  temporalPatterns: {
    typicalSessionLength: string;
    mostProductiveTimeOfDay: string;
    averageTimeBetweenCheckpoints: string;
    conceptCompletionRate: string; // concepts per hour
  };
}

export class AITimeConceptTools {
  constructor(
    private engine: TimeMachineEngine,
    private repo: Repo
  ) { }

  /**
   * 🧠 AI Concept Realization - Help AI understand what concepts are active
   */
  async realizeCurrentConcepts(): Promise<ConceptualContext> {
    // Try to find any project with checkpoints
    const allProjects = this.repo.listProjects();
    let checkpoints: CheckpointRow[] = [];

    if (allProjects.length > 0) {
      // Use the first project that has checkpoints
      for (const project of allProjects) {
        const projectCheckpoints = this.repo.listCheckpointsNewestFirst(project.projectId, 10);
        if (projectCheckpoints.length > 0) {
          checkpoints = projectCheckpoints;
          break;
        }
      }
    }

    const recent = checkpoints.slice(0, 10);

    // Analyze recent checkpoint names for conceptual themes
    const themes = this.extractConceptualThemes(recent.map((cp) => cp.name));
    const phase = this.inferDevelopmentPhase(recent);

    return {
      currentState: {
        timestamp: new Date().toISOString(),
        checkpointId: recent[0]?.checkpointId,
        workingDirectory: process.cwd(),
        conceptualPhase: phase,
        confidence: this.calculateStateConfidence(recent)
      },
      temporalAwareness: {
        timeElapsed: this.calculateTimeElapsed(recent),
        lastSignificantChange: this.findLastSignificantChange(recent),
        developmentVelocity: this.assessVelocity(recent),
        contextSwitches: this.countContextSwitches(recent)
      },
      conceptualMap: {
        activeThemes: themes.active,
        completedConcepts: themes.completed,
        blockedConcepts: themes.blocked,
        emergingPatterns: themes.emerging
      },
      causalChain: {
        lastActions: await this.buildCausalChain(recent),
        predictedNext: this.predictNextActions(themes, phase)
      }
    };
  }

  /**
   * ⏰ Time Realization - Help AI understand temporal context
   */
  async realizeTimeContext(): Promise<TimeRealizationContext> {
    // Try to find any project with checkpoints
    const allProjects = this.repo.listProjects();
    let checkpoints: CheckpointRow[] = [];

    if (allProjects.length > 0) {
      for (const project of allProjects) {
        const projectCheckpoints = this.repo.listCheckpointsNewestFirst(project.projectId, 50);
        if (projectCheckpoints.length > 0) {
          checkpoints = projectCheckpoints;
          break;
        }
      }
    }

    const now = new Date();

    return {
      absoluteTime: {
        now: now.toISOString(),
        sessionStart: this.findSessionStart(checkpoints),
        lastCheckpoint: checkpoints[0]?.createdAt || 'never'
      },
      relativeTime: {
        sinceLastChange: this.timeSince(checkpoints[0]?.createdAt),
        sinceLastSuccess: this.timeSinceLastSuccess(checkpoints),
        sinceLastFailure: this.timeSinceLastFailure(checkpoints),
        workingTimeToday: this.calculateWorkingTimeToday(checkpoints)
      },
      temporalPatterns: {
        typicalSessionLength: this.calculateTypicalSessionLength(checkpoints),
        mostProductiveTimeOfDay: this.findMostProductiveTime(checkpoints),
        averageTimeBetweenCheckpoints: this.calculateAverageInterval(checkpoints),
        conceptCompletionRate: this.calculateConceptRate(checkpoints)
      }
    };
  }

  /**
   * 🎯 Concept Focus - Help AI understand what to focus on now
   */
  async suggestConceptualFocus(): Promise<{
    primaryFocus: string;
    reasoning: string;
    timeAllocation: string;
    riskFactors: string[];
    successMetrics: string[];
  }> {
    const concepts = await this.realizeCurrentConcepts();
    const timeCtx = await this.realizeTimeContext();

    const focus = this.determinePrimaryFocus(concepts, timeCtx);

    return {
      primaryFocus: focus.concept,
      reasoning: focus.reasoning,
      timeAllocation: focus.suggestedTime,
      riskFactors: this.identifyRisks(concepts),
      successMetrics: this.defineSuccessMetrics(focus.concept)
    };
  }

  /**
   * 🔄 Temporal State Transition - Help AI understand state changes over time
   */
  async analyzeStateTransitions(): Promise<{
    transitions: Array<{
      from: string;
      to: string;
      trigger: string;
      duration: string;
      success: boolean;
    }>;
    patterns: string[];
    recommendations: string[];
  }> {
    // Try to find any project with checkpoints
    const allProjects = this.repo.listProjects();
    let checkpoints: CheckpointRow[] = [];

    if (allProjects.length > 0) {
      for (const project of allProjects) {
        const projectCheckpoints = this.repo.listCheckpointsNewestFirst(project.projectId, 20);
        if (projectCheckpoints.length > 0) {
          checkpoints = projectCheckpoints;
          break;
        }
      }
    }

    const transitions = this.extractStateTransitions(checkpoints);

    return {
      transitions,
      patterns: this.identifyTransitionPatterns(transitions),
      recommendations: this.generateTransitionRecommendations(transitions)
    };
  }

  // Private helper methods
  private extractConceptualThemes(names: string[]) {
    const keywords = names.join(' ').toLowerCase();

    return {
      active: this.extractActiveThemes(keywords),
      completed: this.extractCompletedThemes(keywords),
      blocked: this.extractBlockedThemes(keywords),
      emerging: this.extractEmergingThemes(keywords)
    };
  }

  private extractActiveThemes(text: string): string[] {
    const activePatterns = [
      /working on (\w+)/g,
      /implementing (\w+)/g,
      /adding (\w+)/g,
      /building (\w+)/g
    ];

    const themes: string[] = [];
    activePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        themes.push(match[1]);
      }
    });

    return [...new Set(themes)];
  }

  private extractCompletedThemes(text: string): string[] {
    const completedPatterns = [
      /completed (\w+)/g,
      /finished (\w+)/g,
      /done with (\w+)/g,
      /fixed (\w+)/g
    ];

    const themes: string[] = [];
    completedPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        themes.push(match[1]);
      }
    });

    return [...new Set(themes)];
  }

  private extractBlockedThemes(text: string): string[] {
    const blockedPatterns = [
      /stuck on (\w+)/g,
      /blocked by (\w+)/g,
      /failing (\w+)/g,
      /error in (\w+)/g
    ];

    const themes: string[] = [];
    blockedPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        themes.push(match[1]);
      }
    });

    return [...new Set(themes)];
  }

  private extractEmergingThemes(text: string): string[] {
    const emergingPatterns = [
      /discovered (\w+)/g,
      /realized (\w+)/g,
      /new (\w+)/g,
      /exploring (\w+)/g
    ];

    const themes: string[] = [];
    emergingPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        themes.push(match[1]);
      }
    });

    return [...new Set(themes)];
  }

  private inferDevelopmentPhase(checkpoints: CheckpointRow[]): string {
    if (checkpoints.length === 0) return 'initialization';

    const recentNames = checkpoints.slice(0, 5).map(cp => cp.name.toLowerCase());
    const text = recentNames.join(' ');

    if (text.includes('debug') || text.includes('fix') || text.includes('error')) {
      return 'debugging';
    }
    if (text.includes('refactor') || text.includes('cleanup') || text.includes('optimize')) {
      return 'refactoring';
    }
    if (text.includes('implement') || text.includes('add') || text.includes('create')) {
      return 'implementation';
    }
    if (text.includes('explore') || text.includes('research') || text.includes('investigate')) {
      return 'exploration';
    }

    return 'maintenance';
  }

  private calculateStateConfidence(checkpoints: CheckpointRow[]): number {
    if (checkpoints.length === 0) return 0.1;

    const recent = checkpoints.slice(0, 3);
    const hasDescriptiveNames = recent.every(cp => cp.name.length > 10);
    const hasRecentActivity = recent.length > 0 &&
      new Date().getTime() - new Date(recent[0].createdAt).getTime() < 3600000; // 1 hour

    let confidence = 0.5;
    if (hasDescriptiveNames) confidence += 0.3;
    if (hasRecentActivity) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private calculateTimeElapsed(checkpoints: CheckpointRow[]): string {
    if (checkpoints.length === 0) return 'unknown';

    const latest = new Date(checkpoints[0].createdAt);
    const now = new Date();
    const diffMs = now.getTime() - latest.getTime();

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);

    if (minutes < 60) return `${minutes} minutes`;
    return `${hours} hours`;
  }

  private findLastSignificantChange(checkpoints: CheckpointRow[]): string {
    const significant = checkpoints.find(cp =>
      cp.name.toLowerCase().includes('complete') ||
      cp.name.toLowerCase().includes('working') ||
      cp.name.toLowerCase().includes('fixed')
    );

    return significant ? this.timeSince(significant.createdAt) : 'unknown';
  }

  private assessVelocity(checkpoints: CheckpointRow[]): 'slow' | 'moderate' | 'fast' {
    if (checkpoints.length < 2) return 'slow';

    const recent = checkpoints.slice(0, 5);
    const timeSpan = new Date(recent[0].createdAt).getTime() -
      new Date(recent[recent.length - 1].createdAt).getTime();
    const hoursSpan = timeSpan / 3600000;
    const checkpointsPerHour = recent.length / hoursSpan;

    if (checkpointsPerHour > 2) return 'fast';
    if (checkpointsPerHour > 0.5) return 'moderate';
    return 'slow';
  }

  private countContextSwitches(checkpoints: CheckpointRow[]): number {
    if (checkpoints.length < 2) return 0;

    let switches = 0;
    let lastTheme = '';

    for (const cp of checkpoints.slice(0, 10)) {
      const theme = this.extractPrimaryTheme(cp.name);
      if (theme && theme !== lastTheme) {
        switches++;
        lastTheme = theme;
      }
    }

    return switches;
  }

  private extractPrimaryTheme(name: string): string {
    const words = name.toLowerCase().split(' ');
    const themeWords = ['auth', 'ui', 'api', 'db', 'test', 'config', 'deploy'];

    for (const word of words) {
      for (const theme of themeWords) {
        if (word.includes(theme)) return theme;
      }
    }

    return words[0] || '';
  }

  private async buildCausalChain(checkpoints: CheckpointRow[]) {
    return checkpoints.slice(0, 5).map(cp => ({
      action: cp.name,
      timestamp: cp.createdAt,
      outcome: this.inferOutcome(cp.name),
      conceptualImpact: this.assessConceptualImpact(cp.name)
    }));
  }

  private inferOutcome(name: string): 'success' | 'failure' | 'partial' | 'unknown' {
    const lower = name.toLowerCase();
    if (lower.includes('fixed') || lower.includes('working') || lower.includes('complete')) {
      return 'success';
    }
    if (lower.includes('error') || lower.includes('broken') || lower.includes('failed')) {
      return 'failure';
    }
    if (lower.includes('partial') || lower.includes('wip') || lower.includes('progress')) {
      return 'partial';
    }
    return 'unknown';
  }

  private assessConceptualImpact(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('major') || lower.includes('breaking') || lower.includes('refactor')) {
      return 'high';
    }
    if (lower.includes('minor') || lower.includes('tweak') || lower.includes('adjust')) {
      return 'low';
    }
    return 'medium';
  }

  private predictNextActions(themes: ConceptThemes, phase: string): string[] {
    const predictions: string[] = [];

    if (phase === 'debugging') {
      predictions.push('test fix', 'verify solution', 'add error handling');
    } else if (phase === 'implementation') {
      predictions.push('add tests', 'refactor code', 'update documentation');
    } else if (phase === 'exploration') {
      predictions.push('create prototype', 'define requirements', 'research alternatives');
    }

    if (themes.blocked.length > 0) {
      predictions.push('resolve blockers', 'seek help', 'try alternative approach');
    }

    return predictions;
  }

  private timeSince(timestamp: string | undefined): string {
    if (!timestamp) return 'unknown';

    const diff = new Date().getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} days ago`;
    if (hours > 0) return `${hours} hours ago`;
    return `${minutes} minutes ago`;
  }

  private findSessionStart(checkpoints: CheckpointRow[]): string {
    // Find first checkpoint of current day
    const today = new Date().toDateString();
    const todayCheckpoints = checkpoints.filter(cp =>
      new Date(cp.createdAt).toDateString() === today
    );

    return todayCheckpoints.length > 0 ?
      todayCheckpoints[todayCheckpoints.length - 1].createdAt :
      new Date().toISOString();
  }

  private timeSinceLastSuccess(checkpoints: CheckpointRow[]): string {
    const success = checkpoints.find(cp => this.inferOutcome(cp.name) === 'success');
    return success ? this.timeSince(success.createdAt) : 'unknown';
  }

  private timeSinceLastFailure(checkpoints: CheckpointRow[]): string {
    const failure = checkpoints.find(cp => this.inferOutcome(cp.name) === 'failure');
    return failure ? this.timeSince(failure.createdAt) : 'unknown';
  }

  private calculateWorkingTimeToday(checkpoints: CheckpointRow[]): string {
    const today = new Date().toDateString();
    const todayCheckpoints = checkpoints.filter(cp =>
      new Date(cp.createdAt).toDateString() === today
    );

    if (todayCheckpoints.length < 2) return 'less than 1 hour';

    const first = new Date(todayCheckpoints[todayCheckpoints.length - 1].createdAt);
    const last = new Date(todayCheckpoints[0].createdAt);
    const hours = (last.getTime() - first.getTime()) / 3600000;

    return `${Math.round(hours)} hours`;
  }

  private calculateTypicalSessionLength(checkpoints: CheckpointRow[]): string {
    if (checkpoints.length < 2) return 'unknown';

    // Group checkpoints into sessions (gap > 2 hours = new session)
    const sessions: number[] = [];
    let currentSessionStart = new Date(checkpoints[checkpoints.length - 1].createdAt).getTime();
    let lastTime = currentSessionStart;

    // Iterate oldest to newest
    const sorted = [...checkpoints].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (let i = 1; i < sorted.length; i++) {
      const time = new Date(sorted[i].createdAt).getTime();
      if (time - lastTime > 2 * 60 * 60 * 1000) {
        // End of session
        sessions.push(lastTime - currentSessionStart);
        currentSessionStart = time;
      }
      lastTime = time;
    }
    // Push last session
    sessions.push(lastTime - currentSessionStart);

    // Calculate average (excluding sessions < 5 mins)
    const validSessions = sessions.filter(s => s > 5 * 60 * 1000);
    if (validSessions.length === 0) return 'variable';

    const avgMs = validSessions.reduce((a, b) => a + b, 0) / validSessions.length;
    const hours = Math.floor(avgMs / 3600000);
    const mins = Math.round((avgMs % 3600000) / 60000);

    return `${hours}h ${mins}m`;
  }

  private findMostProductiveTime(checkpoints: CheckpointRow[]): string {
    const hourCounts: { [hour: number]: number } = {};

    checkpoints.forEach(cp => {
      const hour = new Date(cp.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const mostActive = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)[0];

    if (!mostActive) return 'unknown';

    const hour = parseInt(mostActive[0]);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;

    return `${displayHour}:00 ${period}`;
  }

  private calculateAverageInterval(checkpoints: CheckpointRow[]): string {
    if (checkpoints.length < 2) return 'unknown';

    // Sort oldest to newest
    const sorted = [...checkpoints].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let totalInterval = 0;
    let count = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = new Date(sorted[i + 1].createdAt).getTime() -
        new Date(sorted[i].createdAt).getTime();

      // Ignore gaps > 4 hours (likely breaks/sleep)
      if (diff < 4 * 60 * 60 * 1000) {
        totalInterval += diff;
        count++;
      }
    }

    if (count === 0) return 'variable';

    const avgMs = totalInterval / count;
    const avgMinutes = Math.round(avgMs / 60000);

    return `${avgMinutes} minutes`;
  }

  private calculateConceptRate(checkpoints: CheckpointRow[]): string {
    if (checkpoints.length < 5) return 'insufficient data';

    // Count "completed" concepts
    const completed = checkpoints.filter(cp =>
      this.inferOutcome(cp.name) === 'success'
    ).length;

    // Calculate time span in hours
    const oldest = new Date(checkpoints[checkpoints.length - 1].createdAt).getTime();
    const newest = new Date(checkpoints[0].createdAt).getTime();
    const hours = (newest - oldest) / 3600000;

    if (hours < 1) return 'calculating...';

    const rate = (completed / hours).toFixed(1);
    return `${rate} concepts/hour`;
  }

  private determinePrimaryFocus(concepts: ConceptualContext, _timeCtx: TimeRealizationContext): FocusDecision {
    if (concepts.conceptualMap.blockedConcepts.length > 0) {
      return {
        concept: `Resolve: ${concepts.conceptualMap.blockedConcepts[0]}`,
        reasoning: 'Blocked concepts prevent progress on other areas',
        suggestedTime: '30-60 minutes'
      };
    }

    if (concepts.conceptualMap.activeThemes.length > 0) {
      return {
        concept: `Continue: ${concepts.conceptualMap.activeThemes[0]}`,
        reasoning: 'Build momentum on active work',
        suggestedTime: '45-90 minutes'
      };
    }

    return {
      concept: 'Explore new concepts',
      reasoning: 'No active work detected, time to start something new',
      suggestedTime: '60-120 minutes'
    };
  }

  private identifyRisks(concepts: ConceptualContext): string[] {
    const risks: string[] = [];

    if (concepts.temporalAwareness.contextSwitches > 3) {
      risks.push('High context switching may reduce focus');
    }

    if (concepts.conceptualMap.blockedConcepts.length > 2) {
      risks.push('Multiple blockers may indicate systemic issues');
    }

    if (concepts.currentState.confidence < 0.5) {
      risks.push('Low confidence in current state understanding');
    }

    return risks;
  }

  private defineSuccessMetrics(concept: string): string[] {
    return [
      'Clear progress checkpoint created',
      'No new blockers introduced',
      'Concept moves to completed state',
      'Tests pass (if applicable)'
    ];
  }

  private extractStateTransitions(checkpoints: CheckpointRow[]): StateTransition[] {
    const transitions: StateTransition[] = [];

    for (let i = 0; i < checkpoints.length - 1; i++) {
      const current = checkpoints[i];
      const previous = checkpoints[i + 1];

      const fromState = this.inferDevelopmentPhase([previous]);
      const toState = this.inferDevelopmentPhase([current]);

      if (fromState !== toState) {
        const duration = new Date(current.createdAt).getTime() -
          new Date(previous.createdAt).getTime();

        transitions.push({
          from: fromState,
          to: toState,
          trigger: current.name,
          duration: this.formatDuration(duration),
          success: this.inferOutcome(current.name) === 'success'
        });
      }
    }

    return transitions;
  }

  private formatDuration(ms: number): string {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }

  private identifyTransitionPatterns(transitions: StateTransition[]): string[] {
    const patterns: string[] = [];

    const debuggingTransitions = transitions.filter(t =>
      t.to === 'debugging' || t.from === 'debugging'
    );

    if (debuggingTransitions.length > transitions.length * 0.4) {
      patterns.push('High debugging frequency - consider more testing');
    }

    const quickTransitions = transitions.filter(t =>
      parseInt(t.duration) < 30
    );

    if (quickTransitions.length > transitions.length * 0.3) {
      patterns.push('Frequent quick transitions - may indicate uncertainty');
    }

    return patterns;
  }

  private generateTransitionRecommendations(transitions: StateTransition[]): string[] {
    const recommendations: string[] = [];

    const failedTransitions = transitions.filter(t => !t.success);
    if (failedTransitions.length > 0) {
      recommendations.push('Consider smaller, incremental changes to reduce failure risk');
    }

    const longTransitions = transitions.filter(t =>
      parseInt(t.duration) > 120
    );
    if (longTransitions.length > 0) {
      recommendations.push('Break down long transitions into smaller checkpoints');
    }

    return recommendations;
  }
}
