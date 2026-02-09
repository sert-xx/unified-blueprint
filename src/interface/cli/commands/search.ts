/**
 * ubp search <query> - Search documents
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatDim, formatScore } from '../output/formatter.js';
import type { SearchResult, FulltextResult } from '../../../shared/types.js';

export function searchCommand(): Command {
  return new Command('search')
    .description('Search documents with semantic or fulltext search')
    .argument('<query>', 'Search query')
    .option('--limit <n>', 'Number of results', '5')
    .option('--no-content', 'Omit content from results')
    .option('--include-links', 'Include link information')
    .option('--fulltext', 'Use FTS5 fulltext search mode')
    .action(async (query: string, options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);
        const limit = parseInt(options.limit, 10) || 5;

        if (options.fulltext) {
          const result = await engine.fulltextSearch({
            query,
            limit,
          });

          if (globals.json) {
            printJson(result);
          } else if (!globals.quiet) {
            renderFulltextResults(result.results, options.content !== false);
          }
        } else {
          const result = await engine.search({
            query,
            limit,
            include_linked: options.includeLinks ?? false,
          });

          if (globals.json) {
            printJson(result);
          } else if (!globals.quiet) {
            renderSearchResults(result.results, options.content !== false, options.includeLinks);
          }
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}

function renderSearchResults(
  results: SearchResult[],
  showContent: boolean,
  showLinks: boolean,
): void {
  if (results.length === 0) {
    process.stderr.write('  No results found.\n');
    return;
  }

  process.stderr.write('\n');
  for (const [i, r] of results.entries()) {
    process.stderr.write(
      `  ${formatBold(`${i + 1}. ${r.title}`)} ${formatScore(r.score)}\n`,
    );
    process.stderr.write(`     ${formatDim(r.filepath)}\n`);
    process.stderr.write(`     ${formatDim(`reason: ${r.relevance_reason}`)}\n`);

    if (showContent && r.sections.length > 0) {
      const firstSection = r.sections[0];
      if (firstSection) {
        const snippet =
          firstSection.content.length > 200
            ? firstSection.content.slice(0, 200) + '...'
            : firstSection.content;
        process.stderr.write(`     ${snippet}\n`);
      }
    }

    if (showLinks && r.linked_pages && r.linked_pages.length > 0) {
      process.stderr.write(`     ${formatDim('Links:')}\n`);
      for (const lp of r.linked_pages) {
        process.stderr.write(
          `       - ${lp.title} (${lp.link_type})\n`,
        );
      }
    }

    process.stderr.write('\n');
  }
}

function renderFulltextResults(
  results: FulltextResult[],
  showContent: boolean,
): void {
  if (results.length === 0) {
    process.stderr.write('  No results found.\n');
    return;
  }

  process.stderr.write('\n');
  for (const [i, r] of results.entries()) {
    process.stderr.write(
      `  ${formatBold(`${i + 1}. ${r.title}`)}\n`,
    );
    process.stderr.write(`     ${formatDim(r.filepath)}\n`);
    if (r.section_heading) {
      process.stderr.write(`     ${formatDim(`# ${r.section_heading}`)}\n`);
    }

    if (showContent) {
      const snippet =
        r.snippet.length > 200 ? r.snippet.slice(0, 200) + '...' : r.snippet;
      process.stderr.write(`     ${snippet}\n`);
    }

    process.stderr.write('\n');
  }
}
