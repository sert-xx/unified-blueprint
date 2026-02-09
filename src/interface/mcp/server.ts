/**
 * MCP Server initialization and transport
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';
import { logToStderr, interceptConsole, initServeLogger } from './logger.js';
import type { UbpEngine } from '../../core/engine.js';

export async function startMcpServer(engine: UbpEngine): Promise<void> {
  // Intercept console.log to prevent stdout pollution
  interceptConsole();

  const server = new McpServer({
    name: 'ubp',
    version: getServerVersion(),
  });

  // Register all 6 tools
  registerAllTools(server, engine);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logToStderr('[UBP] MCP Server started (stdio transport)');
}

function getServerVersion(): string {
  try {
    // Dynamic import would be async, use a simple fallback
    return '0.1.0';
  } catch {
    return '0.0.0';
  }
}
