/**
 * ubp stale - List stale documents
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatWarning, formatDim } from '../output/formatter.js';

export function staleCommand(): Command {
  return new Command('stale')
    .description('List stale documents')
    .option('--days <n>', 'Threshold in days', '30')
    .option('--exit-code', 'Exit with code 1 if stale documents exist')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);

        const staleResult = await engine.getStaleDocuments({
          threshold_days: parseInt(options.days, 10) || 30,
        });

        if (globals.json) {
          printJson(staleResult);
        } else if (!globals.quiet) {
          if (staleResult.stale_documents.length === 0) {
            process.stderr.write('  No stale documents found.\n');
          } else {
            process.stderr.write('\n');
            process.stderr.write(
              `  ${formatWarning(`${staleResult.total} stale document(s)`)}\n\n`,
            );
            for (const doc of staleResult.stale_documents) {
              process.stderr.write(
                `  ${formatBold(doc.title)} ${formatDim(`(${doc.staleness})`)}\n`,
              );
              process.stderr.write(`    ${formatDim(doc.filepath)}\n`);
              for (const ref of doc.stale_refs) {
                process.stderr.write(
                  `    - ${ref.source_path} (${ref.reason})\n`,
                );
              }
              process.stderr.write('\n');
            }
          }
        }

        if (options.exitCode && staleResult.stale_documents.length > 0) {
          process.exit(1);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}
