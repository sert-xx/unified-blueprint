/**
 * Staleness Detector
 * Tracks source_refs hashes and determines freshness level.
 *
 * 4-level staleness:
 *   fresh          - all source_refs match their last known hashes
 *   possibly_stale - no source_refs defined (untracked)
 *   stale          - at least one source_ref hash has changed
 *   untracked      - source_refs present but files not found
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { StalenessLevel, StaleDocInfo, StaleRefInfo } from '../../shared/types.js';
import type { UbpConfig } from '../../config/types.js';
import type { DatabaseManager } from '../../data/database-manager.js';
import { hashString } from '../../shared/hash.js';
import { createLogger, type Logger } from '../../shared/logger.js';

export class StalenessDetector {
  private readonly db: DatabaseManager;
  private readonly config: UbpConfig;
  private readonly projectRoot: string;
  private readonly logger: Logger;

  constructor(db: DatabaseManager, config: UbpConfig, projectRoot: string) {
    this.db = db;
    this.config = config;
    this.projectRoot = projectRoot;
    this.logger = createLogger('StalenessDetector');
  }

  /**
   * Determine the staleness level for a document.
   */
  getStaleness(docId: string): StalenessLevel {
    const refs = this.db.sourceRefs.findByDocId(docId);

    if (refs.length === 0) {
      return 'fresh'; // No source_refs, nothing to track
    }

    let hasStale = false;
    let hasUntracked = false;

    for (const ref of refs) {
      if (ref.is_stale === 1) {
        if (!ref.last_synced_hash) {
          hasUntracked = true;
        } else {
          hasStale = true;
        }
      }
    }

    if (hasStale) return 'stale';
    if (hasUntracked) return 'untracked';
    return 'fresh';
  }

  /**
   * Check all source_refs against current file hashes and update staleness.
   */
  async checkAll(): Promise<void> {
    const allDocs = this.db.documents.findAll();

    for (const doc of allDocs) {
      const refs = this.db.sourceRefs.findByDocId(doc.id);

      for (const ref of refs) {
        try {
          const absolutePath = path.resolve(this.projectRoot, ref.file_path);
          const content = await readFile(absolutePath, 'utf-8');
          const currentHash = hashString(content);
          this.db.sourceRefs.updateStaleness(ref.file_path, currentHash);
        } catch {
          // File not found - mark as stale
          this.db.sourceRefs.updateStaleness(ref.file_path, '__NOT_FOUND__');
        }
      }
    }
  }

  /**
   * Get all stale documents.
   */
  async getStaleDocuments(): Promise<StaleDocInfo[]> {
    await this.checkAll();

    const staleRefs = this.db.sourceRefs.findStale();

    // Group by document
    const docMap = new Map<
      string,
      {
        doc_id: string;
        filepath: string;
        title: string;
        refs: StaleRefInfo[];
      }
    >();

    for (const ref of staleRefs) {
      let entry = docMap.get(ref.doc_id);
      if (!entry) {
        entry = {
          doc_id: ref.doc_id,
          filepath: ref.doc_filepath,
          title: ref.doc_title,
          refs: [],
        };
        docMap.set(ref.doc_id, entry);
      }

      let reason: StaleRefInfo['reason'] = 'modified';
      if (!ref.last_synced_hash) {
        reason = 'not_found';
      } else {
        // Check if file exists
        try {
          const absolutePath = path.resolve(this.projectRoot, ref.file_path);
          await readFile(absolutePath, 'utf-8');
          reason = 'modified';
        } catch {
          reason = 'deleted';
        }
      }

      entry.refs.push({
        source_path: ref.file_path,
        reason,
      });
    }

    return Array.from(docMap.values()).map((entry) => ({
      doc_id: entry.doc_id,
      filepath: entry.filepath,
      title: entry.title,
      staleness: this.getStaleness(entry.doc_id),
      stale_refs: entry.refs,
    }));
  }

  /**
   * Get stale source_ref paths for a specific document.
   */
  getStaleRefs(docId: string): string[] {
    const refs = this.db.sourceRefs.findByDocId(docId);
    return refs.filter((r) => r.is_stale === 1).map((r) => r.file_path);
  }
}
