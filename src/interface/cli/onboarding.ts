/**
 * MCP configuration snippet generation for onboarding
 */

import { resolve } from 'node:path';
import pc from 'picocolors';
import { indent } from './output/formatter.js';
import type { GlobalOptions } from './utils/global-options.js';

export interface McpSnippets {
  claudeDesktop: object;
  claudeCode: string;
  cursor: object;
}

export function generateMcpSnippets(projectPath: string): McpSnippets {
  const absPath = resolve(projectPath);

  return {
    claudeDesktop: {
      mcpServers: {
        ubp: {
          command: 'npx',
          args: ['-y', '@sert-xx/ubp', 'serve'],
          cwd: absPath,
        },
      },
    },

    claudeCode: `claude mcp add ubp -- npx -y @sert-xx/ubp serve --cwd ${absPath}`,

    cursor: {
      mcpServers: {
        ubp: {
          command: 'npx',
          args: ['-y', '@sert-xx/ubp', 'serve'],
          cwd: absPath,
        },
      },
    },
  };
}

export function renderMcpConfigSnippets(
  projectPath: string,
  globals: GlobalOptions,
): void {
  if (globals.json || globals.quiet) return;

  const snippets = generateMcpSnippets(projectPath);
  const divider = '\u2500'.repeat(65);

  const output = `
  ${pc.dim(`\u2500\u2500 MCP Configuration ${divider.slice(21)}`)}

  ${pc.bold('Claude Desktop')} (~/.claude/claude_desktop_config.json):
${indent(JSON.stringify(snippets.claudeDesktop, null, 2), 4)}

  ${pc.bold('Claude Code')}:
    ${snippets.claudeCode}

  ${pc.bold('Cursor')} (.cursor/mcp.json):
${indent(JSON.stringify(snippets.cursor, null, 2), 4)}

  ${pc.dim(divider)}
`;

  process.stderr.write(output);
}
