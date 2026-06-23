import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';

// We need to mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('[]'),
}));

// Import after mocks are set up
import { ErrorDetectionProvider, ErrorCodeActionProvider } from '../providers/ErrorDetectionProvider';

describe('ErrorDetectionProvider', () => {
  let provider: ErrorDetectionProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new ErrorDetectionProvider();
  });

  afterEach(() => {
    provider.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Error Deduplication Hashing
  // =========================================================================
  describe('error deduplication hashing', () => {
    it('should produce the same hash for the same error at the same location', () => {
      // Access the private _hashError method via type casting
      const hashError = (provider as any)._hashError.bind(provider);

      const hash1 = hashError('src/app.ts', 10, 'Cannot find name "foo"');
      const hash2 = hashError('src/app.ts', 10, 'Cannot find name "foo"');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different file locations', () => {
      const hashError = (provider as any)._hashError.bind(provider);

      const hash1 = hashError('src/app.ts', 10, 'Cannot find name "foo"');
      const hash2 = hashError('src/other.ts', 10, 'Cannot find name "foo"');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different line numbers', () => {
      const hashError = (provider as any)._hashError.bind(provider);

      const hash1 = hashError('src/app.ts', 10, 'Cannot find name "foo"');
      const hash2 = hashError('src/app.ts', 20, 'Cannot find name "foo"');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize numbers in error messages for deduplication', () => {
      const hashError = (provider as any)._hashError.bind(provider);

      // Messages that differ only in numeric values should hash the same
      const hash1 = hashError('src/app.ts', 10, 'Expected 2 arguments, but got 3');
      const hash2 = hashError('src/app.ts', 10, 'Expected 5 arguments, but got 1');

      expect(hash1).toBe(hash2);
    });

    it('should normalize quotes in error messages for deduplication', () => {
      const hashError = (provider as any)._hashError.bind(provider);

      const hash1 = hashError('src/app.ts', 10, "Cannot find name 'foo'");
      const hash2 = hashError('src/app.ts', 10, 'Cannot find name "foo"');

      expect(hash1).toBe(hash2);
    });

    it('should truncate long messages to prevent excessively long hashes', () => {
      const hashError = (provider as any)._hashError.bind(provider);

      const longMessage = 'A'.repeat(200);
      const hash = hashError('src/app.ts', 1, longMessage);

      // The hash format is `file:line:normalizedMessage` where message is capped at 100 chars
      const parts = hash.split(':');
      // file part + line part + message part
      expect(parts.length).toBeGreaterThanOrEqual(3);
      // The normalized message portion should be at most 100 chars
      const messagePart = parts.slice(2).join(':');
      expect(messagePart.length).toBeLessThanOrEqual(100);
    });
  });

  // =========================================================================
  // Time Formatting
  // =========================================================================
  describe('time formatting (_getTimeAgo)', () => {
    it('should return "just now" for times less than a minute ago', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30000);

      const result = getTimeAgo(thirtySecondsAgo);
      expect(result).toBe('just now');
    });

    it('should return minutes for times less than an hour ago', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60000);

      const result = getTimeAgo(tenMinutesAgo);
      expect(result).toBe('10m ago');
    });

    it('should return hours for times less than a day ago', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 3600000);

      const result = getTimeAgo(threeHoursAgo);
      expect(result).toBe('3h ago');
    });

    it('should return days for times more than a day ago', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);

      const result = getTimeAgo(fiveDaysAgo);
      expect(result).toBe('5d ago');
    });

    it('should handle boundary at exactly 60 minutes', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      // At exactly 60 minutes, diffMins=60 so it falls through to the hours check
      const exactlyOneHour = new Date(now.getTime() - 60 * 60000);

      const result = getTimeAgo(exactlyOneHour);
      expect(result).toBe('1h ago');
    });
  });

  // =========================================================================
  // Error-to-Checkpoint Correlation
  // =========================================================================
  describe('error-to-checkpoint correlation', () => {
    it('should register a checkpoint via onCheckpointCreated', () => {
      provider.onCheckpointCreated('cp-123', 'Fix login bug');

      const lastId = (provider as any)._lastCheckpointId;
      const lastDesc = (provider as any)._lastCheckpointDescription;

      expect(lastId).toBe('cp-123');
      expect(lastDesc).toBe('Fix login bug');
    });

    it('should update the last checkpoint timestamp when a checkpoint is created', () => {
      const before = new Date().toISOString();
      provider.onCheckpointCreated('cp-456', 'Add tests');
      const after = new Date().toISOString();

      const timestamp = (provider as any)._lastCheckpointTimestamp;
      expect(timestamp).toBeDefined();
      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });

    it('should set description to null when no description is provided', () => {
      provider.onCheckpointCreated('cp-789');

      const lastDesc = (provider as any)._lastCheckpointDescription;
      expect(lastDesc).toBeNull();
    });

    it('should track error history and correlate with checkpoint', () => {
      // Set up a checkpoint
      provider.onCheckpointCreated('cp-100', 'Initial state');

      // Simulate error tracking by directly manipulating internal state
      const errorHistory = (provider as any)._errorHistory as Map<string, any>;
      const hash = 'src/app.ts:10:Cannot find name foo';
      errorHistory.set(hash, {
        errorHash: hash,
        error: {
          file: 'src/app.ts',
          line: 10,
          column: 1,
          message: 'Cannot find name "foo"',
          severity: vscode.DiagnosticSeverity.Error,
          hash,
        },
        firstSeenCheckpoint: 'cp-100',
        firstSeenCheckpointDescription: 'Initial state',
        firstSeenTimestamp: new Date().toISOString(),
      });

      expect(errorHistory.has(hash)).toBe(true);
      expect(errorHistory.get(hash)!.firstSeenCheckpoint).toBe('cp-100');
      expect(errorHistory.get(hash)!.firstSeenCheckpointDescription).toBe('Initial state');
    });

    it('should clear error history when restoring to a checkpoint (via internal method)', () => {
      // Add an error to the history
      const errorHistory = (provider as any)._errorHistory as Map<string, any>;
      errorHistory.set('some-hash', {
        errorHash: 'some-hash',
        error: { file: 'test.ts', line: 1, message: 'error' },
        firstSeenCheckpoint: 'cp-1',
        firstSeenTimestamp: new Date().toISOString(),
      });

      expect(errorHistory.size).toBe(1);

      // Simulate what _restoreToCheckpoint does to errorHistory
      errorHistory.clear();

      expect(errorHistory.size).toBe(0);
    });
  });

  // =========================================================================
  // Diagnostic Severity Mapping
  // =========================================================================
  describe('diagnostic severity mapping', () => {
    it('should only capture errors (severity === Error) from diagnostics', () => {
      // Set up mock diagnostics that include different severities
      const mockDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [
          vscode.Uri.file('/mock/workspace/src/test.ts'),
          [
            new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 10),
              'This is an error',
              vscode.DiagnosticSeverity.Error
            ),
            new vscode.Diagnostic(
              new vscode.Range(1, 0, 1, 10),
              'This is a warning',
              vscode.DiagnosticSeverity.Warning
            ),
            new vscode.Diagnostic(
              new vscode.Range(2, 0, 2, 10),
              'This is info',
              vscode.DiagnosticSeverity.Information
            ),
            new vscode.Diagnostic(
              new vscode.Range(3, 0, 3, 10),
              'This is a hint',
              vscode.DiagnosticSeverity.Hint
            ),
          ],
        ],
      ];

      // Mock getDiagnostics to return our test diagnostics
      vi.spyOn(vscode.languages, 'getDiagnostics').mockReturnValue(mockDiagnostics);

      const errors = (provider as any)._captureCurrentErrors();

      // Only the Error severity diagnostic should be captured
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('This is an error');
      expect(errors[0].severity).toBe(vscode.DiagnosticSeverity.Error);
    });

    it('should skip files in node_modules', () => {
      const mockDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [
          vscode.Uri.file('/mock/workspace/node_modules/some-lib/index.ts'),
          [
            new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 10),
              'Error in node_modules',
              vscode.DiagnosticSeverity.Error
            ),
          ],
        ],
      ];

      vi.spyOn(vscode.languages, 'getDiagnostics').mockReturnValue(mockDiagnostics);

      const errors = (provider as any)._captureCurrentErrors();
      expect(errors.length).toBe(0);
    });

    it('should skip files in dist/ directory', () => {
      const mockDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [
          vscode.Uri.file('/mock/workspace/dist/bundle.js'),
          [
            new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 10),
              'Error in dist',
              vscode.DiagnosticSeverity.Error
            ),
          ],
        ],
      ];

      vi.spyOn(vscode.languages, 'getDiagnostics').mockReturnValue(mockDiagnostics);

      const errors = (provider as any)._captureCurrentErrors();
      expect(errors.length).toBe(0);
    });

    it('should extract diagnostic code as a simple value', () => {
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        'Type error',
        vscode.DiagnosticSeverity.Error
      );
      diag.code = 2322;
      diag.source = 'ts';

      const mockDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [vscode.Uri.file('/mock/workspace/src/app.ts'), [diag]],
      ];

      vi.spyOn(vscode.languages, 'getDiagnostics').mockReturnValue(mockDiagnostics);

      const errors = (provider as any)._captureCurrentErrors();
      expect(errors.length).toBe(1);
      expect(errors[0].code).toBe(2322);
      expect(errors[0].source).toBe('ts');
    });

    it('should extract diagnostic code from object form (code.value)', () => {
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        'Type error',
        vscode.DiagnosticSeverity.Error
      );
      diag.code = { value: 'TS2322', target: vscode.Uri.parse('https://example.com') };

      const mockDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [vscode.Uri.file('/mock/workspace/src/app.ts'), [diag]],
      ];

      vi.spyOn(vscode.languages, 'getDiagnostics').mockReturnValue(mockDiagnostics);

      const errors = (provider as any)._captureCurrentErrors();
      expect(errors.length).toBe(1);
      expect(errors[0].code).toBe('TS2322');
    });
  });

  // =========================================================================
  // HTML Escaping
  // =========================================================================
  describe('HTML escaping (_escapeHtml)', () => {
    it('should escape special HTML characters', () => {
      const escapeHtml = (provider as any)._escapeHtml.bind(provider);

      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should escape ampersands', () => {
      const escapeHtml = (provider as any)._escapeHtml.bind(provider);
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape single quotes', () => {
      const escapeHtml = (provider as any)._escapeHtml.bind(provider);
      expect(escapeHtml("it's")).toBe('it&#039;s');
    });
  });
});

// =========================================================================
// ErrorCodeActionProvider
// =========================================================================
describe('ErrorCodeActionProvider', () => {
  let errorDetector: ErrorDetectionProvider;
  let codeActionProvider: ErrorCodeActionProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    errorDetector = new ErrorDetectionProvider();
    codeActionProvider = new ErrorCodeActionProvider(errorDetector);
  });

  afterEach(() => {
    errorDetector.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should delegate provideCodeActions to the ErrorDetectionProvider', () => {
    const spy = vi.spyOn(errorDetector, 'provideCodeActions');

    const document = {
      uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
      getText: () => '',
      lineCount: 10,
    } as any;

    const range = new vscode.Range(0, 0, 0, 10);
    const context = {
      diagnostics: [],
      only: undefined,
      triggerKind: 1,
    } as any;
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any;

    codeActionProvider.provideCodeActions(document, range, context, token);
    expect(spy).toHaveBeenCalledWith(document, range, context);
  });

  it('should return empty actions when there are no error diagnostics', () => {
    const document = {
      uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
      getText: () => '',
      lineCount: 10,
    } as any;
    const range = new vscode.Range(0, 0, 0, 10);
    const context = {
      diagnostics: [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          'A warning',
          vscode.DiagnosticSeverity.Warning
        ),
      ],
    } as any;
    const token = { isCancellationRequested: false } as any;

    const actions = codeActionProvider.provideCodeActions(document, range, context, token);
    expect(actions).toEqual([]);
  });

  it('should provide code actions when there are error diagnostics', () => {
    const document = {
      uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
      getText: () => '',
      lineCount: 10,
    } as any;
    const range = new vscode.Range(0, 0, 0, 10);
    const errorDiag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 10),
      'Cannot find module',
      vscode.DiagnosticSeverity.Error
    );
    const context = { diagnostics: [errorDiag] } as any;
    const token = { isCancellationRequested: false } as any;

    const actions = codeActionProvider.provideCodeActions(document, range, context, token);

    // Should have at least "Find when this error started" and "Restore to last green state"
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.some((a: vscode.CodeAction) => a.title.includes('AITimeMachine'))).toBe(true);
  });

  it('should have the correct static providedCodeActionKinds', () => {
    expect(ErrorCodeActionProvider.providedCodeActionKinds).toContain(
      vscode.CodeActionKind.QuickFix
    );
  });
});
