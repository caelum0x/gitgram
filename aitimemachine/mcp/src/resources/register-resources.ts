import {
  getAvailableTools,
  getDisabledTools,
  getMcpCapabilities,
  type ToolSelectionOptions,
} from '../lib/stable-tools.js';
import { getToolInfo } from '../lib/tool-catalog.js';
import type { ToolRuntimeContext } from '../lib/tool-runtime.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface ResourceRegistrationOptions {
  experimentalEnabled: boolean;
  toolSelectionOptions: ToolSelectionOptions;
  skippedToolNames: ReadonlyMap<string, string>;
  unknownDisabledTools: readonly string[];
}

export function registerResources(
  server: McpServer,
  runtime: ToolRuntimeContext,
  options: ResourceRegistrationOptions
) {
  server.resource('tm_projects', 'tm://projects', async () => {
    const projects = runtime.getSessionServer().listProjects();
    return {
      contents: [
        {
          uri: 'tm://projects',
          mimeType: 'application/json',
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  });

  server.resource('tm_sessions', 'tm://sessions', async () => {
    const sessions = runtime.getSessionServer().listSessions().slice(0, 100);
    return {
      contents: [
        {
          uri: 'tm://sessions',
          mimeType: 'application/json',
          text: JSON.stringify(sessions, null, 2),
        },
      ],
    };
  });

  server.resource('tm_checkpoints', 'tm://checkpoints', async () => {
    const timepoints = runtime.getEngine().listTimePoints().slice(0, 100);
    return {
      contents: [
        {
          uri: 'tm://checkpoints',
          mimeType: 'application/json',
          text: JSON.stringify(
            timepoints.map((tp: any) => ({
              id: tp.id,
              description: tp.description,
              timestamp: tp.timestamp,
              files: tp.stats.totalFiles,
            })),
            null,
            2
          ),
        },
      ],
    };
  });

  server.resource('tm_conversations', 'tm://conversations', async () => {
    const conversations = runtime.getEngine().getConversations().slice(0, 100);
    return {
      contents: [
        {
          uri: 'tm://conversations',
          mimeType: 'application/json',
          text: JSON.stringify(conversations, null, 2),
        },
      ],
    };
  });

  server.resource('tm_capabilities', 'tm://capabilities', async () => {
    const capabilities = getMcpCapabilities(options.toolSelectionOptions);
    const availableTools = getAvailableTools(options.toolSelectionOptions);
    const disabledTools = getDisabledTools(options.toolSelectionOptions);

    return {
      contents: [
        {
          uri: 'tm://capabilities',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...capabilities,
              // Per-tool parameter detail comes from the live registration
              // catalog (populated as tools register). When a tool has not yet
              // been recorded (e.g. capabilities read before registration
              // completes), fall back to the static name/description metadata.
              tools: availableTools.map((tool) => {
                const info = getToolInfo(tool.name);
                return {
                  name: tool.name,
                  description: tool.description,
                  category: tool.category,
                  stable: tool.stable,
                  ...(info
                    ? {
                        readOnly: info.readOnly,
                        destructive: info.destructive,
                        parameters: info.parameters,
                      }
                    : {}),
                };
              }),
              discovery: {
                hint: 'Call tm_discover_tools for a cheap name list, then tm_get_tool_info(name) for one tool\'s full schema and example.',
              },
              disabledTools: disabledTools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                category: tool.category,
                stable: tool.stable,
                reason: options.skippedToolNames.get(tool.name) || 'policy',
              })),
              config: {
                experimentalEnabled: options.experimentalEnabled,
                disabledToolsEnv: process.env.DISABLED_TOOLS || '',
                unknownDisabledTools: options.unknownDisabledTools,
                currentProject: runtime.getCurrentProjectPath(),
              },
            },
            null,
            2
          ),
        },
      ],
    };
  });
}
