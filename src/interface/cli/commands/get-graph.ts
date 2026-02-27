/**
 * ubp get-graph - Get the document link graph
 */

import { Command } from 'commander';
import { resolveGlobalOptions } from '../utils/global-options.js';
import { createUbpEngine } from '../../../core/engine.js';
import { printJson } from '../output/json-output.js';
import { handleCommandError } from '../output/error-display.js';
import { formatBold, formatDim } from '../output/formatter.js';
import type { GetGraphOutput } from '../../../shared/types.js';

export function getGraphCommand(): Command {
  return new Command('get-graph')
    .description('Get the document link graph as nodes and edges')
    .option('--center <filepath>', 'Center on a specific document (omit for full graph)')
    .option('--depth <n>', 'Traversal depth from center (1-5)', '2')
    .action(async (options, cmd) => {
      const globals = resolveGlobalOptions(cmd);

      try {
        const engine = await createUbpEngine(globals.cwd);
        const depth = Math.min(5, Math.max(1, parseInt(options.depth, 10) || 2));

        const graph = engine.getGraph({
          center: options.center,
          depth,
        });

        if (globals.json) {
          printJson(graph);
        } else if (!globals.quiet) {
          renderGraph(graph);
        }
      } catch (error) {
        handleCommandError(error, globals);
      }
    });
}

function renderGraph(graph: GetGraphOutput): void {
  process.stderr.write('\n');
  process.stderr.write(
    `  ${formatBold(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)}\n\n`,
  );

  if (graph.nodes.length === 0) {
    process.stderr.write('  No nodes found.\n\n');
    return;
  }

  process.stderr.write(`  ${formatBold('Nodes:')}\n`);
  for (const n of graph.nodes) {
    process.stderr.write(`    ${n.title} ${formatDim(`(${n.doc_type})`)} ${formatDim(n.filepath)}\n`);
  }

  if (graph.edges.length > 0) {
    process.stderr.write(`\n  ${formatBold('Edges:')}\n`);
    for (const e of graph.edges) {
      process.stderr.write(`    ${e.source} -[${e.type}]-> ${e.target}\n`);
    }
  }

  process.stderr.write('\n');
}
