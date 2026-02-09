import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalEmbeddingProvider } from './local-provider.js';
import { EmbeddingError, EmbeddingModelNotAvailableError } from '../shared/errors.js';

/**
 * LocalEmbeddingProvider のテスト
 *
 * @xenova/transformers は optionalDependency のため、
 * 実際のモデルロードはスキップし、インターフェースとエラーハンドリングを検証する。
 * 統合テスト / ベンチマークで実モデルを使用する。
 */
describe('LocalEmbeddingProvider', () => {
  describe('constructor', () => {
    it('creates instance with default config', () => {
      const provider = new LocalEmbeddingProvider();
      const info = provider.getModelInfo();
      expect(info.name).toBe('Xenova/all-MiniLM-L6-v2');
      expect(info.dimensions).toBe(384);
      expect(info.maxTokens).toBe(256);
    });

    it('creates instance with custom config', () => {
      const provider = new LocalEmbeddingProvider({
        modelName: 'custom/model',
        cacheDir: '/tmp/test-cache',
        quantized: false,
      });
      const info = provider.getModelInfo();
      expect(info.name).toBe('custom/model');
    });
  });

  describe('getModelInfo', () => {
    it('returns model information', () => {
      const provider = new LocalEmbeddingProvider();
      const info = provider.getModelInfo();
      expect(info).toEqual({
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        maxTokens: 256,
        languages: expect.arrayContaining(['en', 'ja']),
      });
    });
  });

  describe('embed (without initialization)', () => {
    it('throws EmbeddingError when not initialized', async () => {
      const provider = new LocalEmbeddingProvider();
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingError);
    });
  });

  describe('embedBatch (without initialization)', () => {
    it('throws EmbeddingError when not initialized', async () => {
      const provider = new LocalEmbeddingProvider();
      await expect(provider.embedBatch(['test'])).rejects.toThrow(
        EmbeddingError,
      );
    });
  });

  describe('dispose', () => {
    it('disposes without error', async () => {
      const provider = new LocalEmbeddingProvider();
      await expect(provider.dispose()).resolves.not.toThrow();
    });

    it('throws on embed after dispose', async () => {
      const provider = new LocalEmbeddingProvider();
      await provider.dispose();
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingError);
    });
  });
});
