/**
 * ubp reindex - Rebuild index
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { renderProgressBar } from '../output/progress.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatSuccess, formatBold } from '../output/formatter.js';

export function reindexCommand(): Command {
  return new Command('reindex')
    .description('Rebuild the document index')
    .option('--skip-embedding', 'Rebuild link graph only')
    .option('--file <path>', 'Reindex a specific file only')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);

        const result = await engine.reindex({
          skipEmbedding: options.skipEmbedding,
          targetFile: options.file,
          onProgress: (progress) => renderProgressBar(progress, globals),
        });

        if (globals.json) {
          printJson(result);
        } else if (!globals.quiet) {
          process.stderr.write('\n');
          process.stderr.write(formatSuccess('Reindex complete') + '\n');
          process.stderr.write(`  ${formatBold('Documents:')}  ${result.documents_processed}\n`);
          process.stderr.write(`  ${formatBold('Sections:')}   ${result.sections_updated}\n`);
          process.stderr.write(`  ${formatBold('Links:')}      ${result.links_updated}\n`);
          process.stderr.write(`  ${formatBold('Embeddings:')} ${result.embeddings_queued} queued\n`);
          process.stderr.write('\n');
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}
