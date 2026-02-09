/**
 * Global CLI options shared across all commands
 */

import type { Command } from 'commander';

export interface GlobalOptions {
  json: boolean;
  noColor: boolean;
  verbose: boolean;
  quiet: boolean;
  cwd: string;
}

export function addGlobalOptions(program: Command): void {
  program
    .option('--json', 'Output in JSON format', false)
    .option('--no-color', 'Disable color output')
    .option('-v, --verbose', 'Verbose output', false)
    .option('-q, --quiet', 'Minimal output (errors only)', false)
    .option('--cwd <path>', 'Set working directory', process.cwd());
}

export function resolveGlobalOptions(cmd: Command): GlobalOptions {
  const opts = cmd.optsWithGlobals<{
    json?: boolean;
    color?: boolean;
    verbose?: boolean;
    quiet?: boolean;
    cwd?: string;
  }>();
  return {
    json: opts.json ?? false,
    noColor: opts.color === false || !!process.env['NO_COLOR'] || !process.stdout.isTTY,
    verbose: opts.verbose ?? false,
    quiet: opts.quiet ?? false,
    cwd: opts.cwd ?? process.cwd(),
  };
}
