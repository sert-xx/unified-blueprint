/**
 * ubp init - Initialize project and build document index
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { renderProgressBar } from '../output/progress.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatSuccess, formatBold } from '../output/formatter.js';
import { renderMcpConfigSnippets } from '../onboarding.js';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize project and build document index')
    .option('-y, --yes', 'Skip prompts and use all defaults', false)
    .option('--skip-embedding', 'Skip embedding model download and vectorization')
    .option('--docs-dir <path>', 'Document directory', './docs')
    .option('--include <patterns...>', 'Include patterns', ['**/*.md'])
    .option('--exclude <patterns...>', 'Exclude patterns')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);

        const result = await engine.initialize({
          docsDir: options.docsDir ?? './docs',
          include: options.include ?? ['**/*.md'],
          exclude: options.exclude ?? [],
          skipEmbedding: options.skipEmbedding ?? false,
          onFileProgress: (current, total) =>
            renderProgressBar({ current, total, label: 'Parsing' }, globals),
          onEmbeddingProgress: (current, total) =>
            renderProgressBar({ current, total, label: 'Embedding' }, globals),
        });

        if (globals.json) {
          printJson(result);
        } else if (!globals.quiet) {
          process.stderr.write('\n');
          process.stderr.write(formatSuccess('Project initialized') + '\n');
          process.stderr.write(`  ${formatBold('Documents:')} ${result.documents_found}\n`);
          process.stderr.write(`  ${formatBold('Sections:')}  ${result.sections_created}\n`);
          process.stderr.write(`  ${formatBold('Links:')}     ${result.links_found}\n`);
          if (result.unresolved_links > 0) {
            process.stderr.write(`  ${formatBold('Unresolved:')} ${result.unresolved_links}\n`);
          }
          process.stderr.write('\n');
          renderMcpConfigSnippets(globals.cwd, globals);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}
