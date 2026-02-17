/**
 * Shared test helpers for MCP tool tests
 */

import { vi } from 'vitest';
import type { UbpEngine } from '../../../core/engine.js';
import type {
  SearchOutput,
  FulltextSearchOutput,
  GetPageOutput,
  GetContextOutput,
  ListPagesOutput,
  GetGraphOutput,
} from '../../../shared/types.js';

/**
 * Create a mock UbpEngine with all methods as vi.fn()
 */
export function createMockEngine(
  overrides?: Partial<Record<keyof UbpEngine, unknown>>,
): UbpEngine {
  const engine = {
    search: vi.fn(),
    fulltextSearch: vi.fn(),
    getPage: vi.fn(),
    getContext: vi.fn(),
    listPages: vi.fn(),
    getGraph: vi.fn(),
    getStatus: vi.fn(),
    getStaleDocuments: vi.fn(),
    suggestLinks: vi.fn(),
    initialize: vi.fn(),
    reindex: vi.fn(),
    close: vi.fn(),
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
    loadExisting: vi.fn(),
    configExists: vi.fn(),
    cleanConfig: vi.fn(),
    createProjectStructure: vi.fn(),
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    checkAndRepairIfNeeded: vi.fn(),
    ...overrides,
  } as unknown as UbpEngine;

  return engine;
}

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

/**
 * Capture a tool handler registered via server.tool().
 *
 * Creates a mock McpServer, calls the register function, and returns
 * the async handler callback for direct invocation in tests.
 */
export function captureToolHandler(
  registerFn: (server: unknown, engine: UbpEngine) => void,
  engine: UbpEngine,
): ToolHandler {
  let captured: ToolHandler | null = null;

  const mockServer = {
    tool: (
      _name: string,
      _descriptionOrSchema: unknown,
      schemaOrHandler: unknown,
      handler?: unknown,
    ) => {
      // server.tool() has two overloads:
      //   server.tool(name, description, schema, handler)
      //   server.tool(name, schema, handler)
      if (typeof handler === 'function') {
        captured = handler as ToolHandler;
      } else if (typeof schemaOrHandler === 'function') {
        captured = schemaOrHandler as ToolHandler;
      }
    },
  };

  registerFn(mockServer as unknown, engine);

  if (!captured) {
    throw new Error('Tool handler was not registered');
  }

  return captured;
}

// --- Sample response factories ---

export function makeSampleSearchOutput(): SearchOutput {
  return {
    results: [
      {
        doc_id: 'doc-1',
        filepath: 'spec/architecture.md',
        title: 'Architecture',
        score: 0.85,
        score_breakdown: {
          vector_similarity: 0.7,
          graph_proximity: 0.15,
        },
        relevance_reason: 'High vector similarity',
        staleness: 'fresh' as const,
        sections: [
          {
            section_id: 1,
            heading: 'Overview',
            content: 'System architecture overview',
            score: 0.9,
          },
        ],
        linked_pages: [
          {
            doc_id: 'doc-2',
            filepath: 'spec/api.md',
            title: 'API Spec',
            link_type: 'references' as const,
            summary: 'API specification document',
          },
        ],
      },
    ],
    total_found: 1,
    search_type: 'hybrid' as const,
  };
}

export function makeSampleGetPageOutput(): GetPageOutput {
  return {
    doc_id: 'doc-1',
    filepath: 'spec/architecture.md',
    title: 'Architecture',
    doc_type: 'spec' as const,
    content: '## Overview\n\nSystem architecture overview',
    sections: [{ heading: 'Overview', content: 'System architecture overview' }],
    outlinks: [
      {
        doc_id: 'doc-2',
        filepath: 'spec/api.md',
        title: 'API Spec',
        link_type: 'references' as const,
      },
    ],
    backlinks: [],
    staleness: 'fresh' as const,
    stale_refs: [],
    updated_at: '2025-01-01T00:00:00Z',
  };
}

export function makeSampleGetContextOutput(): GetContextOutput {
  return {
    center: {
      doc_id: 'doc-1',
      filepath: 'spec/architecture.md',
      title: 'Architecture',
      content: 'System architecture overview',
    },
    related: [
      {
        doc_id: 'doc-2',
        filepath: 'spec/api.md',
        title: 'API Spec',
        link_type: 'references' as const,
        direction: 'outlink' as const,
        summary: 'API specification',
        depth: 1,
      },
    ],
    total_size: 500,
    truncated_count: 0,
  };
}

export function makeSampleFulltextSearchOutput(): FulltextSearchOutput {
  return {
    results: [
      {
        doc_id: 'doc-1',
        filepath: 'spec/architecture.md',
        title: 'Architecture',
        section_heading: 'Overview',
        snippet: 'System architecture overview...',
        rank: 1,
      },
    ],
    total_found: 1,
  };
}

export function makeSampleListPagesOutput(): ListPagesOutput {
  return {
    pages: [
      {
        doc_id: 'doc-1',
        filepath: 'spec/architecture.md',
        title: 'Architecture',
        doc_type: 'spec' as const,
        link_count: 3,
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        doc_id: 'doc-2',
        filepath: 'spec/api.md',
        title: 'API Spec',
        doc_type: 'api' as const,
        link_count: 1,
        updated_at: '2025-01-02T00:00:00Z',
      },
    ],
    total: 2,
  };
}

export function makeSampleGetGraphOutput(): GetGraphOutput {
  return {
    nodes: [
      {
        id: 'doc-1',
        filepath: 'spec/architecture.md',
        title: 'Architecture',
        doc_type: 'spec' as const,
      },
      {
        id: 'doc-2',
        filepath: 'spec/api.md',
        title: 'API Spec',
        doc_type: 'api' as const,
      },
    ],
    edges: [
      {
        source: 'doc-1',
        target: 'doc-2',
        type: 'references' as const,
      },
    ],
  };
}
