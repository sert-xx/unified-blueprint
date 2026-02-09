/**
 * Register all 6 MCP tools
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UbpEngine } from '../../../core/engine.js';
import { registerSearchTool } from './ubp-search.js';
import { registerGetPageTool } from './ubp-get-page.js';
import { registerGetContextTool } from './ubp-get-context.js';
import { registerFulltextSearchTool } from './ubp-fulltext-search.js';
import { registerListPagesTool } from './ubp-list-pages.js';
import { registerGetGraphTool } from './ubp-get-graph.js';

export function registerAllTools(
  server: McpServer,
  engine: UbpEngine,
): void {
  registerSearchTool(server, engine);
  registerGetPageTool(server, engine);
  registerGetContextTool(server, engine);
  registerFulltextSearchTool(server, engine);
  registerListPagesTool(server, engine);
  registerGetGraphTool(server, engine);
}
