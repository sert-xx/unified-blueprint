/**
 * UBP カスタムエラー階層
 */

export class UbpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'UbpError';
  }
}

// --- Config ---

export class ConfigError extends UbpError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

export class ConfigNotFoundError extends ConfigError {
  constructor(path: string) {
    super(`Configuration not found: ${path}. Run 'ubp init' first.`);
    this.name = 'ConfigNotFoundError';
  }
}

// --- Database ---

export class DatabaseError extends UbpError {
  constructor(message: string, cause?: Error) {
    super(message, 'DATABASE_ERROR', cause);
    this.name = 'DatabaseError';
  }
}

export class MigrationError extends DatabaseError {
  constructor(version: number, cause?: Error) {
    super(`Migration to version ${version} failed`, cause);
    this.name = 'MigrationError';
  }
}

// --- Parse ---

export class ParseError extends UbpError {
  constructor(
    message: string,
    public readonly filepath: string,
    cause?: Error,
  ) {
    super(`Parse error in ${filepath}: ${message}`, 'PARSE_ERROR', cause);
    this.name = 'ParseError';
  }
}

// --- Link ---

export class LinkResolutionError extends UbpError {
  constructor(target: string, source: string) {
    super(
      `Cannot resolve link [[${target}]] in ${source}`,
      'LINK_RESOLUTION_ERROR',
    );
    this.name = 'LinkResolutionError';
  }
}

// --- Embedding ---

export class EmbeddingError extends UbpError {
  constructor(message: string, cause?: Error) {
    super(message, 'EMBEDDING_ERROR', cause);
    this.name = 'EmbeddingError';
  }
}

export class EmbeddingModelNotAvailableError extends EmbeddingError {
  constructor(model: string, cause?: Error) {
    super(`Embedding model not available: ${model}`, cause);
    this.name = 'EmbeddingModelNotAvailableError';
  }
}

// --- Document ---

export class DocumentNotFoundError extends UbpError {
  constructor(identifier: string) {
    super(`Document not found: ${identifier}`, 'DOCUMENT_NOT_FOUND');
    this.name = 'DocumentNotFoundError';
  }
}

// --- Index ---

export class IndexNotReadyError extends UbpError {
  constructor() {
    super(
      'Index is not ready. Embedding generation is in progress.',
      'INDEX_NOT_READY',
    );
    this.name = 'IndexNotReadyError';
  }
}
