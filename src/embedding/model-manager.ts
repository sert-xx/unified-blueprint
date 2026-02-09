/**
 * モデルダウンロード・キャッシュ管理
 *
 * Embedding モデルのキャッシュディレクトリの管理と、
 * モデルの存在確認を行う。
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_CACHE_DIR = '~/.cache/ubp/models';

export interface ModelManagerConfig {
  cacheDir?: string;
}

/**
 * チルダをホームディレクトリに展開する。
 */
function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

export class ModelManager {
  private readonly cacheDir: string;

  constructor(config?: ModelManagerConfig) {
    this.cacheDir = expandTilde(config?.cacheDir ?? DEFAULT_CACHE_DIR);
  }

  /**
   * キャッシュディレクトリを取得する。存在しない場合は作成する。
   */
  getCacheDir(): string {
    return this.cacheDir;
  }

  /**
   * キャッシュディレクトリを作成する。既に存在する場合は何もしない。
   */
  ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 指定モデルがキャッシュに存在するかを確認する。
   * transformers.js はモデル名をディレクトリ名に変換してキャッシュする。
   *
   * @param modelName - モデル名（例: "Xenova/all-MiniLM-L6-v2"）
   * @returns キャッシュに存在するかどうか
   */
  isModelCached(modelName: string): boolean {
    try {
      // transformers.js のキャッシュ構造: cacheDir/models--Org--Model/
      // スラッシュをハイフンに変換して探索する
      const dirName = modelName.replace(/\//g, '--');
      const candidatePatterns = [
        `models--${dirName}`,
        dirName,
        modelName.replace(/\//g, '_'),
      ];

      if (!existsSync(this.cacheDir)) return false;

      const entries = readdirSync(this.cacheDir);
      return candidatePatterns.some((pattern) =>
        entries.some((entry) => entry.includes(pattern)),
      );
    } catch {
      return false;
    }
  }

  /**
   * キャッシュ使用量の概算を返す（バイト）。
   */
  estimateCacheSize(): number {
    try {
      if (!existsSync(this.cacheDir)) return 0;
      // 簡易実装: ディレクトリの存在のみ確認
      // 正確なサイズ計算はファイルシステム走査が必要だが MVP では省略
      const entries = readdirSync(this.cacheDir);
      return entries.length > 0 ? -1 : 0; // -1 = 計算未対応
    } catch {
      return 0;
    }
  }
}
