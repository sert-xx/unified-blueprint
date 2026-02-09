/**
 * CLI entry point - creates the commander.js program with all commands
 */

import { Command } from 'commander';
import { addGlobalOptions } from './utils/global-options.js';
import { initCommand } from './commands/init.js';
import { serveCommand } from './commands/serve.js';
import { statusCommand } from './commands/status.js';
import { searchCommand } from './commands/search.js';
import { reindexCommand } from './commands/reindex.js';
import { staleCommand } from './commands/stale.js';
import { suggestLinksCommand } from './commands/suggest-links.js';
import { versionCommand } from './commands/version.js';
import { getVersion } from './version.js';

export function createCli(): Command {
  const program = new Command('ubp')
    .description('Unified Blueprint - Documentation-as-Code Middleware')
    .version(getVersion(), '-V, --version');

  addGlobalOptions(program);

  program.addCommand(initCommand());
  program.addCommand(serveCommand());
  program.addCommand(statusCommand());
  program.addCommand(searchCommand());
  program.addCommand(reindexCommand());
  program.addCommand(staleCommand());
  program.addCommand(suggestLinksCommand());
  program.addCommand(versionCommand());

  return program;
}
