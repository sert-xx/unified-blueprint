/**
 * ChangeProcessor
 * Handles file change events: parse -> DB update -> embedding queue
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import type { FileChangeEvent } from '../../shared/types.js';
import type { UbpConfig } from '../../config/types.js';
import type { DatabaseManager } from '../../data/database-manager.js';
import type { VectorIndex } from '../../data/vector-index.js';
import type { DataDocType, DataLinkType, LinkInsert } from '../../data/types.js';
import type { EmbeddingQueue, EmbeddingJob } from '../embedding/embedding-queue.js';
import type { LinkResolver } from '../linker/link-resolver.js';
import { parseMarkdown } from '../parser/markdown-parser.js';
import { hashString } from '../../shared/hash.js';
import { validateAndNormalizePath } from '../../shared/path-utils.js';
import { createLogger, type Logger } from '../../shared/logger.js';

const VALID_DOC_TYPES: Set<string> = new Set([
  'spec', 'design', 'db-schema', 'api', 'config', 'guide',
]);

export interface ChangeProcessorDeps {
  config: UbpConfig;
  docsRoot: string;
  projectRoot: string;
  db: DatabaseManager;
  vectorIndex: VectorIndex;
  embeddingQueue: EmbeddingQueue;
  linkResolver: LinkResolver;
}

export class ChangeProcessor {
  private readonly config: UbpConfig;
  private readonly docsRoot: string;
  private readonly projectRoot: string;
  private readonly db: DatabaseManager;
  private readonly vectorIndex: VectorIndex;
  private readonly embeddingQueue: EmbeddingQueue;
  private readonly linkResolver: LinkResolver;
  private readonly logger: Logger;

  constructor(deps: ChangeProcessorDeps) {
    this.config = deps.config;
    this.docsRoot = deps.docsRoot;
    this.projectRoot = deps.projectRoot;
    this.db = deps.db;
    this.vectorIndex = deps.vectorIndex;
    this.embeddingQueue = deps.embeddingQueue;
    this.linkResolver = deps.linkResolver;
    this.logger = createLogger('ChangeProcessor');
  }

  async processChange(event: FileChangeEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'add':
        case 'change':
          await this.processAddOrChange(event);
          break;
        case 'unlink':
          this.processUnlink(event);
          break;
      }
    } catch (err) {
      this.logger.error(
        `Error processing ${event.type} for ${event.filepath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Process a single file: parse, update DB, queue embeddings.
   * Used by both watcher events and initialization/reindex.
   */
  async processFile(
    filepath: string,
    content: string,
    options?: { forceUpdate?: boolean },
  ): Promise<{
    docId: string;
    sectionsCreated: number;
    linksResolved: number;
    linksDangling: number;
    embeddingsQueued: number;
    skipped: boolean;
  }> {
    const bodyHash = hashString(content);

    // Check existing record
    const existing = this.db.documents.findByFilepath(filepath);

    if (!options?.forceUpdate && existing && existing.body_hash === bodyHash) {
      return {
        docId: existing.id,
        sectionsCreated: 0,
        linksResolved: 0,
        linksDangling: 0,
        embeddingsQueued: 0,
        skipped: true,
      };
    }

    // Parse
    const parseResult = parseMarkdown(content, filepath);

    const docId = existing?.id ?? uuidv7();
    const rawType = parseResult.frontmatter.doc_type ?? 'guide';
    const docType = (VALID_DOC_TYPES.has(rawType) ? rawType : 'guide') as DataDocType;

    // Upsert document
    this.db.documents.upsert({
      id: docId,
      filepath,
      title: parseResult.title,
      doc_type: docType,
      body_hash: bodyHash,
    });

    // Replace sections
    const sectionInserts = parseResult.sections.map((s) => ({
      doc_id: docId,
      heading: s.heading,
      section_order: s.order,
      content: s.content,
      content_hash: hashString(s.content),
      token_count: null,
    }));

    this.db.sections.replaceByDocId(docId, sectionInserts);

    // Get the inserted section IDs for link mapping
    const insertedSections = this.db.sections.findByDocId(docId);
    const sectionIdMap = new Map<number, number>();
    for (const sec of insertedSections) {
      sectionIdMap.set(sec.section_order, sec.id);
    }

    // Resolve links and insert at once
    const resolvedLinks = this.resolveAndBuildLinks(
      docId,
      filepath,
      parseResult.links,
      sectionIdMap,
    );

    this.db.links.replaceBySourceDocId(docId, resolvedLinks.linkInserts);

    // Update source_refs state
    if (parseResult.frontmatter.source_refs && parseResult.frontmatter.source_refs.length > 0) {
      const refs = await this.computeSourceRefHashes(parseResult.frontmatter.source_refs);
      this.db.sourceRefs.syncByDocId(docId, refs);
    } else {
      this.db.sourceRefs.syncByDocId(docId, []);
    }

    // Queue embeddings only for sections that need them (new or changed content)
    const embeddingJobs: EmbeddingJob[] = insertedSections
      .filter((sec) => sec.embedding === null)
      .map((sec) => ({
        sectionId: sec.id,
        docId,
        content: sec.content,
        heading: sec.heading,
      }));

    if (embeddingJobs.length > 0) {
      this.embeddingQueue.enqueue(embeddingJobs);
    }

    return {
      docId,
      sectionsCreated: insertedSections.length,
      linksResolved: resolvedLinks.resolved,
      linksDangling: resolvedLinks.dangling,
      embeddingsQueued: embeddingJobs.length,
      skipped: false,
    };
  }

  private async processAddOrChange(event: FileChangeEvent): Promise<void> {
    const absolutePath = path.join(this.docsRoot, event.filepath);
    const content = await readFile(absolutePath, 'utf-8');

    if (event.type === 'add') {
      this.linkResolver.addFile(event.filepath);
    }

    const result = await this.processFile(event.filepath, content);

    if (result.skipped) {
      this.logger.debug(`Skipped ${event.filepath} (unchanged)`);
    } else {
      this.logger.info(
        `Processed ${event.filepath}: ${result.sectionsCreated} sections, ${result.linksResolved} resolved links, ${result.embeddingsQueued} embeddings queued`,
      );

      // Try to resolve dangling links that might now point to this doc
      const doc = this.db.documents.findByFilepath(event.filepath);
      if (doc) {
        this.db.links.resolveDangling(doc.title, doc.id);
        // Also try by filename without extension
        const basename = event.filepath.split('/').pop()?.replace(/\.md$/, '');
        if (basename && basename !== doc.title) {
          this.db.links.resolveDangling(basename, doc.id);
        }
      }
    }
  }

  private processUnlink(event: FileChangeEvent): void {
    const existing = this.db.documents.findByFilepath(event.filepath);
    if (!existing) return;

    // Remove from vector index
    this.vectorIndex.removeByDocId(existing.id);

    // Remove from link resolver index
    this.linkResolver.removeFile(event.filepath);

    // Delete document (CASCADE handles sections, links)
    this.db.documents.deleteById(existing.id);

    this.logger.info(`Removed ${event.filepath}`);
  }

  private resolveAndBuildLinks(
    docId: string,
    sourceFilepath: string,
    links: Array<{ target: string; type: string; context: string; sectionOrder: number }>,
    sectionIdMap: Map<number, number>,
  ): {
    linkInserts: LinkInsert[];
    resolved: number;
    dangling: number;
  } {
    let resolved = 0;
    let dangling = 0;
    const linkInserts: LinkInsert[] = [];

    for (const link of links) {
      const resolution = this.linkResolver.resolve(link.target, sourceFilepath);

      if (resolution.status === 'resolved') {
        resolved++;
      } else {
        dangling++;
      }

      linkInserts.push({
        source_doc_id: docId,
        target_doc_id: resolution.targetDocId,
        type: link.type as DataLinkType,
        context: link.context || null,
        source_section_id: sectionIdMap.get(link.sectionOrder) ?? null,
        target_title: link.target,
      });
    }

    // 解決後の重複排除（同じ target_doc_id + type のリンクは最初のものを優先）
    const seen = new Set<string>();
    const dedupedInserts = linkInserts.filter((link) => {
      const key = `${link.target_doc_id ?? ''}::${link.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { linkInserts: dedupedInserts, resolved, dangling };
  }

  private async computeSourceRefHashes(
    sourceRefs: string[],
  ): Promise<Array<{ filePath: string; hash: string }>> {
    const results: Array<{ filePath: string; hash: string }> = [];

    for (const ref of sourceRefs) {
      try {
        // Validate path stays within project root to prevent path traversal
        validateAndNormalizePath(ref, this.projectRoot);
        const absolutePath = path.resolve(this.projectRoot, ref);
        const content = await readFile(absolutePath, 'utf-8');
        const hash = hashString(content);
        results.push({ filePath: ref, hash });
      } catch (err) {
        if (err instanceof Error && err.message.includes('Path traversal')) {
          this.logger.warn(`Skipping source_ref with path traversal: ${ref}`);
          continue;
        }
        // File not found or not readable, store with empty hash
        results.push({ filePath: ref, hash: '' });
      }
    }

    return results;
  }
}
