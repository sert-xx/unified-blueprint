# Unified Blueprint (UBP)

Documentation-as-Code ミドルウェア。Markdown ドキュメントを Document Graph として構造化し、セマンティック検索・グラフ探索を提供する。

## UBP MCP ツール

このプロジェクトには UBP MCP サーバーが設定されている。  
プロジェクトの設計や仕様について質問された場合は、コードを直接読む前にまず以下の MCP ツールを使うこと:

- `ubp_search`: セマンティック検索（設計意図や概念の質問に使う）
- `ubp_get_page`: 特定ドキュメントの全文取得
- `ubp_get_context`: ドキュメント＋関連ドキュメントの一括取得
- `ubp_fulltext_search`: キーワード完全一致検索
- `ubp_list_pages`: ドキュメント一覧
- `ubp_get_graph`: ドキュメント間の依存関係グラフ
