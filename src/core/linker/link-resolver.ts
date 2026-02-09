/**
 * WikiLink リゾルバー
 *
 * WikiLink のターゲット文字列を既知のドキュメントに解決する。
 * 解決優先順位（要求定義 v3 セクション 4.4）:
 *   1. ファイル名（拡張子なし）完全一致（大文字小文字正規化）
 *   2. リンク元と同一ディレクトリ内を優先
 *   3. 浅い階層を優先
 *   4. アルファベット順で最初のパス
 *   5. 解決不能 -> ダングリングリンク
 *
 * DocumentRepository のインターフェースに依存するが、実装はまだないため
 * インターフェースのみ定義してモック可能にする。
 */

/**
 * ドキュメントの検索に必要な最小限のインターフェース。
 * Data Layer の DocumentRepository が将来これを満たす。
 */
export interface DocumentLookup {
  /** 全ドキュメントのファイルパス一覧を返す */
  getAllFilepaths(): string[];

  /** ファイルパスからドキュメントIDを返す。見つからなければ null */
  getDocIdByFilepath(filepath: string): string | null;
}

export interface LinkResolutionResult {
  status: 'resolved' | 'dangling';
  targetDocId: string | null;
  filepath: string | null;
  ambiguous: boolean;
}

export class LinkResolver {
  /** normalizedName -> filepath[] */
  private fileIndex: Map<string, string[]> = new Map();
  private docLookup: DocumentLookup | null = null;

  /**
   * DocumentLookup を設定する。
   * Data Layer 初期化後に呼ばれる。
   */
  setDocumentLookup(lookup: DocumentLookup): void {
    this.docLookup = lookup;
  }

  /**
   * インデックス対象の全ファイルパスからファイル名インデックスを構築する。
   */
  buildIndex(filepaths: string[]): void {
    this.fileIndex.clear();
    for (const fp of filepaths) {
      this.addToIndex(fp);
    }
  }

  /**
   * ファイルの追加をインデックスに反映する。
   */
  addFile(filepath: string): void {
    this.addToIndex(filepath);
  }

  /**
   * ファイルの削除をインデックスに反映する。
   */
  removeFile(filepath: string): void {
    const name = this.normalizeName(this.extractFileName(filepath));
    const existing = this.fileIndex.get(name);
    if (existing) {
      const filtered = existing.filter((f) => f !== filepath);
      if (filtered.length > 0) {
        this.fileIndex.set(name, filtered);
      } else {
        this.fileIndex.delete(name);
      }
    }
  }

  /**
   * WikiLink のターゲット文字列を解決する。
   *
   * @param target - WikiLink のターゲット（例: "ログイン機能", "api/認証"）
   * @param sourceFilepath - リンク元ファイルのパス（同一ディレクトリ優先に使用）
   * @returns 解決結果
   */
  resolve(target: string, sourceFilepath: string): LinkResolutionResult {
    // パス指定リンクの場合: [[パス/ページ名]]
    if (target.includes('/')) {
      return this.resolveByPath(target);
    }

    // ファイル名による解決
    return this.resolveByName(target, sourceFilepath);
  }

  /**
   * 曖昧な解決が発生するリンク先の一覧を返す（ubp status 用）。
   */
  getAmbiguousNames(): Array<{ name: string; candidates: string[] }> {
    const result: Array<{ name: string; candidates: string[] }> = [];
    for (const [name, paths] of this.fileIndex) {
      if (paths.length > 1) {
        result.push({ name, candidates: [...paths] });
      }
    }
    return result;
  }

  // --- private ---

  private addToIndex(filepath: string): void {
    const name = this.normalizeName(this.extractFileName(filepath));
    const existing = this.fileIndex.get(name) ?? [];
    if (!existing.includes(filepath)) {
      existing.push(filepath);
      this.fileIndex.set(name, existing);
    }
  }

  private resolveByPath(target: string): LinkResolutionResult {
    const candidatePath = target.endsWith('.md') ? target : `${target}.md`;
    const normalizedCandidate = this.normalizePath(candidatePath);
    const suffix = '/' + normalizedCandidate;

    for (const [, paths] of this.fileIndex) {
      for (const fp of paths) {
        const normalizedFp = this.normalizePath(fp);
        // Exact match or suffix match (filepath may have a docs/ prefix)
        if (
          normalizedFp === normalizedCandidate ||
          normalizedFp.endsWith(suffix)
        ) {
          return {
            status: 'resolved',
            targetDocId: this.lookupDocId(fp),
            filepath: fp,
            ambiguous: false,
          };
        }
      }
    }

    return { status: 'dangling', targetDocId: null, filepath: null, ambiguous: false };
  }

  private resolveByName(
    target: string,
    sourceFilepath: string,
  ): LinkResolutionResult {
    const normalizedTarget = this.normalizeName(target);
    const candidates = this.fileIndex.get(normalizedTarget);

    if (!candidates || candidates.length === 0) {
      return { status: 'dangling', targetDocId: null, filepath: null, ambiguous: false };
    }

    if (candidates.length === 1) {
      return {
        status: 'resolved',
        targetDocId: this.lookupDocId(candidates[0]!),
        filepath: candidates[0]!,
        ambiguous: false,
      };
    }

    // 同名ファイルの解決
    const resolved = this.disambiguate(candidates, sourceFilepath);
    return {
      status: 'resolved',
      targetDocId: this.lookupDocId(resolved),
      filepath: resolved,
      ambiguous: true,
    };
  }

  /**
   * 同名ファイルの曖昧性解決（要求定義 v3 セクション 4.4）
   *
   * 優先順位:
   *   (a) リンク元ファイルと同一ディレクトリ内のファイル
   *   (b) 浅い階層を優先
   *   (c) アルファベット順で最初のパス
   */
  private disambiguate(candidates: string[], sourceFilepath: string): string {
    const sourceDir = this.getDirectory(sourceFilepath);

    // (a) 同一ディレクトリ
    const sameDir = candidates.filter(
      (fp) => this.getDirectory(fp) === sourceDir,
    );
    if (sameDir.length === 1) return sameDir[0]!;
    if (sameDir.length > 1) {
      return sameDir.sort()[0]!;
    }

    // (b) 浅い階層を優先
    const byDepth = candidates
      .map((fp) => ({ fp, depth: fp.split('/').length }))
      .sort((a, b) => a.depth - b.depth);

    const minDepth = byDepth[0]!.depth;
    const shallowest = byDepth.filter((item) => item.depth === minDepth);

    if (shallowest.length === 1) return shallowest[0]!.fp;

    // (c) アルファベット順
    return shallowest.map((item) => item.fp).sort()[0]!;
  }

  private lookupDocId(filepath: string): string | null {
    return this.docLookup?.getDocIdByFilepath(filepath) ?? null;
  }

  /** ファイル名の正規化（小文字化、拡張子除去、Unicode NFC 正規化） */
  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/\.md$/, '').normalize('NFC');
  }

  /** パスの正規化（小文字化、Unicode NFC 正規化） */
  private normalizePath(p: string): string {
    return p.toLowerCase().normalize('NFC');
  }

  /** パスからファイル名を抽出（拡張子なし） */
  private extractFileName(filepath: string): string {
    const basename = filepath.split('/').pop() ?? filepath;
    return basename.replace(/\.md$/, '');
  }

  /** パスからディレクトリ部分を抽出 */
  private getDirectory(filepath: string): string {
    const parts = filepath.split('/');
    parts.pop();
    return parts.join('/');
  }
}
