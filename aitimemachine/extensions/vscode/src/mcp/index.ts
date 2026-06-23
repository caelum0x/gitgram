/**
 * MCP (Model Context Protocol) module for AITimeMachine VS Code extension
 *
 * Provides a clean interface for communicating with the AITimeMachine MCP server.
 */

export {
  MCPClient,
  MCPToolResult,
  MCPToolIntent,
  MCPClientOptions,
  getSharedMCPClient,
  createSharedMCPClient,
  disposeSharedMCPClient
} from './MCPClient.js';
