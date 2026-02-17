/**
 * Tests for ubp_get_page MCP tool
 */

import { describe, it, expect, vi } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerGetPageTool } from './ubp-get-page.js';
import { DocumentNotFoundError } from '../../../shared/errors.js';
import { UBP_ERROR } from '../errors.js';
import {
  createMockEngine,
  captureToolHandler,
  makeSampleGetPageOutput,
} from './__test-helpers.js';

describe('ubp_get_page', () => {
  function setup() {
    const sampleOutput = makeSampleGetPageOutput();
    const engine = createMockEngine({
      getPage: vi.fn().mockReturnValue(sampleOutput),
    });
    const handler = captureToolHandler(registerGetPageTool, engine);
    return { engine, handler, sampleOutput };
  }

  it('returns MCP response format { content: [{ type, text }] }', async () => {
    const { handler } = setup();

    const result = (await handler({ filepath: 'spec/architecture.md' })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it('maps all GetPageOutput fields plus query_time_ms', async () => {
    const { handler } = setup();

    const result = (await handler({ filepath: 'spec/architecture.md' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.doc_id).toBe('doc-1');
    expect(parsed.filepath).toBe('spec/architecture.md');
    expect(parsed.title).toBe('Architecture');
    expect(parsed.doc_type).toBe('spec');
    expect(parsed.content).toContain('architecture overview');
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.outlinks).toHaveLength(1);
    expect(parsed.backlinks).toHaveLength(0);
    expect(parsed.staleness).toBe('fresh');
    expect(parsed.stale_refs).toEqual([]);
    expect(parsed.updated_at).toBe('2025-01-01T00:00:00Z');
    expect(typeof parsed.query_time_ms).toBe('number');
  });

  it('forwards filepath to engine.getPage', async () => {
    const { engine, handler } = setup();

    await handler({ filepath: 'design/data-model.md' });

    expect(engine.getPage).toHaveBeenCalledWith({
      filepath: 'design/data-model.md',
    });
  });

  it('throws McpError with PAGE_NOT_FOUND for DocumentNotFoundError', async () => {
    const engine = createMockEngine({
      getPage: vi.fn().mockImplementation(() => {
        throw new DocumentNotFoundError('spec/missing.md');
      }),
    });
    const handler = captureToolHandler(registerGetPageTool, engine);

    try {
      await handler({ filepath: 'spec/missing.md' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(UBP_ERROR.PAGE_NOT_FOUND);
    }
  });
});
