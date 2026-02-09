/**
 * SHA-256 hash utility
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Compute SHA-256 hex hash of a string */
export function hashString(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Compute SHA-256 hex hash of a file */
export async function hashFile(filepath: string): Promise<string> {
  const content = await readFile(filepath);
  return createHash('sha256').update(content).digest('hex');
}
