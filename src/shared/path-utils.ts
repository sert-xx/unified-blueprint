/**
 * Path normalization and validation utilities
 */

import * as path from 'node:path';
import { UbpError } from './errors.js';

/**
 * Validate that a path stays within the given base directory.
 * Returns the resolved, normalized absolute path.
 * Throws if path traversal is detected.
 */
export function validateAndNormalizePath(
  inputPath: string,
  baseDir: string,
): string {
  const resolved = path.resolve(baseDir, inputPath);
  const normalized = path.normalize(resolved);
  const normalizedBase = path.normalize(baseDir);

  if (
    normalized !== normalizedBase &&
    !normalized.startsWith(normalizedBase + path.sep)
  ) {
    throw new UbpError(
      `Path traversal detected: ${inputPath}`,
      'PATH_TRAVERSAL',
    );
  }

  return normalized;
}

/**
 * Convert an absolute path to a relative path from the base directory.
 * Returns POSIX-style forward-slash separated path.
 */
export function toRelativePath(absolutePath: string, baseDir: string): string {
  return path.relative(baseDir, absolutePath).split(path.sep).join('/');
}

/**
 * Normalize a filepath to use forward slashes (POSIX-style).
 */
export function normalizeToPosix(filepath: string): string {
  return filepath.split(path.sep).join('/');
}

/**
 * Check if a filepath matches the given include/exclude glob patterns.
 * Uses simple checks; for production, picomatch would be more robust.
 */
export function matchesGlobPatterns(
  filepath: string,
  include: string[],
  exclude: string[],
): boolean {
  const posixPath = normalizeToPosix(filepath);

  // Check exclusions first
  for (const pattern of exclude) {
    if (simpleGlobMatch(posixPath, pattern)) {
      return false;
    }
  }

  // Check inclusions
  for (const pattern of include) {
    if (simpleGlobMatch(posixPath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob match supporting ** and * patterns.
 */
function simpleGlobMatch(filepath: string, pattern: string): boolean {
  // Convert glob to regex
  // Handle **/ (match any directory prefix, including empty)
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '{{DOUBLE_STAR_SLASH}}')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLE_STAR_SLASH}}/g, '(.*/)?')
    .replace(/{{DOUBLE_STAR}}/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(filepath);
}
