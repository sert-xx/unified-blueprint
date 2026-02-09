/**
 * Config resolution utility for CLI commands
 */

import { resolve } from 'node:path';
import type { GlobalOptions } from './global-options.js';

export function resolveConfigPath(globals: GlobalOptions): string {
  return resolve(globals.cwd, '.ubp', 'config.json');
}

export function resolveDbPath(globals: GlobalOptions): string {
  return resolve(globals.cwd, '.ubp', 'knowledge.db');
}

export function resolveUbpDir(globals: GlobalOptions): string {
  return resolve(globals.cwd, '.ubp');
}
