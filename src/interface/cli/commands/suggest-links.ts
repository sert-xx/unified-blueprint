/**
 * ubp suggest-links - Suggest implicit link candidates
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatDim, formatScore } from '../output/formatter.js';

export function suggestLinksCommand(): Command {
  return new Command('suggest-links')
    .description('Suggest implicit link candidates')
    .option('--min-score <n>', 'Minimum similarity score', '0.8')
    .option('--limit <n>', 'Maximum number of suggestions', '10')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);

        const suggestions = engine.suggestLinks({
          threshold: parseFloat(options.minScore) || 0.8,
          limit: parseInt(options.limit, 10) || 10,
        });

        if (globals.json) {
          printJson(suggestions);
        } else if (!globals.quiet) {
          if (suggestions.suggestions.length === 0) {
            process.stderr.write('  No link suggestions found.\n');
          } else {
            process.stderr.write('\n');
            process.stderr.write(
              `  ${formatBold(`${suggestions.total} suggestion(s)`)}\n\n`,
            );
            for (const s of suggestions.suggestions) {
              process.stderr.write(
                `  ${s.source_filepath} -> ${s.target_filepath} ${formatScore(s.similarity)}\n`,
              );
              process.stderr.write(
                `    ${formatDim(`Source: ${s.source_section}`)}\n`,
              );
              process.stderr.write(
                `    ${formatDim(`Target: ${s.target_section}`)}\n`,
              );
              process.stderr.write('\n');
            }
          }
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}
