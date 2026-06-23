#!/usr/bin/env node
import * as readline from 'readline';
import { TimeMachineEngine } from '../core/engine.js';
import type { TimePointSummary, TimePoint } from '../core/types.js';

// ANSI escape codes
const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  clear: `${CSI}2J${CSI}H`,
  clearLine: `${CSI}2K`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  moveUp: (n: number) => `${CSI}${n}A`,
  moveDown: (n: number) => `${CSI}${n}B`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  reset: `${CSI}0m`,
  inverse: `${CSI}7m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  blue: `${CSI}34m`,
  cyan: `${CSI}36m`,
};

const timeAgo = (date: Date): string => {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

type Mode = 'list' | 'detail' | 'confirm' | 'diff';

interface State {
  checkpoints: TimePointSummary[];
  selected: number;
  mode: Mode;
  message: string;
  scroll: number;
  detail?: TimePoint;
  diffResult?: { added: string[]; modified: string[]; deleted: string[] };
}

export class TUITimeline {
  private engine: TimeMachineEngine;
  private state: State;
  private pageSize: number;
  private running = true;

  constructor(projectPath: string) {
    this.engine = new TimeMachineEngine(projectPath);
    this.pageSize = Math.max(5, (process.stdout.rows || 20) - 8);
    this.state = {
      checkpoints: this.engine.listTimePoints().reverse(),
      selected: 0,
      mode: 'list',
      message: '',
      scroll: 0,
    };
  }

  private write(text: string): void {
    process.stdout.write(text);
  }

  private render(): void {
    const { checkpoints, selected, mode, message, scroll } = this.state;
    
    this.write(ansi.clear);
    this.write(ansi.hideCursor);

    if (checkpoints.length === 0) {
      this.write(`${ansi.yellow}No checkpoints found. Run: aitm init${ansi.reset}\n`);
      return;
    }

    // Header
    this.write(`${ansi.cyan}${ansi.bold}📅 Timeline Browser${ansi.reset}`);
    this.write(`${ansi.dim} (${checkpoints.length} checkpoints)${ansi.reset}\n\n`);

    if (mode === 'confirm') {
      this.renderConfirm();
    } else if (mode === 'detail') {
      this.renderDetail();
    } else if (mode === 'diff') {
      this.renderDiff();
    } else {
      this.renderList();
    }

    // Footer
    this.write('\n');
    if (message) {
      const color = message.startsWith('✓') ? ansi.green : 
                    message.startsWith('✗') ? ansi.red : ansi.yellow;
      this.write(`${color}${message}${ansi.reset}\n`);
    }
    
    if (mode === 'list') {
      this.write(`${ansi.dim}↑↓ navigate • Enter details • r restore • d diff • q quit${ansi.reset}\n`);
    } else if (mode === 'detail' || mode === 'diff') {
      this.write(`${ansi.dim}r restore • q back${ansi.reset}\n`);
    }
  }

  private renderList(): void {
    const { checkpoints, selected, scroll } = this.state;
    const start = scroll;
    const end = Math.min(checkpoints.length, start + this.pageSize);

    for (let i = start; i < end; i++) {
      const cp = checkpoints[i];
      const isSelected = i === selected;
      
      const icon = cp.description.includes('Before') ? '🔵' :
                   cp.description.includes('DONE') || cp.description.includes('After') ? '✅' :
                   cp.description.includes('FAILED') ? '❌' : '📌';

      const prefix = isSelected ? `${ansi.green}▶${ansi.reset}` : ' ';
      const highlight = isSelected ? ansi.inverse : '';
      const reset = isSelected ? ansi.reset : '';
      const desc = cp.description.slice(0, 50) + (cp.description.length > 50 ? '...' : '');
      const time = `${ansi.dim}${timeAgo(cp.timestamp)}${ansi.reset}`;

      this.write(`${prefix} ${icon} ${highlight}${desc}${reset} ${time}\n`);
    }

    // Scroll indicator
    if (checkpoints.length > this.pageSize) {
      const pct = Math.round((selected / (checkpoints.length - 1)) * 100);
      this.write(`${ansi.dim}[${pct}%]${ansi.reset}\n`);
    }
  }

  private renderDetail(): void {
    const cp = this.state.checkpoints[this.state.selected];
    const full = this.state.detail || this.engine.getTimePoint(cp.id);
    if (!full) return;

    this.write(`${ansi.bold}ID:${ansi.reset} ${cp.id}\n`);
    this.write(`${ansi.bold}Description:${ansi.reset} ${cp.description}\n`);
    this.write(`${ansi.bold}Time:${ansi.reset} ${cp.timestamp.toLocaleString()} (${timeAgo(cp.timestamp)})\n`);
    this.write(`${ansi.bold}Files:${ansi.reset} ${cp.stats.totalFiles} (${formatSize(cp.stats.totalSize)})\n`);
    this.write(`${ansi.bold}Changes:${ansi.reset} ${cp.changesCount || 0}\n`);
    
    if (full.trigger) {
      this.write(`${ansi.bold}Trigger:${ansi.reset} ${full.trigger.type}${full.trigger.action ? ` (${full.trigger.action})` : ''}\n`);
    }

    this.write('\n');
    
    if (full.changes) {
      const { added, modified, deleted } = full.changes;
      if (added.length > 0) {
        this.write(`${ansi.green}Added (${added.length}):${ansi.reset}\n`);
        added.slice(0, 5).forEach(f => this.write(`  ${ansi.green}+ ${f}${ansi.reset}\n`));
        if (added.length > 5) this.write(`  ${ansi.dim}... and ${added.length - 5} more${ansi.reset}\n`);
      }
      if (modified.length > 0) {
        this.write(`${ansi.yellow}Modified (${modified.length}):${ansi.reset}\n`);
        modified.slice(0, 5).forEach(f => this.write(`  ${ansi.yellow}~ ${f}${ansi.reset}\n`));
        if (modified.length > 5) this.write(`  ${ansi.dim}... and ${modified.length - 5} more${ansi.reset}\n`);
      }
      if (deleted.length > 0) {
        this.write(`${ansi.red}Deleted (${deleted.length}):${ansi.reset}\n`);
        deleted.slice(0, 5).forEach(f => this.write(`  ${ansi.red}- ${f}${ansi.reset}\n`));
        if (deleted.length > 5) this.write(`  ${ansi.dim}... and ${deleted.length - 5} more${ansi.reset}\n`);
      }
    }
  }

  private renderConfirm(): void {
    const cp = this.state.checkpoints[this.state.selected];
    this.write(`${ansi.yellow}${ansi.bold}⚠ Restore to this checkpoint?${ansi.reset}\n\n`);
    this.write(`  ${cp.description}\n`);
    this.write(`  ${ansi.dim}${cp.timestamp.toLocaleString()}${ansi.reset}\n\n`);
    this.write(`Press ${ansi.green}${ansi.bold}y${ansi.reset} to confirm, any other key to cancel\n`);
  }

  private renderDiff(): void {
    const { diffResult } = this.state;
    if (!diffResult) return;

    const { added, modified, deleted } = diffResult;
    this.write(`${ansi.bold}Diff with previous checkpoint:${ansi.reset}\n\n`);
    this.write(`${ansi.green}+${added.length} added${ansi.reset}  `);
    this.write(`${ansi.yellow}~${modified.length} modified${ansi.reset}  `);
    this.write(`${ansi.red}-${deleted.length} deleted${ansi.reset}\n\n`);

    if (added.length > 0) {
      added.slice(0, 5).forEach(f => this.write(`${ansi.green}+ ${f}${ansi.reset}\n`));
    }
    if (modified.length > 0) {
      modified.slice(0, 5).forEach(f => this.write(`${ansi.yellow}~ ${f}${ansi.reset}\n`));
    }
    if (deleted.length > 0) {
      deleted.slice(0, 5).forEach(f => this.write(`${ansi.red}- ${f}${ansi.reset}\n`));
    }
  }

  private handleInput(key: string): void {
    const { checkpoints, selected, mode } = this.state;

    if (mode === 'confirm') {
      if (key === 'y' || key === 'Y') {
        try {
          this.engine.restore(checkpoints[selected].id);
          this.state.message = '✓ Restored successfully';
        } catch (e: any) {
          this.state.message = `✗ Error: ${e.message}`;
        }
      } else {
        this.state.message = 'Cancelled';
      }
      this.state.mode = 'list';
      return;
    }

    if (mode === 'detail' || mode === 'diff') {
      if (key === 'q' || key === '\x1b') {
        this.state.mode = 'list';
        this.state.detail = undefined;
        this.state.diffResult = undefined;
      } else if (key === 'r') {
        this.state.mode = 'confirm';
      }
      return;
    }

    // List mode
    switch (key) {
      case '\x1b[A': // Up
      case 'k':
        this.state.selected = Math.max(0, selected - 1);
        this.adjustScroll();
        this.state.message = '';
        break;
      case '\x1b[B': // Down
      case 'j':
        this.state.selected = Math.min(checkpoints.length - 1, selected + 1);
        this.adjustScroll();
        this.state.message = '';
        break;
      case '\x1b[5~': // Page Up
        this.state.selected = Math.max(0, selected - this.pageSize);
        this.adjustScroll();
        break;
      case '\x1b[6~': // Page Down
        this.state.selected = Math.min(checkpoints.length - 1, selected + this.pageSize);
        this.adjustScroll();
        break;
      case 'g':
        this.state.selected = 0;
        this.state.scroll = 0;
        break;
      case 'G':
        this.state.selected = checkpoints.length - 1;
        this.adjustScroll();
        break;
      case '\r': // Enter
      case '\n':
        this.state.detail = this.engine.getTimePoint(checkpoints[selected].id) || undefined;
        this.state.mode = 'detail';
        break;
      case 'r':
        this.state.mode = 'confirm';
        break;
      case 'd':
        if (selected < checkpoints.length - 1) {
          const prev = checkpoints[selected + 1];
          const curr = checkpoints[selected];
          this.state.diffResult = this.engine.getDiff(prev.id, curr.id);
          this.state.mode = 'diff';
        } else {
          this.state.message = 'No previous checkpoint to diff';
        }
        break;
      case 'q':
      case '\x03': // Ctrl+C
        this.running = false;
        break;
    }
  }

  private adjustScroll(): void {
    const { selected, scroll } = this.state;
    if (selected < scroll) {
      this.state.scroll = selected;
    } else if (selected >= scroll + this.pageSize) {
      this.state.scroll = selected - this.pageSize + 1;
    }
  }

  async run(): Promise<void> {
    if (!process.stdin.isTTY) {
      console.error('TUI requires a TTY terminal');
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.render();

    return new Promise((resolve) => {
      const onData = (key: string) => {
        if (!this.running) {
          cleanup();
          return;
        }
        this.handleInput(key);
        if (this.running) {
          this.render();
        } else {
          cleanup();
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        this.write(ansi.showCursor);
        this.write(ansi.clear);
        resolve();
      };

      process.stdin.on('data', onData);
    });
  }
}

export async function runTUI(projectPath: string = process.cwd()): Promise<void> {
  const tui = new TUITimeline(projectPath);
  await tui.run();
}

// Direct execution
const isMain = process.argv[1]?.endsWith('tui-timeline.js') || process.argv[1]?.endsWith('tui-timeline.ts');
if (isMain) {
  runTUI().catch(console.error);
}
