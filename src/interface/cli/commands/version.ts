/**
 * ubp version - Display version information
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { printJson } from '../output/json-output.js';
import { getVersion } from '../version.js';

export function versionCommand(): Command {
  return new Command('version')
    .description('Display version information')
    .action((_options, cmd) => {
      const globals = resolveGlobalOptions(cmd);
      const version = getVersion();

      if (globals.json) {
        printJson({ version });
      } else {
        process.stdout.write(`UBP v${version}\n`);
      }
    });
}
