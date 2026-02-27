/**
 * ubp get-context <filepath> - Get center page with related pages
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatDim } from '../output/formatter.js';
import type { GetContextOutput } from '../../../shared/types.js';

export function getContextCommand(): Command {
  return new Command('get-context')
    .description('Retrieve a page along with its related pages (outlinks and backlinks)')
    .argument('<filepath>', 'Filepath of the center page (relative to docs dir)')
    .option('--depth <n>', 'How many hops of related pages to include (1-3)', '1')
    .option('--max-size <bytes>', 'Maximum response size in bytes', '51200')
    .option('--no-content', 'Omit content from related pages')
    .action(async (filepath: string, options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);
        const depth = Math.min(3, Math.max(1, parseInt(options.depth, 10) || 1));
        const maxSize = parseInt(options.maxSize, 10) || 51200;

        const context = engine.getContext({
          filepath,
          depth,
          max_size: maxSize,
        });

        if (globals.json) {
          printJson(context);
        } else if (!globals.quiet) {
          renderContext(context, options.content !== false);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}

function renderContext(ctx: GetContextOutput, showContent: boolean): void {
  process.stderr.write('\n');
  process.stderr.write(`  ${formatBold('Center:')} ${ctx.center.title}\n`);
  process.stderr.write(`  ${formatDim(ctx.center.filepath)}\n`);

  if (showContent) {
    const snippet =
      ctx.center.content.length > 500
        ? ctx.center.content.slice(0, 500) + '...'
        : ctx.center.content;
    process.stderr.write(`\n  ${snippet}\n`);
  }

  process.stderr.write('\n');

  if (ctx.related.length > 0) {
    process.stderr.write(`  ${formatBold(`Related (${ctx.related.length}):`)}\n`);
    for (const r of ctx.related) {
      process.stderr.write(
        `    ${r.title} ${formatDim(`(${r.direction}:${r.link_type}, depth:${r.depth})`)} ${formatDim(r.filepath)}\n`,
      );
      if (showContent && r.summary) {
        const snippet =
          r.summary.length > 200 ? r.summary.slice(0, 200) + '...' : r.summary;
        process.stderr.write(`      ${snippet}\n`);
      }
    }
  }

  process.stderr.write('\n');
  process.stderr.write(
    `  ${formatDim(`total_size: ${ctx.total_size} bytes, truncated: ${ctx.truncated_count}`)}\n`,
  );
  process.stderr.write('\n');
}
