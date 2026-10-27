/**
 * Real LLM seam for talent GraphRAG's `explainTalentMatch`.
 *
 * Relay-first: Railyard Relay (our TensorZero fork) serves Anthropic models
 * through an OpenAI-compatible endpoint, billed to our own Anthropic credits
 * with a per-key spend cap. Falls back to a direct OpenRouter call on any
 * Relay failure (network, non-2xx, bad JSON) or when Relay isn't configured.
 * Both paths speak the same OpenAI-compatible chat/completions shape, so one
 * request builder and one response parser cover both.
 *
 * Env-gated, not hardcoded: `RELAY_URL`+`RELAY_API_KEY` enable the Relay path,
 * `OPENROUTER_API_KEY` enables the direct fallback. Neither configured ->
 * throws the same "No LLM client is configured" message `defaultRagAsk` does,
 * so callers can't silently get a different error shape.
 */
import logger from '../utils/logger';
import type { RagAsk, RagAskRequest } from './talentGraphRagPrompt';

const RELAY_CHAT_PATH = '/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RELAY_MODEL_PREFIX = 'tensorzero::model_name::anthropic::';
const DEFAULT_RELAY_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_DIRECT_MODEL = 'anthropic/claude-haiku-4.5';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 1024;

interface ChatCompletionConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
}

function toChatBody(request: RagAskRequest, model: string): Record<string, unknown> {
  return {
    model,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: `${request.context}\n\nQUESTION: ${request.query}` },
    ],
  };
}

async function callChatCompletions(config: ChatCompletionConfig, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`LLM endpoint ${config.endpoint} answered ${response.status}: ${detail}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('LLM endpoint returned no message content');
  }
  return text;
}

function relayConfig(): ChatCompletionConfig | null {
  const url = process.env.RELAY_URL?.trim();
  const apiKey = process.env.RELAY_API_KEY?.trim();
  if (!url || !apiKey) return null;
  const model = process.env.GITGRAM_RAG_RELAY_MODEL?.trim() || DEFAULT_RELAY_MODEL;
  return {
    endpoint: new URL(RELAY_CHAT_PATH, url).toString(),
    apiKey,
    model: `${RELAY_MODEL_PREFIX}${model}`,
  };
}

function directConfig(): ChatCompletionConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GITGRAM_RAG_DIRECT_MODEL?.trim() || DEFAULT_DIRECT_MODEL;
  return { endpoint: OPENROUTER_URL, apiKey, model };
}

/**
 * Real LLM client: Relay first, falls back to a direct OpenRouter call on any
 * Relay failure or when Relay isn't configured. Exactly the `RagAsk` seam
 * `explainTalentMatch` expects — raw prompt in, raw model text out; grounding
 * enforcement happens in the caller, not here.
 */
export const liveRagAsk: RagAsk = async (request) => {
  const relay = relayConfig();
  const direct = directConfig();
  if (!relay && !direct) {
    throw new Error(
      'No LLM client is configured for talent GraphRAG. Set RELAY_URL/RELAY_API_KEY or OPENROUTER_API_KEY.',
    );
  }
  if (relay) {
    try {
      return await callChatCompletions(relay, toChatBody(request, relay.model));
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 160) : String(error);
      if (!direct) throw error;
      logger.warn('talent-graphrag relay call failed, falling back to direct provider', {
        event: 'talent_graph.rag.relay_fallback',
        reason,
      });
    }
  }
  return callChatCompletions(direct as ChatCompletionConfig, toChatBody(request, (direct as ChatCompletionConfig).model));
};
