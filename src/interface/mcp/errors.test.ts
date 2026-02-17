/**
 * Tests for MCP error mapper (toMcpError)
 */

import { describe, it, expect } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { toMcpError, UBP_ERROR } from './errors.js';
import {
  DocumentNotFoundError,
  IndexNotReadyError,
  DatabaseError,
  UbpError,
} from '../../shared/errors.js';

describe('toMcpError', () => {
  it('converts DocumentNotFoundError to PAGE_NOT_FOUND (-32001)', () => {
    const error = new DocumentNotFoundError('spec/missing.md');
    const result = toMcpError(error);

    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(UBP_ERROR.PAGE_NOT_FOUND);
    expect(result.message).toContain('Page not found');
    expect(result.message).toContain('spec/missing.md');
  });

  it('converts IndexNotReadyError to INDEX_NOT_READY (-32002) with FTS fallback hint', () => {
    const error = new IndexNotReadyError();
    const result = toMcpError(error);

    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(UBP_ERROR.INDEX_NOT_READY);
    expect(result.message).toContain('Index is still building');
    expect(result.message).toContain('ubp_fulltext_search');
  });

  it('converts DatabaseError to DATABASE_ERROR (-32003)', () => {
    const error = new DatabaseError('connection timeout');
    const result = toMcpError(error);

    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(UBP_ERROR.DATABASE_ERROR);
    expect(result.message).toContain('Database error');
    expect(result.message).toContain('connection timeout');
  });

  it('converts generic UbpError to InternalError', () => {
    const error = new UbpError('something went wrong', 'UNKNOWN');
    const result = toMcpError(error);

    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(ErrorCode.InternalError);
    expect(result.message).toContain('something went wrong');
  });

  it('converts non-UBP Error to InternalError with error.message', () => {
    const error = new TypeError('Cannot read properties of null');
    const result = toMcpError(error);

    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(ErrorCode.InternalError);
    expect(result.message).toContain('Cannot read properties of null');
  });

  it('converts non-Error values to InternalError with "Unknown error"', () => {
    const result = toMcpError('string error');

    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(ErrorCode.InternalError);
    expect(result.message).toContain('Unknown error');
  });

  it('always returns McpError instances', () => {
    const inputs: unknown[] = [
      new DocumentNotFoundError('x'),
      new IndexNotReadyError(),
      new DatabaseError('x'),
      new UbpError('x', 'X'),
      new Error('x'),
      'string',
      42,
      null,
      undefined,
    ];

    for (const input of inputs) {
      expect(toMcpError(input)).toBeInstanceOf(McpError);
    }
  });
});
