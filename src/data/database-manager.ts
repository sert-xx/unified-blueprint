import Database from 'better-sqlite3';
import { DatabaseError } from '../shared/errors.js';
import { StatementCache } from './statement-cache.js';
import { VectorIndex } from './vector-index.js';
import { runMigrations } from './migrations/index.js';
import {
  createDocumentRepository,
  type DocumentRepository,
} from './repositories/document-repository.js';
import {
  createSectionRepository,
  type SectionRepository,
} from './repositories/section-repository.js';
import {
  createLinkRepository,
  type LinkRepository,
} from './repositories/link-repository.js';
import {
  createSourceRefsStateRepository,
  type SourceRefsStateRepository,
} from './repositories/source-refs-repository.js';
import {
  createGraphQueryService,
  type GraphQueryService,
} from './services/graph-query-service.js';
import {
  createFulltextSearchService,
  type FulltextSearchService,
} from './services/fulltext-search-service.js';

export interface DatabaseManagerOptions {
  dbPath: string;
  readonly?: boolean;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private statementCache: StatementCache | null = null;
  private vectorIndex: VectorIndex | null = null;
  private readonly dbPath: string;
  private readonly readonlyMode: boolean;

  // Repositories (lazy-initialized)
  private _documentRepo: DocumentRepository | null = null;
  private _sectionRepo: SectionRepository | null = null;
  private _linkRepo: LinkRepository | null = null;
  private _sourceRefsRepo: SourceRefsStateRepository | null = null;
  private _graphService: GraphQueryService | null = null;
  private _fulltextService: FulltextSearchService | null = null;

  constructor(options: DatabaseManagerOptions) {
    this.dbPath = options.dbPath;
    this.readonlyMode = options.readonly ?? false;
  }

  /**
   * DB接続を開き、PRAGMA設定、マイグレーション、ベクトルロードを行う
   */
  initialize(): void {
    try {
      this.db = new Database(this.dbPath, {
        readonly: this.readonlyMode,
      });

      // PRAGMA設定
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000');
      this.db.pragma('mmap_size = 268435456');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('wal_autocheckpoint = 1000');

      // マイグレーション実行
      if (!this.readonlyMode) {
        runMigrations(this.db);
      }

      // StatementCache初期化
      this.statementCache = new StatementCache(this.db);

      // VectorIndex初期化 & ロード
      this.vectorIndex = new VectorIndex();
      this.vectorIndex.loadFromDatabase(this.db);
    } catch (err) {
      throw new DatabaseError(
        `Failed to initialize database at ${this.dbPath}`,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  getDb(): Database.Database {
    if (!this.db) {
      throw new DatabaseError('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  getStatementCache(): StatementCache {
    if (!this.statementCache) {
      throw new DatabaseError('Database not initialized. Call initialize() first.');
    }
    return this.statementCache;
  }

  getVectorIndex(): VectorIndex {
    if (!this.vectorIndex) {
      throw new DatabaseError('Database not initialized. Call initialize() first.');
    }
    return this.vectorIndex;
  }

  // --- Repository accessors ---

  get documents(): DocumentRepository {
    if (!this._documentRepo) {
      this._documentRepo = createDocumentRepository(this.getStatementCache());
    }
    return this._documentRepo;
  }

  get sections(): SectionRepository {
    if (!this._sectionRepo) {
      this._sectionRepo = createSectionRepository(this.getStatementCache());
    }
    return this._sectionRepo;
  }

  get links(): LinkRepository {
    if (!this._linkRepo) {
      this._linkRepo = createLinkRepository(this.getStatementCache());
    }
    return this._linkRepo;
  }

  get sourceRefs(): SourceRefsStateRepository {
    if (!this._sourceRefsRepo) {
      this._sourceRefsRepo = createSourceRefsStateRepository(
        this.getStatementCache(),
      );
    }
    return this._sourceRefsRepo;
  }

  get graph(): GraphQueryService {
    if (!this._graphService) {
      this._graphService = createGraphQueryService(this.getDb());
    }
    return this._graphService;
  }

  get fulltext(): FulltextSearchService {
    if (!this._fulltextService) {
      this._fulltextService = createFulltextSearchService(this.getDb());
    }
    return this._fulltextService;
  }

  /**
   * 安全なシャットダウン（WALチェックポイント + DB close）
   */
  close(): void {
    if (!this.db) return;

    try {
      // リポジトリ参照をクリア
      this._documentRepo = null;
      this._sectionRepo = null;
      this._linkRepo = null;
      this._sourceRefsRepo = null;
      this._graphService = null;
      this._fulltextService = null;

      // StatementCacheをクリア
      if (this.statementCache) {
        this.statementCache.clear();
        this.statementCache = null;
      }

      // WALチェックポイント
      if (!this.readonlyMode) {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      }

      // DB接続クローズ
      this.db.close();
      this.db = null;
      this.vectorIndex = null;
    } catch (err) {
      throw new DatabaseError(
        'Failed to close database',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
}
