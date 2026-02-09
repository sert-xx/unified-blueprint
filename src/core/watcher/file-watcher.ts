/**
 * File watcher using chokidar
 * Monitors the docs directory for Markdown file changes.
 */

import chokidar from 'chokidar';
import * as path from 'node:path';
import type { FileChangeEvent } from '../../shared/types.js';
import type { UbpConfig } from '../../config/types.js';
import { Debouncer } from './debouncer.js';
import { createLogger, type Logger } from '../../shared/logger.js';

export interface FileWatcherOptions {
  docsRoot: string;
  config: UbpConfig;
  onFileChange: (event: FileChangeEvent) => Promise<void>;
}

export class FileWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private readonly debouncer: Debouncer;
  private readonly docsRoot: string;
  private readonly config: UbpConfig;
  private readonly onFileChange: (event: FileChangeEvent) => Promise<void>;
  private readonly logger: Logger;
  private ready = false;

  constructor(options: FileWatcherOptions) {
    this.docsRoot = options.docsRoot;
    this.config = options.config;
    this.onFileChange = options.onFileChange;
    this.debouncer = new Debouncer(500);
    this.logger = createLogger('FileWatcher');
  }

  start(): void {
    if (this.watcher) return;

    const watchPatterns = this.config.source.include.map(
      (p) => path.join(this.docsRoot, p),
    );

    this.watcher = chokidar.watch(watchPatterns, {
      ignored: this.config.source.exclude,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher
      .on('add', (filePath) => this.handleEvent('add', filePath))
      .on('change', (filePath) => this.handleEvent('change', filePath))
      .on('unlink', (filePath) => this.handleEvent('unlink', filePath))
      .on('error', (error) => {
        this.logger.error('Watch error:', String(error));
      })
      .on('ready', () => {
        this.ready = true;
        this.logger.info('File watcher ready');
      });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.debouncer.clear();
    this.ready = false;
  }

  get isReady(): boolean {
    return this.ready;
  }

  private handleEvent(type: FileChangeEvent['type'], absolutePath: string): void {
    const filepath = path.relative(this.docsRoot, absolutePath).split(path.sep).join('/');

    // Path traversal check
    if (filepath.startsWith('..') || path.isAbsolute(filepath)) {
      this.logger.warn(`Ignoring path outside docs root: ${filepath}`);
      return;
    }

    this.debouncer.debounce(filepath, () => {
      const event: FileChangeEvent = { type, filepath };
      this.onFileChange(event).catch((err) => {
        this.logger.error(`Error processing ${type} event for ${filepath}:`, String(err));
      });
    });
  }
}
