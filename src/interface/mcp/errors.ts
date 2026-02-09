/**
 * MCP error code definitions and error conversion
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  DocumentNotFoundError,
  IndexNotReadyError,
  DatabaseError,
  UbpError,
} from '../../shared/errors.js';

export const UBP_ERROR = {
  PAGE_NOT_FOUND: -32001,
  INDEX_NOT_READY: -32002,
  DATABASE_ERROR: -32003,
} as const;

export function toMcpError(error: unknown): McpError {
  if (error instanceof DocumentNotFoundError) {
    return new McpError(
      UBP_ERROR.PAGE_NOT_FOUND as ErrorCode,
      `Page not found: ${error.message}`,
    );
  }

  if (error instanceof IndexNotReadyError) {
    return new McpError(
      UBP_ERROR.INDEX_NOT_READY as ErrorCode,
      'Index is still building. FTS5 fallback results are available via ubp_fulltext_search.',
    );
  }

  if (error instanceof DatabaseError) {
    return new McpError(
      UBP_ERROR.DATABASE_ERROR as ErrorCode,
      `Database error: ${error.message}`,
    );
  }

  if (error instanceof UbpError) {
    return new McpError(
      ErrorCode.InternalError,
      error.message,
    );
  }

  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : 'Unknown error',
  );
}
