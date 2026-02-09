/**
 * Frontmatter YAML 解析
 *
 * Markdownファイルの先頭に配置されたYAML Frontmatterを解析し、
 * title, doc_type, source_refs を抽出する。
 */

import yaml from 'yaml';
import type { DocType, Frontmatter } from '../../shared/types.js';

const VALID_DOC_TYPES: ReadonlySet<string> = new Set<string>([
  'spec',
  'design',
  'adr',
  'guide',
  'api',
  'meeting',
  'todo',
  'other',
]);

export interface FrontmatterWarning {
  type: 'invalid_frontmatter';
  message: string;
}

export interface FrontmatterParseResult {
  data: Frontmatter;
  warnings: FrontmatterWarning[];
}

/**
 * YAML文字列をFrontmatterオブジェクトに変換する。
 * 不正な値に対しては警告を生成しつつフォールバック値を使用する。
 */
export function parseFrontmatter(
  yamlString: string,
  filepath: string,
): FrontmatterParseResult {
  const warnings: FrontmatterWarning[] = [];

  if (!yamlString.trim()) {
    return { data: {}, warnings };
  }

  let raw: unknown;
  try {
    raw = yaml.parse(yamlString);
  } catch (err) {
    warnings.push({
      type: 'invalid_frontmatter',
      message: `Failed to parse YAML frontmatter in ${filepath}: ${String(err)}`,
    });
    return { data: {}, warnings };
  }

  if (typeof raw !== 'object' || raw === null) {
    warnings.push({
      type: 'invalid_frontmatter',
      message: `Frontmatter in ${filepath} is not a valid YAML object`,
    });
    return { data: {}, warnings };
  }

  const obj = raw as Record<string, unknown>;

  // title
  const title =
    typeof obj['title'] === 'string' ? obj['title'].trim() : undefined;

  // doc_type
  let doc_type: DocType | undefined;
  if (obj['doc_type'] !== undefined) {
    if (typeof obj['doc_type'] === 'string' && VALID_DOC_TYPES.has(obj['doc_type'])) {
      doc_type = obj['doc_type'] as DocType;
    } else {
      warnings.push({
        type: 'invalid_frontmatter',
        message:
          `Invalid doc_type "${String(obj['doc_type'])}" in ${filepath}. ` +
          `Valid values: ${[...VALID_DOC_TYPES].join(', ')}. Falling back to "spec".`,
      });
      doc_type = 'spec';
    }
  }

  // source_refs
  let source_refs: string[] | undefined;
  if (obj['source_refs'] !== undefined) {
    if (Array.isArray(obj['source_refs'])) {
      const filtered: string[] = [];
      for (const ref of obj['source_refs']) {
        if (typeof ref !== 'string') continue;
        const trimmed = ref.trim();
        if (trimmed.includes('..')) {
          warnings.push({
            type: 'invalid_frontmatter',
            message:
              `source_ref "${trimmed}" in ${filepath} contains "..". ` +
              `Path traversal is not allowed. This ref will be ignored.`,
          });
          continue;
        }
        filtered.push(trimmed);
      }
      source_refs = filtered.length > 0 ? filtered : undefined;
    } else {
      warnings.push({
        type: 'invalid_frontmatter',
        message: `source_refs in ${filepath} must be an array of strings.`,
      });
    }
  }

  return {
    data: { title, doc_type, source_refs },
    warnings,
  };
}
