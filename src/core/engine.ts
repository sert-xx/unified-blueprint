/**
 * UbpEngine - Core Layer facade
 *
 * Interface Layer (CLI / MCP) accesses all functionality through this facade only.
 * Integrates Data Layer repositories with Core modules.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

import type { UbpConfig } from '../config/types.js';
import {
  loadConfig,
  saveConfig,
  configExists as configExistsOnDisk,
  cleanConfig as cleanConfigOnDisk,
  resolveDbPath,
  resolveUbpDir,
} from '../config/config.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import type {
  DocType,
  SearchInput,
  SearchOutput,
  FulltextSearchInput,
  FulltextSearchOutput,
  GetPageInput,
  GetPageOutput,
  GetContextInput,
  GetContextOutput,
  ListPagesInput,
  ListPagesOutput,
  GetGraphInput,
  GetGraphOutput,
  StatusOutput,
  StaleOptions,
  StaleOutput,
  SuggestLinksOptions as SharedSuggestLinksOptions,
  SuggestLinksOutput,
  InitResult,
  ReindexOptions,
  ReindexResult,
  LinkInfo,
  RelatedDoc,
  PageSummary,
} from '../shared/types.js';
import { DocumentNotFoundError } from '../shared/errors.js';
import { DatabaseManager } from '../data/database-manager.js';
import type { EmbeddingProvider } from '../embedding/provider.js';
import { LocalEmbeddingProvider } from '../embedding/local-provider.js';
import { parseMarkdown } from './parser/markdown-parser.js';
import { LinkResolver } from './linker/link-resolver.js';
import { EmbeddingQueue } from './embedding/embedding-queue.js';
import { FileWatcher } from './watcher/file-watcher.js';
import { ChangeProcessor } from './watcher/change-processor.js';
import { StalenessDetector } from './staleness/staleness-detector.js';
import { HybridSearch } from './search/hybrid-search.js';
import { VectorSearch } from './search/vector-search.js';
import { FulltextSearch } from './search/fulltext-search.js';
import { GraphTraversal } from './graph/graph-traversal.js';
import { GraphScorer } from './graph/graph-scorer.js';
import { SuggestLinksEngine } from './suggest/suggest-links-engine.js';
import { hashString } from '../shared/hash.js';
import { configureLogger, createLogger, closeLogger, type Logger } from '../shared/logger.js';
import { matchesGlobPatterns, toRelativePath } from '../shared/path-utils.js';

export interface InitOptions {
  docsDir: string;
  include: string[];
  exclude: string[];
  skipEmbedding: boolean;
  onFileProgress?: (current: number, total: number) => void;
  onEmbeddingProgress?: (current: number, total: number) => void;
}

export interface CreateProjectOptions {
  docsDir: string;
  include: string[];
  exclude: string[];
}

export class UbpEngine {
  private config: UbpConfig | null = null;
  private cwd: string;
  private db: DatabaseManager | null = null;
  private embeddingProvider: EmbeddingProvider | null = null;
  private linkResolver: LinkResolver | null = null;
  private embeddingQueue: EmbeddingQueue | null = null;
  private fileWatcher: FileWatcher | null = null;
  private changeProcessor: ChangeProcessor | null = null;
  private stalenessDetector: StalenessDetector | null = null;
  private hybridSearch: HybridSearch | null = null;
  private suggestLinksEngine: SuggestLinksEngine | null = null;
  private logger: Logger;
  private _initialized = false;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.logger = createLogger('UbpEngine');
  }

  // --- Initialization / Indexing ---

  async initialize(options: InitOptions): Promise<InitResult> {
    this.logger.info(`Initializing UBP in ${this.cwd}`);

    // Create/load config
    const config: UbpConfig = {
      ...DEFAULT_CONFIG,
      docs_dir: options.docsDir,
      source: {
        include: options.include,
        exclude: options.exclude,
      },
    };
    this.config = config;

    // Save config
    saveConfig(this.cwd, config);

    // Configure logger
    configureLogger({ level: config.log.level, file: config.log.file });

    // Initialize database
    const dbPath = resolveDbPath(this.cwd);
    this.db = new DatabaseManager({ dbPath });
    this.db.initialize();

    // Initialize embedding provider
    if (!options.skipEmbedding) {
      this.embeddingProvider = new LocalEmbeddingProvider({
        modelName: config.embedding.model,
      });
      try {
        await this.embeddingProvider.initialize();
      } catch (err) {
        this.logger.warn(`Embedding provider initialization failed: ${err instanceof Error ? err.message : String(err)}. Continuing without embeddings.`);
        this.embeddingProvider = null;
      }
    }

    // Initialize core modules
    this.initializeCoreModules();

    // Scan docs directory
    const docsRoot = path.resolve(this.cwd, config.docs_dir);
    const files = await this.scanDocsDirectory(docsRoot, config);

    // Build link resolver index
    const filepaths = files.map((f) => f.relativePath);
    this.linkResolver!.buildIndex(filepaths);

    // Set document lookup adapter for LinkResolver
    this.linkResolver!.setDocumentLookup({
      getAllFilepaths: () => {
        return this.db!.documents.findAll().map((d) => d.filepath);
      },
      getDocIdByFilepath: (filepath: string) => {
        const doc = this.db!.documents.findByFilepath(filepath);
        return doc?.id ?? null;
      },
    });

    // Process each file
    let sectionsCreated = 0;
    let linksFound = 0;
    let unresolvedLinks = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      options.onFileProgress?.(i + 1, files.length);

      try {
        const result = await this.changeProcessor!.processFile(
          file.relativePath,
          file.content,
          { forceUpdate: true },
        );
        sectionsCreated += result.sectionsCreated;
        linksFound += result.linksResolved + result.linksDangling;
        unresolvedLinks += result.linksDangling;
      } catch (err) {
        this.logger.error(`Failed to process ${file.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Start embedding queue if provider is available
    if (this.embeddingProvider && this.embeddingQueue) {
      this.embeddingQueue.start();

      if (options.onEmbeddingProgress) {
        this.embeddingQueue.on((event, data) => {
          if (event === 'queue:progress') {
            const progress = data as { completed: number; total: number };
            options.onEmbeddingProgress!(progress.completed, progress.total);
          }
        });
      }
    }

    this._initialized = true;

    return {
      docs_dir: config.docs_dir,
      documents_found: files.length,
      sections_created: sectionsCreated,
      links_found: linksFound,
      unresolved_links: unresolvedLinks,
    };
  }

  async reindex(options?: ReindexOptions & {
    skipEmbedding?: boolean;
    targetFile?: string;
    onProgress?: (progress: { current: number; total: number; label: string }) => void;
  }): Promise<ReindexResult> {
    this.ensureInitialized();

    const docsRoot = path.resolve(this.cwd, this.config!.docs_dir);
    let files: Array<{ relativePath: string; content: string }>;

    if (options?.targetFile) {
      // Reindex single file
      const absolutePath = path.resolve(docsRoot, options.targetFile);
      const content = await readFile(absolutePath, 'utf-8');
      files = [{ relativePath: options.targetFile, content }];
    } else {
      files = await this.scanDocsDirectory(docsRoot, this.config!);
    }

    // Rebuild link resolver index
    const allFilepaths = files.map((f) => f.relativePath);
    this.linkResolver!.buildIndex(allFilepaths);

    let documentsProcessed = 0;
    let sectionsUpdated = 0;
    let linksUpdated = 0;
    let embeddingsQueued = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      options?.onProgress?.({
        current: i + 1,
        total: files.length,
        label: file.relativePath,
      });

      try {
        const result = await this.changeProcessor!.processFile(
          file.relativePath,
          file.content,
          { forceUpdate: options?.force ?? false },
        );

        if (!result.skipped) {
          documentsProcessed++;
          sectionsUpdated += result.sectionsCreated;
          linksUpdated += result.linksResolved + result.linksDangling;
          embeddingsQueued += result.embeddingsQueued;
        }
      } catch (err) {
        this.logger.error(`Failed to reindex ${file.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Remove documents that no longer exist on disk
    if (!options?.targetFile) {
      const removedIds = this.db!.documents.deleteNotIn(allFilepaths);
      for (const id of removedIds) {
        this.db!.getVectorIndex().removeByDocId(id);
      }
    }

    return {
      documents_processed: documentsProcessed,
      sections_updated: sectionsUpdated,
      links_updated: linksUpdated,
      embeddings_queued: embeddingsQueued,
    };
  }

  async createProjectStructure(options: CreateProjectOptions): Promise<void> {
    const docsDir = path.resolve(this.cwd, options.docsDir);
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Save config
    const config: UbpConfig = {
      ...DEFAULT_CONFIG,
      docs_dir: options.docsDir,
      source: {
        include: options.include,
        exclude: options.exclude,
      },
    };
    saveConfig(this.cwd, config);
  }

  async configExists(): Promise<boolean> {
    return configExistsOnDisk(this.cwd);
  }

  async cleanConfig(): Promise<void> {
    await this.close();
    cleanConfigOnDisk(this.cwd);
  }

  // --- File Watching ---

  startWatching(): void {
    this.ensureInitialized();

    if (this.fileWatcher) return;

    const docsRoot = path.resolve(this.cwd, this.config!.docs_dir);

    this.fileWatcher = new FileWatcher({
      docsRoot,
      config: this.config!,
      onFileChange: async (event) => {
        await this.changeProcessor!.processChange(event);
      },
    });

    this.fileWatcher.start();
    this.logger.info('File watching started');
  }

  stopWatching(): void {
    if (this.fileWatcher) {
      void this.fileWatcher.stop();
      this.fileWatcher = null;
      this.logger.info('File watching stopped');
    }
  }

  // --- Search ---

  async search(input: SearchInput): Promise<SearchOutput> {
    this.ensureInitialized();
    return this.hybridSearch!.search(input);
  }

  async fulltextSearch(input: FulltextSearchInput): Promise<FulltextSearchOutput> {
    this.ensureInitialized();

    const limit = input.limit ?? this.config!.search.default_limit;
    const results = this.db!.fulltext.search(input.query, limit * 2);

    let filtered = results;
    if (input.doc_type) {
      filtered = results.filter((r) => r.docType === input.doc_type);
    }

    return {
      results: filtered.slice(0, limit).map((r) => ({
        doc_id: r.docId,
        filepath: this.db!.documents.findById(r.docId)?.filepath ?? '',
        title: r.title,
        section_heading: r.heading,
        snippet: r.snippet,
        rank: r.rank,
      })),
      total_found: filtered.length,
    };
  }

  // --- Page Operations ---

  getPage(input: GetPageInput): GetPageOutput {
    this.ensureInitialized();

    const doc = this.db!.documents.findByFilepath(input.filepath);
    if (!doc) {
      throw new DocumentNotFoundError(input.filepath);
    }

    const sections = this.db!.sections.findByDocId(doc.id);
    const outlinks = this.db!.links.findBySourceDocId(doc.id);
    const backlinks = this.db!.links.findByTargetDocId(doc.id);

    const staleness = this.stalenessDetector!.getStaleness(doc.id);
    const staleRefs = this.stalenessDetector!.getStaleRefs(doc.id);

    // Build full content from sections
    const content = sections.map((s) => {
      if (s.heading) {
        return `## ${s.heading}\n\n${s.content}`;
      }
      return s.content;
    }).join('\n\n');

    return {
      doc_id: doc.id,
      filepath: doc.filepath,
      title: doc.title,
      doc_type: doc.doc_type as DocType,
      content,
      sections: sections.map((s) => ({
        heading: s.heading,
        content: s.content,
      })),
      outlinks: outlinks
        .filter((l) => l.target_doc_id)
        .map((l) => {
          const target = this.db!.documents.findById(l.target_doc_id!);
          return {
            doc_id: l.target_doc_id!,
            filepath: target?.filepath ?? '',
            title: target?.title ?? l.target_title ?? '',
            link_type: l.type,
          };
        })
        .filter((l): l is LinkInfo => l.filepath !== ''),
      backlinks: backlinks.map((l) => {
        const source = this.db!.documents.findById(l.source_doc_id);
        return {
          doc_id: l.source_doc_id,
          filepath: source?.filepath ?? '',
          title: source?.title ?? '',
          link_type: l.type,
        };
      }).filter((l): l is LinkInfo => l.filepath !== ''),
      staleness,
      stale_refs: staleRefs,
      updated_at: doc.updated_at,
    };
  }

  getContext(input: GetContextInput): GetContextOutput {
    this.ensureInitialized();

    const doc = this.db!.documents.findByFilepath(input.filepath);
    if (!doc) {
      throw new DocumentNotFoundError(input.filepath);
    }

    const depth = input.depth ?? this.config!.search.max_depth;
    const maxSize = input.max_size ?? 50000;

    // Get document content
    const sections = this.db!.sections.findByDocId(doc.id);
    const content = sections.map((s) => s.content).join('\n\n');

    // Graph traversal for related docs
    const graphNodes = this.db!.graph.traverseBidirectional(doc.id, depth);

    const related: RelatedDoc[] = [];
    let totalSize = content.length;
    let truncatedCount = 0;

    for (const node of graphNodes) {
      const relatedDoc = this.db!.documents.findById(node.docId);
      if (!relatedDoc) continue;

      const relatedSections = this.db!.sections.findByDocId(node.docId);
      const summary = relatedSections
        .map((s) => s.content)
        .join('\n\n')
        .slice(0, 500);

      if (totalSize + summary.length > maxSize) {
        truncatedCount++;
        continue;
      }

      totalSize += summary.length;

      related.push({
        doc_id: node.docId,
        filepath: relatedDoc.filepath,
        title: relatedDoc.title,
        link_type: node.linkType,
        direction: node.direction === 'outgoing' ? 'outlink' : 'backlink',
        summary,
        depth: node.depth,
      });
    }

    return {
      center: {
        doc_id: doc.id,
        filepath: doc.filepath,
        title: doc.title,
        content,
      },
      related,
      total_size: totalSize,
      truncated_count: truncatedCount,
    };
  }

  listPages(input: ListPagesInput): ListPagesOutput {
    this.ensureInitialized();

    // Map sort field: 'filepath' is not supported by repository, fall back to 'title'
    const sortBy = input.sort === 'filepath' ? 'title' : (input.sort ?? 'title');
    const docs = this.db!.documents.findAll({
      sortBy,
      order: input.order ?? 'asc',
      docType: input.doc_type as unknown as import('../data/types.js').DataDocType | undefined,
    });

    const pages: PageSummary[] = docs.map((doc) => ({
      doc_id: doc.id,
      filepath: doc.filepath,
      title: doc.title,
      doc_type: doc.doc_type as DocType,
      link_count: this.db!.links.findBySourceDocId(doc.id).length,
      updated_at: doc.updated_at,
    }));

    return {
      pages,
      total: pages.length,
    };
  }

  // --- Graph ---

  getGraph(input: GetGraphInput): GetGraphOutput {
    this.ensureInitialized();

    const centerDocId = input.center
      ? this.resolveDocId(input.center)
      : null;

    const depth = input.depth ?? this.config!.search.max_depth;
    const graphData = this.db!.graph.getGraphStructure(centerDocId, depth);

    return {
      nodes: graphData.nodes.map((n) => ({
        id: n.id,
        filepath: this.db!.documents.findById(n.id)?.filepath ?? '',
        title: n.title,
        doc_type: n.docType as DocType,
      })),
      edges: graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type as import('../shared/types.js').LinkType,
      })),
    };
  }

  // --- Status ---

  getStatus(): StatusOutput {
    this.ensureInitialized();

    const linkCounts = this.db!.links.count();
    const sectionCount = this.db!.sections.count();
    const sectionsWithEmbedding = this.db!.sections.countWithEmbedding();
    const docCount = this.db!.documents.findAll().length;
    const staleSummary = this.db!.sourceRefs.summary();

    // Get DB file size
    const dbPath = resolveDbPath(this.cwd);
    let dbSizeBytes = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSizeBytes = stats.size;
    } catch {
      // ignore
    }

    return {
      initialized: this._initialized,
      docs_dir: this.config!.docs_dir,
      total_documents: docCount,
      total_sections: sectionCount,
      total_links: linkCounts.total,
      resolved_links: linkCounts.resolved,
      unresolved_links: linkCounts.dangling,
      embedding_progress: {
        completed: sectionsWithEmbedding,
        total: sectionCount,
        model: this.config!.embedding.model,
      },
      stale_documents: staleSummary.stale,
      db_size_bytes: dbSizeBytes,
    };
  }

  async getStaleDocuments(options?: StaleOptions): Promise<StaleOutput> {
    this.ensureInitialized();

    // Re-check all source_ref hashes against current file state
    const staleDocs = await this.stalenessDetector!.getStaleDocuments();

    return {
      stale_documents: staleDocs,
      total: staleDocs.length,
    };
  }

  suggestLinks(options?: SharedSuggestLinksOptions): SuggestLinksOutput {
    this.ensureInitialized();

    const suggestions = this.suggestLinksEngine!.suggest(options);

    return {
      suggestions,
      total: suggestions.length,
    };
  }

  // --- Process lifecycle ---

  acquireLock(): { acquired: boolean; existingPid?: number } {
    const lockPath = path.join(resolveUbpDir(this.cwd), 'serve.lock');

    try {
      if (fs.existsSync(lockPath)) {
        const content = fs.readFileSync(lockPath, 'utf-8').trim();
        const pid = parseInt(content, 10);

        // Check if process is still running
        try {
          process.kill(pid, 0);
          return { acquired: false, existingPid: pid };
        } catch {
          // Process not running, stale lock
          fs.unlinkSync(lockPath);
        }
      }

      fs.writeFileSync(lockPath, String(process.pid), 'utf-8');
      return { acquired: true };
    } catch {
      return { acquired: false };
    }
  }

  releaseLock(): void {
    const lockPath = path.join(resolveUbpDir(this.cwd), 'serve.lock');
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // ignore
    }
  }

  async checkAndRepairIfNeeded(): Promise<void> {
    // Currently a no-op; could add integrity checks in the future
  }

  async close(): Promise<void> {
    this.stopWatching();

    if (this.embeddingQueue) {
      await this.embeddingQueue.stop();
      this.embeddingQueue = null;
    }

    if (this.embeddingProvider) {
      await this.embeddingProvider.dispose();
      this.embeddingProvider = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    closeLogger();
    this._initialized = false;
  }

  // --- Internal helpers ---

  /**
   * Load an existing project (for use by createUbpEngine).
   */
  async loadExisting(): Promise<void> {
    this.config = loadConfig(this.cwd);
    configureLogger({ level: this.config.log.level, file: this.config.log.file });

    // Initialize database
    const dbPath = resolveDbPath(this.cwd);
    this.db = new DatabaseManager({ dbPath });
    this.db.initialize();

    // Initialize embedding provider
    this.embeddingProvider = new LocalEmbeddingProvider({
      modelName: this.config.embedding.model,
    });
    try {
      await this.embeddingProvider.initialize();
    } catch (err) {
      this.logger.warn(`Embedding provider not available: ${err instanceof Error ? err.message : String(err)}`);
      this.embeddingProvider = null;
    }

    // Initialize core modules
    this.initializeCoreModules();

    // Build link resolver index from existing documents
    const allDocs = this.db.documents.findAll();
    const filepaths = allDocs.map((d) => d.filepath);
    this.linkResolver!.buildIndex(filepaths);
    this.linkResolver!.setDocumentLookup({
      getAllFilepaths: () => this.db!.documents.findAll().map((d) => d.filepath),
      getDocIdByFilepath: (filepath: string) => {
        const doc = this.db!.documents.findByFilepath(filepath);
        return doc?.id ?? null;
      },
    });

    this._initialized = true;
  }

  private initializeCoreModules(): void {
    const db = this.db!;
    const config = this.config!;
    const docsRoot = path.resolve(this.cwd, config.docs_dir);

    // LinkResolver
    this.linkResolver = new LinkResolver();

    // EmbeddingQueue with adapters
    if (this.embeddingProvider) {
      const embeddingStoreAdapter = {
        updateEmbedding: (sectionId: number, embedding: Float32Array, model: string) => {
          const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
          db.sections.updateEmbedding(sectionId, buffer, model);
        },
      };

      const vectorIndexUpdater = {
        set: (sectionId: number, embedding: Float32Array) => {
          const section = db.sections.findById(sectionId);
          if (section) {
            db.getVectorIndex().upsert(sectionId, section.doc_id, embedding);
          }
        },
      };

      this.embeddingQueue = new EmbeddingQueue(
        this.embeddingProvider,
        embeddingStoreAdapter,
        vectorIndexUpdater,
      );
    }

    // ChangeProcessor
    this.changeProcessor = new ChangeProcessor({
      config,
      docsRoot,
      projectRoot: this.cwd,
      db,
      vectorIndex: db.getVectorIndex(),
      embeddingQueue: this.embeddingQueue ?? this.createNoopEmbeddingQueue(),
      linkResolver: this.linkResolver,
    });

    // StalenessDetector
    this.stalenessDetector = new StalenessDetector(db, config, this.cwd);

    // Search components
    const vectorSearch = new VectorSearch(db.getVectorIndex());
    const fulltextSearch = new FulltextSearch(db.fulltext);
    const graphTraversal = new GraphTraversal(db.graph);
    const graphScorer = new GraphScorer();

    if (this.embeddingProvider) {
      this.hybridSearch = new HybridSearch({
        config,
        db,
        embeddingProvider: this.embeddingProvider,
        vectorSearch,
        fulltextSearch,
        graphTraversal,
        graphScorer,
        stalenessDetector: this.stalenessDetector,
      });
    } else {
      // No embedding provider: create a hybrid search with a dummy provider
      // that will always fall back to FTS
      this.hybridSearch = new HybridSearch({
        config,
        db,
        embeddingProvider: this.createNoopEmbeddingProvider(),
        vectorSearch,
        fulltextSearch,
        graphTraversal,
        graphScorer,
        stalenessDetector: this.stalenessDetector,
      });
    }

    // SuggestLinksEngine
    this.suggestLinksEngine = new SuggestLinksEngine(db, db.getVectorIndex());
  }

  private async scanDocsDirectory(
    docsRoot: string,
    config: UbpConfig,
  ): Promise<Array<{ relativePath: string; content: string }>> {
    const files: Array<{ relativePath: string; content: string }> = [];

    if (!fs.existsSync(docsRoot)) {
      return files;
    }

    await this.walkDirectory(docsRoot, docsRoot, config, files);
    return files;
  }

  private async walkDirectory(
    dir: string,
    docsRoot: string,
    config: UbpConfig,
    results: Array<{ relativePath: string; content: string }>,
  ): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(docsRoot, fullPath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        // Check if directory is excluded using config patterns
        const dirRelative = relativePath + '/';
        const excluded =
          dirRelative.includes('node_modules/') ||
          dirRelative.includes('.git/') ||
          matchesGlobPatterns(dirRelative, config.source.exclude, []);
        if (!excluded) {
          await this.walkDirectory(fullPath, docsRoot, config, results);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (matchesGlobPatterns(relativePath, config.source.include, config.source.exclude)) {
          try {
            const content = await readFile(fullPath, 'utf-8');
            results.push({ relativePath, content });
          } catch (err) {
            this.logger.error(`Failed to read ${relativePath}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  }

  private resolveDocId(identifier: string): string {
    // Try as doc ID first
    const byId = this.db!.documents.findById(identifier);
    if (byId) return byId.id;

    // Try as filepath
    const byFilepath = this.db!.documents.findByFilepath(identifier);
    if (byFilepath) return byFilepath.id;

    throw new DocumentNotFoundError(identifier);
  }

  private ensureInitialized(): void {
    if (!this._initialized || !this.db || !this.config) {
      throw new Error('UbpEngine not initialized. Call initialize() or loadExisting() first.');
    }
  }

  private createNoopEmbeddingQueue(): EmbeddingQueue {
    // Return a queue with a noop provider that won't process anything
    const noopProvider = this.createNoopEmbeddingProvider();
    const noopStore = {
      updateEmbedding: () => {},
    };
    const noopIndexUpdater = {
      set: () => {},
    };
    return new EmbeddingQueue(noopProvider, noopStore, noopIndexUpdater);
  }

  private createNoopEmbeddingProvider(): EmbeddingProvider {
    return {
      async initialize() {},
      async embed() {
        throw new Error('Embedding provider not available');
      },
      async embedBatch() {
        throw new Error('Embedding provider not available');
      },
      getModelInfo() {
        return {
          name: 'none',
          dimensions: 0,
          maxTokens: 0,
          languages: [],
        };
      },
      async dispose() {},
    };
  }
}

export async function createUbpEngine(cwd: string): Promise<UbpEngine> {
  const engine = new UbpEngine(cwd);
  if (configExistsOnDisk(cwd)) {
    await engine.loadExisting();
  }
  return engine;
}
