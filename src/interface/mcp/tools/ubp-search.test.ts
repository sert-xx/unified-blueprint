/**
 * Tests for ubp_search MCP tool
 */

import { describe, it, expect, vi } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerSearchTool } from './ubp-search.js';
import { DocumentNotFoundError } from '../../../shared/errors.js';
import {
  createMockEngine,
  captureToolHandler,
  makeSampleSearchOutput,
} from './__test-helpers.js';

describe('ubp_search', () => {
  function setup() {
    const sampleOutput = makeSampleSearchOutput();
    const engine = createMockEngine({
      search: vi.fn().mockResolvedValue(sampleOutput),
    });
    const handler = captureToolHandler(registerSearchTool, engine);
    return { engine, handler, sampleOutput };
  }

  it('returns MCP response format { content: [{ type, text }] }', async () => {
    const { handler } = setup();

    const result = (await handler({ query: 'test' })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(typeof result.content[0]!.text).toBe('string');
    // Must be valid JSON
    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it('includes results, total_found, search_type, query_time_ms in JSON output', async () => {
    const { handler } = setup();

    const result = (await handler({ query: 'test' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed).toHaveProperty('results');
    expect(parsed).toHaveProperty('total_found', 1);
    expect(parsed).toHaveProperty('search_type', 'hybrid');
    expect(parsed).toHaveProperty('query_time_ms');
    expect(typeof parsed.query_time_ms).toBe('number');
  });

  it('maps result fields: doc_id, filepath, title, score, score_breakdown, staleness', async () => {
    const { handler } = setup();

    const result = (await handler({ query: 'test' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);
    const first = parsed.results[0];

    expect(first.doc_id).toBe('doc-1');
    expect(first.filepath).toBe('spec/architecture.md');
    expect(first.title).toBe('Architecture');
    expect(first.score).toBe(0.85);
    expect(first.score_breakdown).toEqual({
      vector_similarity: 0.7,
      graph_proximity: 0.15,
    });
    expect(first.staleness).toBe('fresh');
  });

  it('filters sections to heading, content, score only (no section_id)', async () => {
    const { handler } = setup();

    const result = (await handler({ query: 'test' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);
    const section = parsed.results[0].sections[0];

    expect(section).toEqual({
      heading: 'Overview',
      content: 'System architecture overview',
      score: 0.9,
    });
    expect(section).not.toHaveProperty('section_id');
  });

  it('passes through linked_pages from engine output', async () => {
    const { handler, sampleOutput } = setup();

    const result = (await handler({ query: 'test' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.results[0].linked_pages).toEqual(
      sampleOutput.results[0]!.linked_pages,
    );
  });

  it('throws McpError when engine.search rejects', async () => {
    const engine = createMockEngine({
      search: vi
        .fn()
        .mockRejectedValue(new DocumentNotFoundError('missing.md')),
    });
    const handler = captureToolHandler(registerSearchTool, engine);

    await expect(handler({ query: 'test' })).rejects.toBeInstanceOf(McpError);
  });

  it('forwards input parameters to engine.search', async () => {
    const { engine, handler } = setup();

    await handler({
      query: 'architecture',
      limit: 10,
      include_linked: false,
      depth: 2,
      link_types: ['references', 'depends_on'],
    });

    expect(engine.search).toHaveBeenCalledWith({
      query: 'architecture',
      limit: 10,
      include_linked: false,
      depth: 2,
      link_types: ['references', 'depends_on'],
    });
  });
});
