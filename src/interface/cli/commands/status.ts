/**
 * ubp status - Display project status
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatSuccess, formatWarning } from '../output/formatter.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Display project status')
    .option('--check', 'Exit with non-zero code if issues detected')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);
        const status = engine.getStatus();

        if (globals.json) {
          printJson(status);
        } else if (!globals.quiet) {
          process.stderr.write('\n');
          process.stderr.write(
            `  ${formatBold('UBP Status')} ${status.initialized ? formatSuccess('initialized') : formatWarning('not initialized')}\n`,
          );
          process.stderr.write(`  ${formatBold('Docs dir:')}    ${status.docs_dir}\n`);
          process.stderr.write(`  ${formatBold('Documents:')}   ${status.total_documents}\n`);
          process.stderr.write(`  ${formatBold('Sections:')}    ${status.total_sections}\n`);
          process.stderr.write(`  ${formatBold('Links:')}       ${status.total_links} (${status.resolved_links} resolved, ${status.unresolved_links} unresolved)\n`);
          process.stderr.write(
            `  ${formatBold('Embeddings:')}  ${status.embedding_progress.completed}/${status.embedding_progress.total} (${status.embedding_progress.model})\n`,
          );
          if (status.stale_documents > 0) {
            process.stderr.write(
              `  ${formatWarning(`${status.stale_documents} stale document(s)`)}\n`,
            );
          }
          process.stderr.write(
            `  ${formatBold('DB size:')}     ${formatBytes(status.db_size_bytes)}\n`,
          );
          process.stderr.write('\n');
        }

        if (options.check && status.unresolved_links > 0) {
          process.exit(1);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
