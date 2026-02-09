import type Database from 'better-sqlite3';
import type { Migration } from '../types.js';
import { MigrationError } from '../../shared/errors.js';
import { migration001 } from './001-initial-schema.js';

const migrations: Migration[] = [migration001];

/**
 * マイグレーション管理
 * schema_version テーブルの最大バージョンを確認し、未適用のマイグレーションを順次実行する
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db);
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const migration of pending) {
    try {
      db.transaction(() => {
        migration.up(db);
      })();
    } catch (err) {
      throw new MigrationError(
        migration.version,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
}

function getCurrentVersion(db: Database.Database): number {
  // Check if schema_version table exists
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get() as { name: string } | undefined;

  if (!tableExists) {
    return 0;
  }

  const row = db
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number | null } | undefined;

  return row?.max_version ?? 0;
}

export { migrations };
