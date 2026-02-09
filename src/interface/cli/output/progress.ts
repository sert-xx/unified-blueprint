/**
 * Simple progress bar for CLI (stderr output)
 */

import type { GlobalOptions } from '../utils/global-options.js';

export interface ProgressState {
  current: number;
  total: number;
  label: string;
}

export function renderProgressBar(
  state: ProgressState,
  globals: GlobalOptions,
): void {
  if (globals.quiet || globals.json) return;

  const { current, total, label } = state;
  const barWidth = 32;
  const filled = total > 0 ? Math.round((current / total) * barWidth) : 0;
  const empty = barWidth - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

  const line = `  ${label.padEnd(12)} ${bar}  ${current}/${total} files`;

  process.stderr.write(`\r${line}`);

  if (current === total) {
    process.stderr.write('\n');
  }
}
