---
title: 陳腐化検知設計
doc_type: design
source_refs:
  - src/core/staleness/staleness-detector.ts
  - src/data/repositories/source-refs-repository.ts
---

[English](./staleness-detection.md)

# 陳腐化検知設計

ドキュメントが参照するソースコードの変更を検知し、更新が必要なドキュメントを特定する仕組みを定義する。

## 概要

Documentation-as-Codeでは、設計ドキュメントが実装コードを参照することが多い。ソースコードが変更された場合、関連するドキュメントも更新が必要になる可能性がある。UBPはフロントマターの`source_refs`フィールドとSHA-256ハッシュ比較により、この陳腐化を自動検知する。

## source_refsメカニズム

### フロントマター定義

ドキュメントのフロントマターに`source_refs`フィールドとして参照先のソースファイルパスを列挙する。パスはプロジェクトルートからの相対パスで記述する。

```yaml
---
title: 検索アルゴリズム設計
doc_type: spec
source_refs:
  - src/core/search/hybrid-search.ts
  - src/core/search/vector-search.ts
  - src/core/graph/graph-traversal.ts
---
```

### ハッシュ追跡

各source_refに対してソースファイルのSHA-256ハッシュを`source_refs_state`テーブルに保存する。

```
source_refs_state:
  doc_id          → ドキュメントID
  file_path       → ソースファイルパス
  last_synced_hash → 最終同期時のSHA-256ハッシュ
  last_synced_at  → 最終同期日時
  is_stale        → 陳腐化フラグ (0/1)
```

ドキュメントのインデックス時（init、reindex、ファイル変更時）に、各source_refのSHA-256を計算して`last_synced_hash`に保存する。

## 陳腐化レベル

4段階の陳腐化レベルを定義する。

### fresh

全てのsource_refsのハッシュが`last_synced_hash`と一致している状態。ドキュメントは最新であり、更新の必要がない。

### possibly_stale

`source_refs` が定義されているが、参照先ファイルのハッシュ不一致が陳腐化閾値期間内である状態。ドキュメントの更新が必要な可能性があるが、まだ確定的ではない。

### stale

少なくとも1つのsource_refのハッシュが`last_synced_hash`と異なる状態。参照先のソースコードが変更されており、ドキュメントの更新が必要。

### untracked

`source_refs` が定義されているが、参照先のファイルが存在しない状態（`last_synced_hash` が記録されていない）。ファイルの移動・削除・パスの誤りが原因として考えられる。

## 検出フロー

### ドキュメントインデックス時

`ChangeProcessor`がドキュメントを処理する際に、`StalenessDetector`が各source_refのハッシュを計算して保存する。

```
1. フロントマターからsource_refsを取得
2. 各パスに対してパストラバーサル検証
3. ファイルが存在すればSHA-256を計算
4. source_refs_stateにupsert (last_synced_hash, last_synced_at)
```

### 陳腐化チェック時

`ubp stale`コマンドまたはMCPツール経由でページ取得時に実行される。

```
1. source_refs_stateの全レコードを取得
2. 各file_pathの現在のSHA-256を計算
3. last_synced_hashと比較
4. 不一致 → is_stale = 1, 理由 = 'modified'
5. ファイル不在 → 理由 = 'not_found'
6. 一致 → is_stale = 0
```

### MCP経由のページ取得時

`ubp_get_page`でドキュメントを取得する際、`staleness`フィールドに現在の陳腐化レベルを、`stale_refs`に陳腐化したソースファイルパスの一覧を付与する。AIエージェントはこの情報を基にドキュメント更新を提案できる。

## パストラバーサル防止

source_refsのパスはプロジェクトルート内に制限される。

### フロントマター解析時

`FrontmatterParser`が`source_refs`の各パスを検証し、`..`を含むパスは警告を出力して除外する。

```
source_refs:
  - src/valid/path.ts          → OK
  - ../outside/project.ts      → 警告して除外
  - src/../../escape/path.ts   → 警告して除外
```

### 実行時検証

`StalenessDetector`がハッシュ計算前にパスを正規化し、プロジェクトルートの外を指すパスを拒否する。`path.resolve()`で絶対パスに変換した後、プロジェクトルート配下であることを確認する。

## CI連携

### --exit-code オプション

`ubp stale --exit-code`を実行すると、陳腐化ドキュメントが存在する場合にexit code 1で終了する。CIパイプラインに組み込むことで、ドキュメントの陳腐化をプルリクエスト段階で検出できる。

```bash
# CI設定例
ubp stale --exit-code
# exit 0: 全ドキュメントがfresh
# exit 1: staleなドキュメントが存在
```

### --json オプション

`ubp stale --json`で機械可読なJSON出力を得られる。CIツールとの連携やレポート生成に使用する。

## StaleDocInfo

陳腐化ドキュメントの情報は以下の構造で返却する:

```typescript
interface StaleDocInfo {
  doc_id: string;
  filepath: string;
  title: string;
  staleness: StalenessLevel;
  stale_refs: StaleRefInfo[];
}

interface StaleRefInfo {
  source_path: string;
  reason: 'modified' | 'deleted' | 'not_found';
}
```

`reason`の意味:
- `modified`: ソースファイルのハッシュが変更された
- `deleted`: ソースファイルが削除された
- `not_found`: ソースファイルが見つからない（パスの誤り等）
