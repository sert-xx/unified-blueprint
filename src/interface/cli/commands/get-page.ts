/**
 * ubp get-page <filepath> - Retrieve a single page with full content and links
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatDim } from '../output/formatter.js';
import type { GetPageOutput } from '../../../shared/types.js';

export function getPageCommand(): Command {
  return new Command('get-page')
    .description('Retrieve a single page with full content, sections, and links')
    .argument('<filepath>', 'Filepath of the page (relative to docs dir)')
    .option('--no-content', 'Omit full content from output')
    .action(async (filepath: string, options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);
        const page = engine.getPage({ filepath });

        if (globals.json) {
          printJson(page);
        } else if (!globals.quiet) {
          renderPage(page, options.content !== false);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}

function renderPage(page: GetPageOutput, showContent: boolean): void {
  process.stderr.write('\n');
  process.stderr.write(`  ${formatBold(page.title)}\n`);
  process.stderr.write(`  ${formatDim(page.filepath)}\n`);
  process.stderr.write(`  ${formatDim(`type: ${page.doc_type}  staleness: ${page.staleness}`)}\n`);
  process.stderr.write(`  ${formatDim(`updated: ${page.updated_at}`)}\n`);

  if (page.stale_refs.length > 0) {
    process.stderr.write(`  ${formatDim(`stale refs: ${page.stale_refs.join(', ')}`)}\n`);
  }

  process.stderr.write('\n');

  // Sections
  if (page.sections.length > 0) {
    process.stderr.write(`  ${formatBold('Sections:')}\n`);
    for (const s of page.sections) {
      const heading = s.heading ?? '(no heading)';
      if (showContent) {
        const snippet =
          s.content.length > 300 ? s.content.slice(0, 300) + '...' : s.content;
        process.stderr.write(`    ${formatDim('##')} ${heading}\n`);
        process.stderr.write(`    ${snippet}\n\n`);
      } else {
        process.stderr.write(`    - ${heading}\n`);
      }
    }
  }

  // Links
  if (page.outlinks.length > 0) {
    process.stderr.write(`  ${formatBold('Outlinks:')}\n`);
    for (const l of page.outlinks) {
      process.stderr.write(`    -> ${l.title} (${l.link_type}) ${formatDim(l.filepath)}\n`);
    }
    process.stderr.write('\n');
  }

  if (page.backlinks.length > 0) {
    process.stderr.write(`  ${formatBold('Backlinks:')}\n`);
    for (const l of page.backlinks) {
      process.stderr.write(`    <- ${l.title} (${l.link_type}) ${formatDim(l.filepath)}\n`);
    }
    process.stderr.write('\n');
  }
}
