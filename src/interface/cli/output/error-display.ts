/**
 * 3-layer error display: Error / Cause / Hint
 */

import pc from 'picocolors';
import { formatError, formatHint } from './formatter.js';
import { printJsonError } from './json-output.js';
import type { GlobalOptions } from '../utils/global-options.js';
import { UbpError } from '../../../shared/errors.js';

export interface ErrorDisplay {
  message: string;
  cause?: string;
  hint?: string;
  stack?: string;
}

export function toErrorDisplay(error: unknown): ErrorDisplay {
  if (error instanceof UbpError) {
    return {
      message: error.message,
      cause: error.cause?.message,
      hint: getHintForCode(error.code),
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function getHintForCode(code: string): string | undefined {
  switch (code) {
    case 'CONFIG_ERROR':
      return "Check your .ubp/config.json file.";
    case 'DATABASE_ERROR':
      return "Run 'ubp reindex' to rebuild the database.";
    case 'PARSE_ERROR':
      return 'Check the file for syntax errors.';
    case 'EMBEDDING_ERROR':
      return "Run 'ubp init' to download the embedding model.";
    case 'DOCUMENT_NOT_FOUND':
      return 'Check the filepath or document title.';
    case 'INDEX_NOT_READY':
      return "Falling back to full-text search. Run 'ubp reindex' to rebuild embeddings.";
    default:
      return undefined;
  }
}

export function renderError(
  error: ErrorDisplay,
  globals: GlobalOptions,
): void {
  if (globals.json) {
    printJsonError({
      message: error.message,
      cause: error.cause,
      hint: error.hint,
    });
    return;
  }

  const lines: string[] = [];
  lines.push(formatError(error.message));

  if (error.cause) {
    lines.push(`  Cause: ${error.cause}`);
  }

  if (error.hint) {
    lines.push(`  ${formatHint(error.hint)}`);
  }

  if (globals.verbose && error.stack) {
    lines.push('');
    lines.push(pc.dim(error.stack));
  }

  process.stderr.write(lines.join('\n') + '\n');
}

export function exitWithError(
  error: ErrorDisplay,
  globals: GlobalOptions,
): never {
  renderError(error, globals);
  process.exit(1);
}

export function handleCommandError(error: unknown, globals: GlobalOptions): never {
  const display = toErrorDisplay(error);
  exitWithError(display, globals);
}
