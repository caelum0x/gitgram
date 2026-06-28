/**
 * Binary-safe restore tests.
 *
 * Guards that secondary restore paths (worktree-restore, cat, selective
 * restore) materialize file content byte-for-byte via the Buffer API instead of
 * a lossy UTF-8 decode/encode round-trip that corrupts binary files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { TimeMachineEngine } from '../src/core/engine.js';
import { SelectiveRestore } from '../src/core/selective-restore.js';

/** Bytes that are invalid UTF-8 (a lossy decode would replace them with U+FFFD). */
const BINARY_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0xc0, 0xff]);

describe('binary-safe content materialization', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-binary-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getFileBufferAt returns binary content unchanged', () => {
    fs.writeFileSync(path.join(dir, 'image.png'), BINARY_BYTES);
    const engine = new TimeMachineEngine(dir);
    const tp = engine.capture('add binary', { type: 'manual' });

    const buf = engine.getFileBufferAt(tp.id, 'image.png');
    expect(buf).not.toBeNull();
    expect(Buffer.compare(buf as Buffer, BINARY_BYTES)).toBe(0);
  });

  it('getFileAt (string) would corrupt binary content (regression guard)', () => {
    fs.writeFileSync(path.join(dir, 'image.png'), BINARY_BYTES);
    const engine = new TimeMachineEngine(dir);
    const tp = engine.capture('add binary', { type: 'manual' });

    const asString = engine.getFileAt(tp.id, 'image.png');
    // The string path loses bytes — this is exactly why disk-writing paths must
    // use getFileBufferAt instead.
    expect(Buffer.from(asString as string, 'utf-8').equals(BINARY_BYTES)).toBe(false);
  });

  it('selective restore writes binary files byte-for-byte', () => {
    fs.writeFileSync(path.join(dir, 'asset.bin'), BINARY_BYTES);
    const engine = new TimeMachineEngine(dir);
    const tp = engine.capture('snapshot binary', { type: 'manual' });

    // Mutate the file, then restore it from the checkpoint.
    fs.writeFileSync(path.join(dir, 'asset.bin'), Buffer.from('garbage'));

    const restore = new SelectiveRestore(engine);
    const result = restore.restore({
      checkpointId: tp.id,
      patterns: ['asset.bin'],
      strategy: 'theirs',
    });

    expect(result.restored).toContain('asset.bin');
    const restored = fs.readFileSync(path.join(dir, 'asset.bin'));
    expect(Buffer.compare(restored, BINARY_BYTES)).toBe(0);
  });
});
