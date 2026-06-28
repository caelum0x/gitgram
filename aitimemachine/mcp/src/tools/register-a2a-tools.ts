import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { A2AClient } from '@a2a-js/sdk/client';
import type { MessageSendParams, Message } from '@a2a-js/sdk';
import { createToolRegistrar, defineTool } from '../lib/tool-runtime.js';
import { mutatingAnnotations, readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

/** Well-known relative path where A2A agents publish their agent card. */
const WELL_KNOWN_AGENT_CARD_PATH = '.well-known/agent-card.json';

/**
 * Construct an {@link A2AClient} for a target agent base URL.
 *
 * Per the A2A spec, agent cards are published at
 * `GET <agentUrl>/.well-known/agent-card.json`; the card's `url` field then
 * advertises the JSON-RPC endpoint (for the AITM A2A server that is
 * `<agentUrl>/a2a`). The SDK's {@link A2AClient.fromCardUrl} issues a `GET`
 * to the exact URL it is given to fetch the card, so we must point it at the
 * well-known path — NOT at `/a2a`, which only accepts `POST` (JSON-RPC) and
 * would 404 on the card GET. Once built, all task traffic flows through the
 * SDK's JSON-RPC transport against the endpoint named in the card.
 */
async function createClient(agentUrl: string): Promise<A2AClient> {
  const base = agentUrl.replace(/\/$/, '');
  const cardUrl = `${base}/${WELL_KNOWN_AGENT_CARD_PATH}`;
  return A2AClient.fromCardUrl(cardUrl);
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const registerA2ATools = createToolRegistrar([
  defineTool({
    name: 'a2a_send_task',
    description: 'Send a task to an A2A agent via the @a2a-js/sdk JSON-RPC client',
    schema: {
      agentUrl: z.string().url().describe('Base URL of the target A2A agent'),
      taskId: z.string().describe('Unique identifier for this task'),
      message: z.string().describe('Text message to send to the agent'),
      metadata: z.record(z.string()).optional().describe('Optional key-value metadata for the task'),
    },
    annotations: mutatingAnnotations(),
    run: async ({ agentUrl, taskId, message, metadata }) => {
      const client = await createClient(agentUrl);

      const userMessage: Message = {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        taskId,
        parts: [{ kind: 'text', text: message }],
      };

      const params: MessageSendParams = {
        message: userMessage,
        ...(metadata !== undefined ? { metadata } : {}),
      };

      const result = await client.sendMessage(params);
      return jsonResponse(result);
    },
  }),

  defineTool({
    name: 'a2a_get_task',
    description: 'Get the current status of an A2A task via the @a2a-js/sdk JSON-RPC client',
    schema: {
      agentUrl: z.string().url().describe('Base URL of the target A2A agent'),
      taskId: z.string().describe('Unique identifier of the task to retrieve'),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ agentUrl, taskId }) => {
      const client = await createClient(agentUrl);
      const result = await client.getTask({ id: taskId });
      return jsonResponse(result);
    },
  }),

  defineTool({
    name: 'a2a_list_agents',
    description:
      'List A2A agents registered with an AITM A2A server. ' +
      'Queries the live registry at <registryUrl>/a2a/agents. ' +
      'Defaults registryUrl to the AITM_API_URL environment variable, then http://localhost:3000.',
    schema: {
      registryUrl: z
        .string()
        .url()
        .optional()
        .describe(
          'Base URL of the AITM A2A server whose registry should be listed. ' +
            'Defaults to AITM_API_URL or http://localhost:3000.'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ registryUrl }) => {
      const base =
        registryUrl ??
        ((typeof process !== 'undefined' && process.env.AITM_API_URL) ||
          'http://localhost:3000');
      const url = `${base.replace(/\/$/, '')}/a2a/agents`;

      let response: Response;
      try {
        response = await fetch(url, { headers: { Accept: 'application/json' } });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`A2A registry request to ${url} failed: ${reason}`);
      }

      if (!response.ok) {
        throw new Error(
          `A2A registry request to ${url} failed with status ${response.status}: ${response.statusText}`
        );
      }

      const json = (await response.json()) as { agents?: unknown };
      return jsonResponse(json.agents ?? []);
    },
  }),
]);

export default registerA2ATools;
