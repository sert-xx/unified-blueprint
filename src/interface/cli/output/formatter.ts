/**
 * CLI output formatter with picocolors
 */

import pc from 'picocolors';
import type { GlobalOptions } from '../utils/global-options.js';

export function formatSuccess(message: string): string {
  return pc.green(`OK ${message}`);
}

export function formatWarning(message: string): string {
  return pc.yellow(`WARN ${message}`);
}

export function formatError(message: string): string {
  return pc.red(`Error: ${message}`);
}

export function formatHint(message: string): string {
  return pc.cyan(`Hint: ${message}`);
}

export function formatScore(score: number): string {
  return pc.dim(`score: ${score.toFixed(2)}`);
}

export function formatDim(text: string): string {
  return pc.dim(text);
}

export function formatBold(text: string): string {
  return pc.bold(text);
}

export function shouldUseColor(globals: GlobalOptions): boolean {
  if (globals.noColor) return false;
  if (process.env['NO_COLOR']) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

export function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}
