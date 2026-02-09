/**
 * ubp serve - Start Watcher + MCP Server as a persistent process
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { exitWithError, handleCommandError } from '../output/error-display.js';
import { startMcpServer } from '../../mcp/server.js';

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start Watcher + MCP Server as a persistent process')
    .option('--no-lock', 'Skip process lock (for MCP client managed processes)')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);
      const useLock = options.lock !== false;

      try {
        const engine = await createUbpEngine(globals.cwd);

        // 1. Lock file to prevent multiple instances (skip when managed by MCP client)
        if (useLock) {
          const lockResult = engine.acquireLock();
          if (!lockResult.acquired) {
            exitWithError(
              {
                message: 'Another UBP server is already running',
                cause: `PID ${lockResult.existingPid} is active`,
                hint: `Run 'kill ${lockResult.existingPid}' or delete .ubp/serve.lock`,
              },
              globals,
            );
          }
        }

        // 2. DB integrity check (crash recovery)
        await engine.checkAndRepairIfNeeded();

        // 3. Start file watching
        engine.startWatching();

        // 4. Start MCP Server (occupies stdout)
        await startMcpServer(engine);

        // Setup graceful shutdown
        let shuttingDown = false;

        const gracefulShutdown = async (signal: string) => {
          if (shuttingDown) return;
          shuttingDown = true;

          process.stderr.write(`[UBP] Received ${signal}. Shutting down...\n`);

          try {
            engine.stopWatching();
            await engine.close();
            if (useLock) {
              engine.releaseLock();
            }
          } catch {
            // Suppress shutdown errors to avoid ONNX Runtime mutex crash noise
          }

          process.exit(0);
        };

        process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}
