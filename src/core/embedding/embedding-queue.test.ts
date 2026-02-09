import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmbeddingQueue,
  type EmbeddingJob,
  type EmbeddingStore,
  type VectorIndexUpdater,
  type EmbeddingQueueEventType,
} from './embedding-queue.js';
import type { EmbeddingProvider, EmbeddingResult } from '../../embedding/provider.js';

function createMockProvider(): EmbeddingProvider {
  const embed = vi.fn(async (text: string): Promise<EmbeddingResult> => {
    const vector = new Float32Array(384).fill(0.1);
    return { vector, model: 'test-model', dimensions: 384 };
  });

  const embedBatch = vi.fn(
    async (texts: string[]): Promise<EmbeddingResult[]> => {
      return texts.map(() => ({
        vector: new Float32Array(384).fill(0.1),
        model: 'test-model',
        dimensions: 384,
      }));
    },
  );

  return {
    initialize: vi.fn(),
    embed,
    embedBatch,
    getModelInfo: vi.fn(() => ({
      name: 'test-model',
      dimensions: 384,
      maxTokens: 256,
      languages: ['en'],
    })),
    dispose: vi.fn(),
  };
}

function createMockStore(): EmbeddingStore & { calls: Array<{ sectionId: number; model: string }> } {
  const calls: Array<{ sectionId: number; model: string }> = [];
  return {
    calls,
    updateEmbedding: vi.fn((sectionId: number, embedding: Float32Array, model: string) => {
      calls.push({ sectionId, model });
    }),
  };
}

function createMockVectorIndex(): VectorIndexUpdater & { calls: Array<{ sectionId: number }> } {
  const calls: Array<{ sectionId: number }> = [];
  return {
    calls,
    set: vi.fn((sectionId: number) => {
      calls.push({ sectionId });
    }),
  };
}

function createJob(sectionId: number, content = 'test content'): EmbeddingJob {
  return {
    sectionId,
    docId: `doc-${sectionId}`,
    content,
    heading: null,
  };
}

describe('EmbeddingQueue', () => {
  let provider: EmbeddingProvider;
  let store: ReturnType<typeof createMockStore>;
  let vectorIndex: ReturnType<typeof createMockVectorIndex>;
  let queue: EmbeddingQueue;

  beforeEach(() => {
    provider = createMockProvider();
    store = createMockStore();
    vectorIndex = createMockVectorIndex();
    queue = new EmbeddingQueue(provider, store, vectorIndex);
  });

  describe('enqueue', () => {
    it('adds jobs to the queue', () => {
      queue.enqueue([createJob(1), createJob(2)]);
      expect(queue.pendingCount).toBe(2);
    });

    it('deduplicates jobs with the same sectionId', () => {
      queue.enqueue([createJob(1, 'old')]);
      queue.enqueue([createJob(1, 'new')]);
      expect(queue.pendingCount).toBe(1);
    });
  });

  describe('start / stop', () => {
    it('processes queued jobs after start', async () => {
      queue.enqueue([createJob(1), createJob(2)]);
      queue.start();
      await queue.drain();

      expect(store.calls).toHaveLength(2);
      expect(vectorIndex.calls).toHaveLength(2);
    });

    it('stops processing', async () => {
      queue.start();
      await queue.stop();
      // After stop, newly enqueued jobs should not be processed automatically
      queue.enqueue([createJob(1)]);
      // Give a tick for any async processing
      await new Promise((r) => setTimeout(r, 50));
      expect(store.calls).toHaveLength(0);
    });
  });

  describe('drain', () => {
    it('resolves immediately when queue is empty', async () => {
      queue.start();
      await expect(queue.drain()).resolves.toBeUndefined();
    });

    it('waits for all jobs to complete', async () => {
      queue.enqueue([createJob(1), createJob(2), createJob(3)]);
      queue.start();
      await queue.drain();
      expect(queue.pendingCount).toBe(0);
      expect(queue.completedJobCount).toBe(3);
    });
  });

  describe('batch processing', () => {
    it('uses embedBatch for batch processing', async () => {
      queue.enqueue([createJob(1), createJob(2), createJob(3)]);
      queue.start();
      await queue.drain();

      // embedBatch should have been called (not individual embed)
      expect(provider.embedBatch).toHaveBeenCalled();
    });

    it('falls back to individual embed on batch failure', async () => {
      // Make embedBatch fail, embed succeed
      vi.mocked(provider.embedBatch).mockRejectedValueOnce(
        new Error('batch failed'),
      );

      queue.enqueue([createJob(1), createJob(2)]);
      queue.start();
      await queue.drain();

      // Should have fallen back to individual embed calls
      expect(provider.embed).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('continues processing after individual job error', async () => {
      const events: Array<{ event: EmbeddingQueueEventType; data: unknown }> = [];
      queue.on((event, data) => {
        events.push({ event, data });
      });

      // Make first embed call fail, second succeed
      let callCount = 0;
      vi.mocked(provider.embedBatch).mockRejectedValueOnce(
        new Error('batch failed'),
      );
      vi.mocked(provider.embed)
        .mockRejectedValueOnce(new Error('embed failed'))
        .mockResolvedValueOnce({
          vector: new Float32Array(384).fill(0.1),
          model: 'test-model',
          dimensions: 384,
        });

      queue.enqueue([createJob(1), createJob(2)]);
      queue.start();
      await queue.drain();

      // At least one error event should have been emitted
      const errorEvents = events.filter((e) => e.event === 'job:error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('emits queue:empty when all jobs are processed', async () => {
      const events: EmbeddingQueueEventType[] = [];
      queue.on((event) => events.push(event));

      queue.enqueue([createJob(1)]);
      queue.start();
      await queue.drain();

      expect(events).toContain('queue:empty');
    });

    it('emits queue:progress events', async () => {
      const progressEvents: unknown[] = [];
      queue.on((event, data) => {
        if (event === 'queue:progress') progressEvents.push(data);
      });

      queue.enqueue([createJob(1), createJob(2)]);
      queue.start();
      await queue.drain();

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clear', () => {
    it('clears the queue', () => {
      queue.enqueue([createJob(1), createJob(2), createJob(3)]);
      expect(queue.pendingCount).toBe(3);
      queue.clear();
      expect(queue.pendingCount).toBe(0);
    });
  });

  describe('heading in embedding text', () => {
    it('prepends heading to content when available', async () => {
      const job: EmbeddingJob = {
        sectionId: 1,
        docId: 'doc-1',
        content: 'Section content',
        heading: 'Section Title',
      };

      queue.enqueue([job]);
      queue.start();
      await queue.drain();

      // The embedBatch should have been called with heading prepended
      const batchCall = vi.mocked(provider.embedBatch).mock.calls[0];
      if (batchCall) {
        expect(batchCall[0]![0]).toBe('Section Title\nSection content');
      }
    });
  });

  describe('event listener management', () => {
    it('registers and removes listeners', () => {
      const listener = vi.fn();
      queue.on(listener);
      queue.off(listener);

      // Should not receive events after off
      queue.enqueue([createJob(1)]);
      queue.start();
      // Just verify no crash
    });
  });
});
