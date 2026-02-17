/**
 * Tests for ubp_list_pages MCP tool
 */

import { describe, it, expect, vi } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerListPagesTool } from './ubp-list-pages.js';
import { DatabaseError } from '../../../shared/errors.js';
import { UBP_ERROR } from '../errors.js';
import {
  createMockEngine,
  captureToolHandler,
  makeSampleListPagesOutput,
} from './__test-helpers.js';

describe('ubp_list_pages', () => {
  function setup() {
    const sampleOutput = makeSampleListPagesOutput();
    const engine = createMockEngine({
      listPages: vi.fn().mockReturnValue(sampleOutput),
    });
    const handler = captureToolHandler(registerListPagesTool, engine);
    return { engine, handler, sampleOutput };
  }

  it('returns MCP response format { content: [{ type, text }] }', async () => {
    const { handler } = setup();

    const result = (await handler({
      sort: 'title',
      order: 'asc',
    })) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it('includes pages, total, query_time_ms', async () => {
    const { handler } = setup();

    const result = (await handler({
      sort: 'title',
      order: 'asc',
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.pages).toHaveLength(2);
    expect(parsed.total).toBe(2);
    expect(typeof parsed.query_time_ms).toBe('number');

    expect(parsed.pages[0].doc_id).toBe('doc-1');
    expect(parsed.pages[0].doc_type).toBe('spec');
    expect(parsed.pages[1].doc_id).toBe('doc-2');
  });

  it('forwards doc_type, sort, order to engine.listPages', async () => {
    const { engine, handler } = setup();

    await handler({ doc_type: 'design', sort: 'updated_at', order: 'desc' });

    expect(engine.listPages).toHaveBeenCalledWith({
      doc_type: 'design',
      sort: 'updated_at',
      order: 'desc',
    });
  });

  it('throws McpError with DATABASE_ERROR for DatabaseError', async () => {
    const engine = createMockEngine({
      listPages: vi.fn().mockImplementation(() => {
        throw new DatabaseError('connection lost');
      }),
    });
    const handler = captureToolHandler(registerListPagesTool, engine);

    try {
      await handler({ sort: 'title', order: 'asc' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(UBP_ERROR.DATABASE_ERROR);
    }
  });
});
