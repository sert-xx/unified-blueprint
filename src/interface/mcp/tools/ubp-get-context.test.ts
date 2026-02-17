/**
 * Tests for ubp_get_context MCP tool
 */

import { describe, it, expect, vi } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerGetContextTool } from './ubp-get-context.js';
import { DocumentNotFoundError } from '../../../shared/errors.js';
import { UBP_ERROR } from '../errors.js';
import {
  createMockEngine,
  captureToolHandler,
  makeSampleGetContextOutput,
} from './__test-helpers.js';

describe('ubp_get_context', () => {
  function setup() {
    const sampleOutput = makeSampleGetContextOutput();
    const engine = createMockEngine({
      getContext: vi.fn().mockReturnValue(sampleOutput),
    });
    const handler = captureToolHandler(registerGetContextTool, engine);
    return { engine, handler, sampleOutput };
  }

  it('returns MCP response format { content: [{ type, text }] }', async () => {
    const { handler } = setup();

    const result = (await handler({
      filepath: 'spec/architecture.md',
      depth: 1,
      max_size: 51200,
    })) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it('includes center, related, truncated_count, query_time_ms', async () => {
    const { handler } = setup();

    const result = (await handler({
      filepath: 'spec/architecture.md',
      depth: 1,
      max_size: 51200,
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.center).toEqual({
      doc_id: 'doc-1',
      filepath: 'spec/architecture.md',
      title: 'Architecture',
      content: 'System architecture overview',
    });
    expect(parsed.related).toHaveLength(1);
    expect(parsed.truncated_count).toBe(0);
    expect(typeof parsed.query_time_ms).toBe('number');
  });

  it('forwards filepath, depth, max_size to engine.getContext', async () => {
    const { engine, handler } = setup();

    await handler({
      filepath: 'design/data-model.md',
      depth: 3,
      max_size: 10000,
    });

    expect(engine.getContext).toHaveBeenCalledWith({
      filepath: 'design/data-model.md',
      depth: 3,
      max_size: 10000,
    });
  });

  it('throws McpError with PAGE_NOT_FOUND for DocumentNotFoundError', async () => {
    const engine = createMockEngine({
      getContext: vi.fn().mockImplementation(() => {
        throw new DocumentNotFoundError('spec/missing.md');
      }),
    });
    const handler = captureToolHandler(registerGetContextTool, engine);

    try {
      await handler({
        filepath: 'spec/missing.md',
        depth: 1,
        max_size: 51200,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(UBP_ERROR.PAGE_NOT_FOUND);
    }
  });
});
