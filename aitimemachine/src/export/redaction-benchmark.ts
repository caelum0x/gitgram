import { PrivacyRedactor, type RedactionQualityMetrics } from './privacy-redactor.js';

export interface RedactionBenchmarkSample {
  id: string;
  text: string;
  expectedSecrets: string[];
}

export interface RedactionBenchmarkReport {
  sampleCount: number;
  metrics: RedactionQualityMetrics;
}

export const DEFAULT_REDACTION_BENCHMARK: RedactionBenchmarkSample[] = [
  {
    id: 'openai-key',
    text: 'export OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuv',
    expectedSecrets: ['sk-1234567890abcdefghijklmnopqrstuv'],
  },
  {
    id: 'github-token',
    text: 'token = ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD',
    expectedSecrets: ['ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD'],
  },
  {
    id: 'aws-key',
    text: 'AWS key AKIA1234567890ABCDEF should never be committed',
    expectedSecrets: ['AKIA1234567890ABCDEF'],
  },
  {
    id: 'email-and-ip',
    text: 'notify dev@company.com from 10.20.30.40 after deploy',
    expectedSecrets: ['dev@company.com', '10.20.30.40'],
  },
  {
    id: 'non-secret-control',
    text: 'The word tokenization and passwordless should not be redacted by assignment rules.',
    expectedSecrets: [],
  },
];

export function runRedactionBenchmark(
  redactor: PrivacyRedactor = new PrivacyRedactor(),
  samples: RedactionBenchmarkSample[] = DEFAULT_REDACTION_BENCHMARK
): RedactionBenchmarkReport {
  const metrics = redactor.evaluate(
    samples.map((s) => ({
      text: s.text,
      expectedSecrets: s.expectedSecrets,
    }))
  );

  return {
    sampleCount: samples.length,
    metrics,
  };
}
