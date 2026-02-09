/**
 * UBP 設定型定義
 */

export interface UbpConfig {
  /** プロジェクトルートからの相対パス */
  docs_dir: string;

  /** ソースファイル設定 */
  source: {
    include: string[];
    exclude: string[];
  };

  /** Embedding 設定 */
  embedding: {
    model: string;
    dimensions: number;
    batch_size: number;
  };

  /** 検索設定 */
  search: {
    alpha: number;
    default_limit: number;
    max_depth: number;
  };

  /** 鮮度検出設定 */
  staleness: {
    threshold_days: number;
  };

  /** ログ設定 */
  log: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string | null;
  };
}

export const DEFAULT_CONFIG: UbpConfig = {
  docs_dir: 'docs',
  source: {
    include: ['**/*.md'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  },
  embedding: {
    model: 'Xenova/multilingual-e5-large',
    dimensions: 1024,
    batch_size: 32,
  },
  search: {
    alpha: 0.7,
    default_limit: 10,
    max_depth: 2,
  },
  staleness: {
    threshold_days: 7,
  },
  log: {
    level: 'info',
    file: null,
  },
};
