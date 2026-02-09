/**
 * Configuration loading and validation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UbpConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { ConfigError, ConfigNotFoundError } from '../shared/errors.js';

const CONFIG_DIR = '.ubp';
const CONFIG_FILE = 'config.json';

/**
 * Resolve the .ubp directory path from a given working directory.
 */
export function resolveUbpDir(cwd: string): string {
  return path.join(cwd, CONFIG_DIR);
}

/**
 * Resolve the config.json path.
 */
export function resolveConfigPath(cwd: string): string {
  return path.join(resolveUbpDir(cwd), CONFIG_FILE);
}

/**
 * Resolve the database path.
 */
export function resolveDbPath(cwd: string): string {
  return path.join(resolveUbpDir(cwd), 'knowledge.db');
}

/**
 * Check if a UBP config directory exists.
 */
export function configExists(cwd: string): boolean {
  return fs.existsSync(resolveConfigPath(cwd));
}

/**
 * Load config from disk, merging with defaults.
 */
export function loadConfig(cwd: string): UbpConfig {
  const configPath = resolveConfigPath(cwd);

  if (!fs.existsSync(configPath)) {
    throw new ConfigNotFoundError(configPath);
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UbpConfig>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    if (err instanceof ConfigNotFoundError) throw err;
    throw new ConfigError(
      `Failed to load config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Save config to disk.
 */
export function saveConfig(cwd: string, config: UbpConfig): void {
  const ubpDir = resolveUbpDir(cwd);
  if (!fs.existsSync(ubpDir)) {
    fs.mkdirSync(ubpDir, { recursive: true });
  }
  const configPath = resolveConfigPath(cwd);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Delete the .ubp directory.
 */
export function cleanConfig(cwd: string): void {
  const ubpDir = resolveUbpDir(cwd);
  if (fs.existsSync(ubpDir)) {
    fs.rmSync(ubpDir, { recursive: true, force: true });
  }
}

/**
 * Merge a partial config with defaults.
 */
function mergeWithDefaults(partial: Partial<UbpConfig>): UbpConfig {
  return {
    docs_dir: partial.docs_dir ?? DEFAULT_CONFIG.docs_dir,
    source: {
      include: partial.source?.include ?? DEFAULT_CONFIG.source.include,
      exclude: partial.source?.exclude ?? DEFAULT_CONFIG.source.exclude,
    },
    embedding: {
      model: partial.embedding?.model ?? DEFAULT_CONFIG.embedding.model,
      dimensions: partial.embedding?.dimensions ?? DEFAULT_CONFIG.embedding.dimensions,
      batch_size: partial.embedding?.batch_size ?? DEFAULT_CONFIG.embedding.batch_size,
    },
    search: {
      alpha: partial.search?.alpha ?? DEFAULT_CONFIG.search.alpha,
      default_limit: partial.search?.default_limit ?? DEFAULT_CONFIG.search.default_limit,
      max_depth: partial.search?.max_depth ?? DEFAULT_CONFIG.search.max_depth,
    },
    staleness: {
      threshold_days: partial.staleness?.threshold_days ?? DEFAULT_CONFIG.staleness.threshold_days,
    },
    log: {
      level: partial.log?.level ?? DEFAULT_CONFIG.log.level,
      file: partial.log?.file ?? DEFAULT_CONFIG.log.file,
    },
  };
}
