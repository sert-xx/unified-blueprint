import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

/**
 * プリペアドステートメントキャッシュ
 * 頻繁に実行されるクエリのコンパイルコストを排除する
 */
export class StatementCache {
  private cache: Map<string, Statement>;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.cache = new Map();
  }

  /**
   * キー付きでプリペアドステートメントを取得する。
   * 初回はコンパイルしてキャッシュ、2回目以降はキャッシュから返す。
   */
  get(key: string, sql: string): Statement {
    let stmt = this.cache.get(key);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.cache.set(key, stmt);
    }
    return stmt;
  }

  /**
   * 全ステートメントのキャッシュクリア。DB切断時に呼ぶ。
   */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
