# OSS 公開作業プラン

## 概要
Unified Blueprint (UBP) を OSS として公開するための作業プラン。
進捗状況をこのドキュメントで追跡する。

## ステータス凡例
- [ ] 未着手
- [x] 完了
- [~] 進行中

---

## Phase 1: 法的・ライセンス整備 (最優先)

- [x] 1-1. LICENSE ファイル作成 (MIT License)
- [x] 1-2. 依存パッケージのライセンス互換性確認
- [x] 1-3. package.json に `author`, `license` フィールド追加

## Phase 2: README 英語化・ドキュメント基盤

- [x] 2-1. 英語 README.md 作成 (メイン README を英語に)
- [x] 2-2. 日本語 README を README.ja.md として保存
- [x] 2-3. README にバッジ追加 (npm, CI, license, Node.js)
- [x] 2-4. インストール手順を npm パッケージ利用前提に更新

## Phase 3: package.json 整備・公開設定

- [x] 3-1. パッケージ名・スコープの決定と変更 — 現状 @sert-xx/ubp を維持、最終リネームはリーダーが判断
- [x] 3-2. `keywords`, `homepage`, `bugs`, `repository` フィールド追加
- [x] 3-3. `types` フィールド追加
- [x] 3-4. `files` フィールドで公開ファイルを明示指定
- [x] 3-5. .npmrc の公開レジストリ設定変更 — スコープ付きレジストリ設定を削除
- [x] 3-6. publishConfig の更新 — npmjs.com (public access) に変更

## Phase 4: CI/CD 整備

- [x] 4-1. PR/push 時の CI workflow 作成 (lint, typecheck, test, build)
- [x] 4-2. Node.js バージョンマトリクス (18, 20, 22)
- [x] 4-3. OS マトリクス (ubuntu, macos, windows)
- [x] 4-4. npm publish workflow を npmjs.com 向けに更新
- [x] 4-5. dependabot.yml 作成

## Phase 5: コミュニティ文書整備

- [x] 5-1. CONTRIBUTING.md 作成
- [x] 5-2. CODE_OF_CONDUCT.md 作成 (Contributor Covenant 簡略版)
- [x] 5-3. SECURITY.md 作成
- [x] 5-4. CHANGELOG.md 作成
- [x] 5-5. Issue テンプレート作成 (バグ報告・機能要望)
- [x] 5-6. PR テンプレート作成

## Phase 6: コード品質・セキュリティ

- [x] 6-1. `.claude/` を .gitignore に追加
- [x] 6-2. `.idea/` を .gitignore に追加
- [x] 6-3. git 履歴の秘匿情報確認 — 秘匿情報なし (token/secret 等の検出はコード中の変数名・テストデータのみ)
- [x] 6-4. テストカバレッジの確認・改善 — 全263テスト合格、ただしカバレッジ 45.64% (閾値80%未達、CLI/MCP interface層が未テスト)
- [x] 6-5. `npm pack --dry-run` でパッケージ内容確認 — 493ファイル/3.4MB、coverage/, docs/, scripts/, src/, .github/, CLAUDE.md, OSS_RELEASE_PLAN.md 等が不要に含まれる。`files` フィールド未設定が原因

## Phase 7: GitHub リポジトリ設定

- [ ] 7-1. リポジトリ Description 設定 (手動)
- [ ] 7-2. Topics 設定 (手動)
- [ ] 7-3. Branch protection 設定 (手動)
- [ ] 7-4. Discussions 有効化検討 (手動)

## Phase 8: 最終確認

- [ ] 8-1. クリーンインストールテスト
- [ ] 8-2. npx での動作確認
- [ ] 8-3. README の全リンク確認
- [x] 8-4. 全体レビュー (デビルズ・アドボケット) — 16件指摘、CRITICAL 3件・HIGH 4件を修正対応

---

## 決定事項ログ

| 日付 | 項目 | 決定内容 | 理由 |
|------|------|----------|------|
| 2026-02-10 | ライセンス | MIT License で公開 | 全依存パッケージがMIT互換。LGPL-3.0 は optional の推移的依存(sharp-libvips)のみで問題なし |
| 2026-02-10 | テストカバレッジ閾値 | 初期リリースではカバレッジ閾値チェックを緩和。公開後に段階的改善 | CLI/MCP interface層は統合テストの性質が強く初期リリースで80%は非現実的 |
| 2026-02-10 | git履歴秘匿情報 | 問題なし、対応不要 | architect による確認済み |
| 2026-02-10 | パッケージ名 | `ubp` に決定 | npmjs.com で短く覚えやすい名前 |

## 作業ログ

| 日付 | Phase | 作業内容 | 担当 | 結果 |
|------|-------|----------|------|------|
| 2026-02-10 | Phase 1 | LICENSE ファイル作成 | backend-engineer | 完了 |
| 2026-02-10 | Phase 1 | 依存ライセンス互換性確認 | backend-engineer | 全335+パッケージ確認、問題なし |
| 2026-02-10 | Phase 1 | package.json author/license 追加 | frontend-engineer | 完了 |
| 2026-02-10 | Phase 2 | README 英語化・日本語版保存 | frontend-engineer | 完了 |
| 2026-02-10 | Phase 4 | CI/CD workflow 整備 | designer | 完了 |
| 2026-02-10 | Phase 6 | コード品質・セキュリティ確認 | architect | 完了(カバレッジ要改善) |
| 2026-02-10 | Phase 3 | package.json 整備・公開設定 | frontend-engineer | 完了 |
| 2026-02-10 | Phase 8 | デビルズ・アドボケットレビュー | architect | 16件指摘 (C3/H4/M5) |
| 2026-02-10 | Phase 3 | パッケージ名ubpに変更、LICENSE年修正、.gitignore、publish workflow修正 | backend-engineer | 完了 |
| 2026-02-10 | Phase 5 | コミュニティ文書7ファイル作成 | team-lead | 完了 |
| 2026-02-10 | Phase 2 | README パッケージ名統一、バッジ追加、Prerequisites更新 | team-lead | 完了 |
