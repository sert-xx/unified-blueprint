/**
 * Tests for ubp_fulltext_search MCP tool
 */

import { describe, it, expect, vi } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerFulltextSearchTool } from './ubp-fulltext-search.js';
import { DatabaseError } from '../../../shared/errors.js';
import { UBP_ERROR } from '../errors.js';
import {
  createMockEngine,
  captureToolHandler,
  makeSampleFulltextSearchOutput,
} from './__test-helpers.js';

describe('ubp_fulltext_search', () => {
  function setup() {
    const sampleOutput = makeSampleFulltextSearchOutput();
    const engine = createMockEngine({
      fulltextSearch: vi.fn().mockResolvedValue(sampleOutput),
    });
    const handler = captureToolHandler(registerFulltextSearchTool, engine);
    return { engine, handler, sampleOutput };
  }

  it('returns MCP response format { content: [{ type, text }] }', async () => {
    const { handler } = setup();

    const result = (await handler({ query: 'architecture' })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it('includes results, total_found, query_time_ms', async () => {
    const { handler } = setup();

    const result = (await handler({ query: 'architecture' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.results).toHaveLength(1);
    expect(parsed.total_found).toBe(1);
    expect(typeof parsed.query_time_ms).toBe('number');

    const first = parsed.results[0];
    expect(first.doc_id).toBe('doc-1');
    expect(first.filepath).toBe('spec/architecture.md');
    expect(first.title).toBe('Architecture');
    expect(first.snippet).toContain('architecture overview');
    expect(first.rank).toBe(1);
  });

  it('forwards query, limit, doc_type to engine.fulltextSearch', async () => {
    const { engine, handler } = setup();

    await handler({ query: 'API endpoint', limit: 20, doc_type: 'api' });

    expect(engine.fulltextSearch).toHaveBeenCalledWith({
      query: 'API endpoint',
      limit: 20,
      doc_type: 'api',
    });
  });

  it('throws McpError with DATABASE_ERROR for DatabaseError', async () => {
    const engine = createMockEngine({
      fulltextSearch: vi
        .fn()
        .mockRejectedValue(new DatabaseError('FTS5 index corrupted')),
    });
    const handler = captureToolHandler(registerFulltextSearchTool, engine);

    try {
      await handler({ query: 'test' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(UBP_ERROR.DATABASE_ERROR);
    }
  });
});
