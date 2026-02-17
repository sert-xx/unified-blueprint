/**
 * Tests for ubp_get_graph MCP tool
 */

import { describe, it, expect, vi } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerGetGraphTool } from './ubp-get-graph.js';
import { DocumentNotFoundError } from '../../../shared/errors.js';
import { UBP_ERROR } from '../errors.js';
import {
  createMockEngine,
  captureToolHandler,
  makeSampleGetGraphOutput,
} from './__test-helpers.js';

describe('ubp_get_graph', () => {
  function setup() {
    const sampleOutput = makeSampleGetGraphOutput();
    const engine = createMockEngine({
      getGraph: vi.fn().mockReturnValue(sampleOutput),
    });
    const handler = captureToolHandler(registerGetGraphTool, engine);
    return { engine, handler, sampleOutput };
  }

  it('returns MCP response format { content: [{ type, text }] }', async () => {
    const { handler } = setup();

    const result = (await handler({ depth: 2 })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it('includes nodes, edges, query_time_ms', async () => {
    const { handler } = setup();

    const result = (await handler({ depth: 2 })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(typeof parsed.query_time_ms).toBe('number');

    expect(parsed.nodes[0].id).toBe('doc-1');
    expect(parsed.nodes[0].filepath).toBe('spec/architecture.md');
    expect(parsed.edges[0].source).toBe('doc-1');
    expect(parsed.edges[0].target).toBe('doc-2');
    expect(parsed.edges[0].type).toBe('references');
  });

  it('forwards center and depth to engine.getGraph', async () => {
    const { engine, handler } = setup();

    await handler({ center: 'spec/architecture.md', depth: 3 });

    expect(engine.getGraph).toHaveBeenCalledWith({
      center: 'spec/architecture.md',
      depth: 3,
    });
  });

  it('passes undefined center for full graph mode', async () => {
    const { engine, handler } = setup();

    await handler({ depth: 2 });

    expect(engine.getGraph).toHaveBeenCalledWith({
      center: undefined,
      depth: 2,
    });
  });

  it('throws McpError with PAGE_NOT_FOUND for DocumentNotFoundError', async () => {
    const engine = createMockEngine({
      getGraph: vi.fn().mockImplementation(() => {
        throw new DocumentNotFoundError('spec/missing.md');
      }),
    });
    const handler = captureToolHandler(registerGetGraphTool, engine);

    try {
      await handler({ center: 'spec/missing.md', depth: 2 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(UBP_ERROR.PAGE_NOT_FOUND);
    }
  });
});
