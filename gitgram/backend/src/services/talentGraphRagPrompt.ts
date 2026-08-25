/**
 * Grounded prompt construction + response parsing for talent GraphRAG.
 *
 * This file owns the *grounding contract* between our retrieval layer and the
 * LLM: the system instruction that forbids outside knowledge, the user prompt
 * that carries the serialized subgraph and the query, and the strict parser that
 * turns the model's reply back into a typed answer + cited edge keys. Keeping the
 * contract in one small module makes the grounding rules auditable and lets the
 * parser be unit-tested without any live API.
 */

/** The instruction that pins the model to the retrieved subgraph only. */
export const GROUNDING_SYSTEM_PROMPT = [
  'You are a talent-graph analyst. You answer ONLY using the facts in the',
  'provided subgraph context. Never use outside knowledge, and never invent',
  'developers, repositories, skills, organizations, or relationships that are',
  'not present in the EDGES list.',
  '',
  'Every claim in your answer must be supported by one or more edges, cited by',
  'their [key]. If the subgraph does not contain enough information to answer,',
  'say so plainly and cite no edges.',
  '',
  'Respond with a single JSON object and nothing else, of the exact shape:',
  '{"answer": string, "citedEdgeKeys": string[]}',
  'where each citedEdgeKeys entry is an edge [key] copied verbatim from EDGES.',
].join('\n');

/** A request handed to an injected LLM. `context` is the serialized subgraph. */
export interface RagAskRequest {
  readonly system: string;
  readonly query: string;
  readonly context: string;
}

/** The injectable LLM seam: raw prompt in, raw model text out. */
export type RagAsk = (request: RagAskRequest) => Promise<string>;

/** Parsed, still-untrusted model reply before grounding is enforced. */
export interface ParsedRagResponse {
  readonly answer: string;
  readonly citedEdgeKeys: readonly string[];
}

/**
 * Build the user-facing prompt body. The query is included verbatim but clearly
 * fenced from the context so a hostile query cannot masquerade as graph facts.
 */
export function buildRagPrompt(query: string, context: string): RagAskRequest {
  const cleanedQuery = typeof query === 'string' ? query.trim() : '';
  if (!cleanedQuery) throw new Error('A non-empty query is required to explain a talent match');
  return {
    system: GROUNDING_SYSTEM_PROMPT,
    query: cleanedQuery,
    context,
  };
}

/**
 * Parse a raw LLM reply into a typed response. Tolerant of a leading/trailing
 * code fence but otherwise strict: the payload must be a JSON object with a
 * string `answer` and an array of string `citedEdgeKeys`. Anything else is a
 * hard error — we never guess at a malformed model reply. Grounding (checking the
 * cited keys actually exist in the subgraph) happens in the caller.
 */
export function parseRagResponse(raw: string): ParsedRagResponse {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('LLM returned an empty response');
  }
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error('LLM response was not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM response must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.answer !== 'string') {
    throw new Error('LLM response is missing a string "answer"');
  }
  if (!Array.isArray(record.citedEdgeKeys) || record.citedEdgeKeys.some((key) => typeof key !== 'string')) {
    throw new Error('LLM response "citedEdgeKeys" must be an array of strings');
  }

  return {
    answer: record.answer.trim(),
    citedEdgeKeys: record.citedEdgeKeys as string[],
  };
}
