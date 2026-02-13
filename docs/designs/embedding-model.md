---
title: Embedding Model Design
doc_type: spec
source_refs:
  - src/embedding/provider.ts
  - src/embedding/local-provider.ts
  - src/embedding/model-manager.ts
---

[日本語](./embedding-model.ja.md)

# Embedding Model Design

Defines the rationale for embedding model selection, provider abstraction, and instruction-tuned support mechanism used for document search.

## Selection Result

**Default model: `Xenova/multilingual-e5-large`**

- Dimensions: 1024
- Model size: ~560MB (ONNX quantized)
- Pooling: mean pooling
- Instruction-tuned: query/passage prefix support
- Runtime: transformers.js (ONNX Runtime, local execution)

## Model Selection Benchmark

Japanese search quality benchmark results using 13 queries across 4 categories (keyword, semantic, synonym/paraphrase, cross-lingual):

| Model | Size | Dimensions | Top1 Accuracy | Top3 Accuracy |
|---|---|---|---|---|
| all-MiniLM-L6-v2 | ~90MB | 384 | 15% | 69% |
| EmbeddingGemma-300M | ~200MB | 768 | 69% | 92% |
| paraphrase-multilingual-MiniLM-L12-v2 | ~480MB | 384 | 85% | 100% |
| multilingual-e5-small | ~130MB | 384 | 85% | 92% |
| **multilingual-e5-large** | **~560MB** | **1024** | **92%** | **100%** |
| BGE-M3 | ~600MB | 1024 | 85% | 100% |

multilingual-e5-large demonstrated the highest search quality across all categories. The instruction prefix (query:/passage:) improves accuracy for semantic search and synonym matching.

### Benchmark Categories

- **Keyword (KW)**: Direct search using Japanese keywords (e.g., "WikiLink", "staleness")
- **Semantic (SEM)**: Searches requiring conceptual understanding (e.g., "mechanism for managing dependencies between documents")
- **Synonym/Paraphrase (SYN)**: Search by rephrasing (e.g., "document freshness" -> staleness detection design)
- **Cross-lingual (EN)**: Searching Japanese documents with English queries (e.g., "hybrid search algorithm")

## EmbeddingProvider Interface

Abstracts model implementations so that switching models requires only adding an interface implementation.

```typescript
interface EmbeddingProvider {
  /** Initialize the provider (load model, etc.) */
  initialize(): Promise<void>;

  /** Generate embedding for document/passage */
  embed(text: string): Promise<EmbeddingResult>;

  /** Batch embedding generation (throughput optimized) */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /** Generate embedding for search query (for instruction-tuned models) */
  embedQuery?(text: string): Promise<EmbeddingResult>;

  /** Get loaded model information */
  getModelInfo(): EmbeddingModelInfo;

  /** Release resources */
  dispose(): Promise<void>;
}

interface EmbeddingResult {
  vector: Float32Array;   // normalized vector
  model: string;          // model name
  dimensions: number;     // dimension count
}
```

### embed vs embedQuery

Instruction-tuned models (e5 family, etc.) use different prefixes for document storage and search.

- `embed(text)`: For document storage. Adds passage prefix (`"passage: "`)
- `embedQuery(text)`: For search queries. Adds query prefix (`"query: "`)

`embedQuery` is an optional method. If undefined, `HybridSearch` falls back to `embed()`.

## LocalEmbeddingProvider

Local embedding generation implementation using transformers.js (ONNX Runtime).

### Dual Package Support

Prioritizes `@huggingface/transformers` (v3) and falls back to `@xenova/transformers` (v2). Both are defined as optionalDependencies.

```typescript
private async importTransformers(): Promise<any> {
  try {
    return await import('@huggingface/transformers');
  } catch {
    return await import('@xenova/transformers');
  }
}
```

### Automatic Model Detection

Automatically selects the following based on model name:

| Model Family | Pooling | query prefix | passage prefix |
|---|---|---|---|
| e5 series (contains `e5-`) | mean | `"query: "` | `"passage: "` |
| BGE series (contains `bge`) | cls | none | none |
| Other | mean | none | none |

### Automatic Dimension Detection

During initialization, generates a probe embedding (`"test"`) and automatically detects the dimension count from the output vector length. VectorIndex also auto-detects dimensions on the first data load/insert.

### Text Truncation

Input text is truncated to a maximum of 2048 characters. This setting is designed to fully utilize e5-large's maximum of 512 tokens.

### Batch Processing

`embedBatch(texts)` processes in chunks of batch size 32. If the entire batch fails, it falls back to individual `embed()` calls.

## ModelManager

Cache management for transformers.js models.

- Cache directory: `~/.cache/ubp/models/` (with tilde expansion)
- `ensureCacheDir()`: Creates the cache directory
- `isModelCached(modelName)`: Checks for model file existence
- `getCacheDir()`: Gets the cache path

Models are automatically downloaded from Hugging Face Hub on the first `initialize()` call and loaded from cache thereafter.

## Model Switching Procedure

1. Change `embedding.model` and `embedding.dimensions` in `config.json`
2. Run `ubp reindex --force`
3. All section embeddings are regenerated with the new model

Use `SectionRepository.findByEmbeddingModelNot(model)` to detect sections with a different model and identify migration targets.

## Design Constraints

- Following the local-first principle, external API providers (OpenAI, etc.) are not provided in the MVP stage
- Model size only impacts the initial download; models are loaded instantly from cache thereafter
- Cross-lingual search (English query -> Japanese documents) is effective only with vector search. FTS5 keyword search cannot cross language boundaries
