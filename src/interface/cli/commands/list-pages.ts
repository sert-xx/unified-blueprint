/**
 * ubp list-pages - List all pages with summaries
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatDim } from '../output/formatter.js';
import type { ListPagesOutput } from '../../../shared/types.js';

export function listPagesCommand(): Command {
  return new Command('list-pages')
    .description('List all pages in the document graph')
    .option('--doc-type <type>', 'Filter by document type (spec, design, adr, guide, api, meeting, todo, other)')
    .option('--sort <field>', 'Sort field: title, updated_at, filepath', 'title')
    .option('--order <order>', 'Sort order: asc, desc', 'asc')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);
        const result = engine.listPages({
          doc_type: options.docType,
          sort: options.sort,
          order: options.order,
        });

        if (globals.json) {
          printJson(result);
        } else if (!globals.quiet) {
          renderPages(result);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}

function renderPages(result: ListPagesOutput): void {
  process.stderr.write('\n');
  process.stderr.write(`  ${formatBold(`Documents (${result.total}):`)}\n\n`);

  if (result.pages.length === 0) {
    process.stderr.write('  No documents found.\n\n');
    return;
  }

  for (const p of result.pages) {
    process.stderr.write(`  ${formatBold(p.title)}\n`);
    process.stderr.write(
      `    ${formatDim(p.filepath)}  ${formatDim(`type:${p.doc_type}`)}  ${formatDim(`links:${p.link_count}`)}  ${formatDim(`updated:${p.updated_at}`)}\n`,
    );
  }

  process.stderr.write('\n');
}
