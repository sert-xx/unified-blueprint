/**
 * Version utility - reads version from package.json
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | null = null;

export function getVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    // Resolve package.json relative to this file
    const thisDir = dirname(fileURLToPath(import.meta.url));
    // Navigate from src/interface/cli/ or dist/interface/cli/ up to project root
    const pkgPath = resolve(thisDir, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    cachedVersion = pkg.version;
    return cachedVersion;
  } catch {
    return '0.0.0';
  }
}
