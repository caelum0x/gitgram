/**
 * register-claude-tools.ts
 *
 * Claude AI bridge: registers Anthropic-backed MCP tools into the AITM MCP
 * server. Each tool's run() handler calls the Anthropic Messages API
 * (POST https://api.anthropic.com/v1/messages) via fetch, using the
 * ANTHROPIC_API_KEY environment variable and the x-api-key + anthropic-version
 * headers.
 *
 * Tool names are prefixed with `claude_` to avoid conflicts with AITM tools.
 */

import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Default model. Override per-call via the optional `model` argument.
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Output token ceilings. Kept well under SDK/HTTP timeout limits for the
// non-streaming requests these tools issue.
const DEFAULT_MAX_TOKENS = 4096;
const MAX_MAX_TOKENS = 16000;

function getApiKey(): string {
  const key =
    typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : undefined;
  if (!key) {
    throw new Error(
      'Claude bridge: ANTHROPIC_API_KEY is not set. ' +
        'Export a valid Anthropic API key before using the claude_* tools.'
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Anthropic API types (minimal subset we consume)
// ---------------------------------------------------------------------------

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = AnthropicTextBlock | { type: string };

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicMessageResponse {
  id: string;
  model: string;
  role: 'assistant';
  stop_reason: string | null;
  content: AnthropicContentBlock[];
  usage: AnthropicUsage;
}

interface AnthropicErrorResponse {
  type: 'error';
  error: { type: string; message: string };
}

interface CallClaudeOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
}

interface CallClaudeResult {
  text: string;
  model: string;
  usage: AnthropicUsage;
  stopReason: string | null;
}

/**
 * Issue a single non-streaming Messages API request and return the
 * concatenated text content plus usage metadata.
 */
async function callClaude(
  prompt: string,
  options: CallClaudeOptions = {}
): Promise<CallClaudeResult> {
  const apiKey = getApiKey();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = Math.min(
    Math.max(options.maxTokens ?? DEFAULT_MAX_TOKENS, 1),
    MAX_MAX_TOKENS
  );

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (options.system && options.system.length > 0) {
    body.system = options.system;
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Claude bridge: failed to reach ${ANTHROPIC_API_URL} — ${message}. ` +
        'Check network connectivity and that the Anthropic API is reachable.'
    );
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const errBody = (await response.json()) as AnthropicErrorResponse;
      if (errBody && errBody.error) {
        detail = `${response.status} ${errBody.error.type}: ${errBody.error.message}`;
      }
    } catch {
      // Body was not JSON; fall back to the status line.
    }
    throw new Error(`Claude bridge: Anthropic API error — ${detail}`);
  }

  const message = (await response.json()) as AnthropicMessageResponse;

  if (message.stop_reason === 'refusal') {
    throw new Error(
      'Claude bridge: request was declined by Anthropic safety classifiers ' +
        '(stop_reason="refusal").'
    );
  }

  const text = message.content
    .filter(
      (block): block is AnthropicTextBlock =>
        block.type === 'text' && typeof (block as AnthropicTextBlock).text === 'string'
    )
    .map((block) => block.text)
    .join('\n')
    .trim();

  return {
    text,
    model: message.model,
    usage: message.usage,
    stopReason: message.stop_reason,
  };
}

/**
 * Parse a JSON object out of a Claude text response, tolerating Markdown code
 * fences. Returns the parsed value, or null when no JSON could be extracted.
 */
function parseJsonResponse<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const registerClaudeTools = createToolRegistrar([
  // -------------------------------------------------------------------------
  // claude_chat — general purpose chat completion
  // -------------------------------------------------------------------------
  defineTool({
    name: 'claude_chat',
    description:
      'Send a message to Claude and get a free-form response. Optionally ' +
      'provide additional context (used as the system prompt), override the ' +
      'model, or cap output tokens. Returns { response, usage, model }.',
    schema: {
      message: z.string().min(1).describe('The user message to send to Claude.'),
      context: z
        .string()
        .optional()
        .describe(
          'Optional context or instructions, applied as the Claude system prompt.'
        ),
      model: z
        .string()
        .optional()
        .describe(`Anthropic model ID. Default "${DEFAULT_MODEL}".`),
      maxTokens: z
        .number()
        .int()
        .min(1)
        .max(MAX_MAX_TOKENS)
        .optional()
        .describe(
          `Maximum output tokens. Default ${DEFAULT_MAX_TOKENS}, max ${MAX_MAX_TOKENS}.`
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const result = await callClaude(args.message, {
        system: args.context,
        model: args.model,
        maxTokens: args.maxTokens,
      });
      return jsonResponse({
        response: result.text,
        usage: result.usage,
        model: result.model,
      });
    },
  }),

  // -------------------------------------------------------------------------
  // claude_analyze_code — explain / review / debug / refactor source code
  // -------------------------------------------------------------------------
  defineTool({
    name: 'claude_analyze_code',
    description:
      'Analyze a code snippet with Claude. Choose a task: "explain" (describe ' +
      'what the code does), "review" (find issues and improvements), "debug" ' +
      '(find and explain bugs), or "refactor" (suggest cleaner structure). ' +
      'Returns { analysis, suggestions, explanation }.',
    schema: {
      code: z.string().min(1).describe('Source code to analyze.'),
      language: z
        .string()
        .describe('Programming language (e.g. "typescript", "python").'),
      task: z
        .enum(['explain', 'review', 'debug', 'refactor'])
        .describe('The kind of analysis to perform.'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const system =
        'You are an expert software engineer performing code analysis. ' +
        'Respond ONLY with a JSON object matching this shape: ' +
        '{ "analysis": string, "suggestions": string[], "explanation": string }. ' +
        'Do not wrap it in Markdown fences or add commentary.';
      const prompt =
        `Task: ${args.task}\n` +
        `Language: ${args.language}\n\n` +
        `Code:\n\`\`\`${args.language}\n${args.code}\n\`\`\``;

      const result = await callClaude(prompt, { system });
      const parsed = parseJsonResponse<{
        analysis: string;
        suggestions: string[];
        explanation: string;
      }>(result.text);

      return jsonResponse({
        analysis: parsed?.analysis ?? result.text,
        suggestions: parsed?.suggestions ?? [],
        explanation: parsed?.explanation ?? '',
      });
    },
  }),

  // -------------------------------------------------------------------------
  // claude_generate_tests — generate a test suite for the given code
  // -------------------------------------------------------------------------
  defineTool({
    name: 'claude_generate_tests',
    description:
      'Generate a test suite for the given code using Claude. Optionally ' +
      'specify a test framework and coverage targets. Returns ' +
      '{ tests, framework, coverage_estimate }.',
    schema: {
      code: z.string().min(1).describe('Source code to generate tests for.'),
      language: z
        .string()
        .describe('Programming language (e.g. "typescript", "python").'),
      framework: z
        .string()
        .optional()
        .describe(
          'Test framework to target (e.g. "vitest", "jest", "pytest"). ' +
            'Omit to let Claude pick an idiomatic default.'
        ),
      coverageTargets: z
        .array(z.string())
        .optional()
        .describe(
          'Specific behaviors, branches, or edge cases the tests must cover.'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const targets =
        args.coverageTargets && args.coverageTargets.length > 0
          ? `\nCoverage targets:\n- ${args.coverageTargets.join('\n- ')}`
          : '';
      const frameworkLine = args.framework
        ? `Use the ${args.framework} test framework.`
        : 'Use the most idiomatic test framework for the language.';

      const system =
        'You are an expert test engineer. ' +
        frameworkLine +
        ' Respond ONLY with a JSON object matching this shape: ' +
        '{ "tests": string, "framework": string, "coverage_estimate": string }. ' +
        'The "tests" field contains the complete test source. ' +
        'Do not wrap the object in Markdown fences.';
      const prompt =
        `Language: ${args.language}\n` +
        `Generate a thorough test suite for the following code.${targets}\n\n` +
        `Code:\n\`\`\`${args.language}\n${args.code}\n\`\`\``;

      const result = await callClaude(prompt, {
        system,
        maxTokens: MAX_MAX_TOKENS,
      });
      const parsed = parseJsonResponse<{
        tests: string;
        framework: string;
        coverage_estimate: string;
      }>(result.text);

      return jsonResponse({
        tests: parsed?.tests ?? result.text,
        framework: parsed?.framework ?? args.framework ?? 'unknown',
        coverage_estimate: parsed?.coverage_estimate ?? 'unknown',
      });
    },
  }),

  // -------------------------------------------------------------------------
  // claude_improve_pr — summarize and score a pull request diff
  // -------------------------------------------------------------------------
  defineTool({
    name: 'claude_improve_pr',
    description:
      'Review a pull request diff with Claude. Produces a concise summary, ' +
      'a list of actionable improvement suggestions, and a quality score ' +
      'from 0 to 100. Returns { summary, suggestions, score }.',
    schema: {
      diff: z.string().min(1).describe('The unified diff for the pull request.'),
      prTitle: z.string().describe('The pull request title.'),
      prDescription: z
        .string()
        .describe('The pull request description / body.'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const system =
        'You are a senior engineer reviewing a pull request. ' +
        'Respond ONLY with a JSON object matching this shape: ' +
        '{ "summary": string, "suggestions": string[], "score": number }. ' +
        'The "score" is an integer 0-100 rating overall PR quality. ' +
        'Do not wrap the object in Markdown fences.';
      const prompt =
        `PR Title: ${args.prTitle}\n` +
        `PR Description:\n${args.prDescription}\n\n` +
        `Diff:\n\`\`\`diff\n${args.diff}\n\`\`\``;

      const result = await callClaude(prompt, {
        system,
        maxTokens: MAX_MAX_TOKENS,
      });
      const parsed = parseJsonResponse<{
        summary: string;
        suggestions: string[];
        score: number;
      }>(result.text);

      return jsonResponse({
        summary: parsed?.summary ?? result.text,
        suggestions: parsed?.suggestions ?? [],
        score: typeof parsed?.score === 'number' ? parsed.score : 0,
      });
    },
  }),

  // -------------------------------------------------------------------------
  // claude_suggest_commit_message — derive a commit message from a diff
  // -------------------------------------------------------------------------
  defineTool({
    name: 'claude_suggest_commit_message',
    description:
      'Suggest a commit message for the given diff using Claude. When ' +
      'conventionalCommits is true, the message follows the Conventional ' +
      'Commits spec. Returns { message, type, breaking }.',
    schema: {
      diff: z.string().min(1).describe('The unified diff to summarize.'),
      conventionalCommits: z
        .boolean()
        .optional()
        .describe(
          'When true, format the message per the Conventional Commits spec ' +
            '(e.g. "feat: ..."). Default false.'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const conventional = args.conventionalCommits ?? false;
      const styleLine = conventional
        ? 'Follow the Conventional Commits specification ' +
          '(type(scope): subject, with an optional body and "BREAKING CHANGE" footer).'
        : 'Write a clear, conventional Git commit message (concise subject, optional body).';

      const system =
        'You are an expert at writing Git commit messages. ' +
        styleLine +
        ' Respond ONLY with a JSON object matching this shape: ' +
        '{ "message": string, "type": string, "breaking": boolean }. ' +
        'The "type" is the change type (e.g. "feat", "fix", "refactor", "chore"). ' +
        '"breaking" is true if the change is backwards-incompatible. ' +
        'Do not wrap the object in Markdown fences.';
      const prompt = `Diff:\n\`\`\`diff\n${args.diff}\n\`\`\``;

      const result = await callClaude(prompt, { system });
      const parsed = parseJsonResponse<{
        message: string;
        type: string;
        breaking: boolean;
      }>(result.text);

      return jsonResponse({
        message: parsed?.message ?? result.text,
        type: parsed?.type ?? 'chore',
        breaking: typeof parsed?.breaking === 'boolean' ? parsed.breaking : false,
      });
    },
  }),
]);
