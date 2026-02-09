#!/bin/bash
# 日本語検索品質ベンチマーク
# hybrid (セマンティック) と fulltext (FTS5) を比較する

CLI="node dist/main.js"

echo "================================================================="
echo " 日本語検索品質ベンチマーク"
echo "================================================================="
echo ""

run_test() {
  local label="$1"
  local query="$2"
  local expected="$3"
  local mode="$4"  # hybrid or fulltext

  echo "--- [$label] ---"
  echo "  クエリ: $query"
  echo "  期待: $expected"

  if [ "$mode" = "fulltext" ]; then
    result=$($CLI search "$query" --fulltext --limit 3 2>&1)
  else
    result=$($CLI search "$query" --limit 3 2>&1)
  fi

  # Extract just titles
  titles=$(echo "$result" | grep -E '^\s+\S+\.md' | sed 's/^[[:space:]]*/  /' | head -3)
  first=$(echo "$result" | grep -E '^\s+\S+\.md' | head -1 | sed 's/^[[:space:]]*//')

  echo "  結果:"
  echo "$titles"

  # Check if expected appears in first result
  if echo "$first" | grep -q "$expected"; then
    echo "  判定: OK (1位に期待ドキュメント)"
  elif echo "$titles" | grep -q "$expected"; then
    echo "  判定: PARTIAL (Top3に期待ドキュメント)"
  else
    echo "  判定: MISS (期待ドキュメントなし)"
  fi
  echo ""
}

echo "=== カテゴリ1: 直接的なキーワード検索 ==="
echo ""
run_test "KW-1 hybrid" "データベース設計" "database-schema.md" "hybrid"
run_test "KW-1 fulltext" "データベース設計" "database-schema.md" "fulltext"

run_test "KW-2 hybrid" "Embeddingモデル" "embedding-model.md" "hybrid"
run_test "KW-2 fulltext" "Embeddingモデル" "embedding-model.md" "fulltext"

run_test "KW-3 hybrid" "MCP ツール" "mcp-tools.md" "hybrid"
run_test "KW-3 fulltext" "MCP ツール" "mcp-tools.md" "fulltext"

echo "=== カテゴリ2: 意味的・概念的な検索（セマンティック検索の真価） ==="
echo ""
run_test "SEM-1 hybrid" "ファイルの変更をリアルタイムで検出する仕組み" "async-pipeline.md" "hybrid"
run_test "SEM-1 fulltext" "ファイルの変更をリアルタイムで検出する仕組み" "async-pipeline.md" "fulltext"

run_test "SEM-2 hybrid" "文書が古くなったかどうかを判定する方法" "staleness-detection.md" "hybrid"
run_test "SEM-2 fulltext" "文書が古くなったかどうかを判定する方法" "staleness-detection.md" "fulltext"

run_test "SEM-3 hybrid" "検索結果の関連性スコアの計算方法" "search-algorithm.md" "hybrid"
run_test "SEM-3 fulltext" "検索結果の関連性スコアの計算方法" "search-algorithm.md" "fulltext"

run_test "SEM-4 hybrid" "日本語テキストの検索精度の課題" "embedding-model.md" "hybrid"
run_test "SEM-4 fulltext" "日本語テキストの検索精度の課題" "embedding-model.md" "fulltext"

echo "=== カテゴリ3: 言い換え・同義語（FTS5では不可能な検索） ==="
echo ""
run_test "SYN-1 hybrid" "AIにドキュメントを提供する方法" "mcp-tools.md" "hybrid"
run_test "SYN-1 fulltext" "AIにドキュメントを提供する方法" "mcp-tools.md" "fulltext"

run_test "SYN-2 hybrid" "ソースコードとドキュメントの整合性チェック" "staleness-detection.md" "hybrid"
run_test "SYN-2 fulltext" "ソースコードとドキュメントの整合性チェック" "staleness-detection.md" "fulltext"

run_test "SYN-3 hybrid" "ドキュメント間の依存関係を表現する仕組み" "database-schema.md" "hybrid"
run_test "SYN-3 fulltext" "ドキュメント間の依存関係を表現する仕組み" "database-schema.md" "fulltext"

echo "=== カテゴリ4: 英語クエリで日本語ドキュメントを検索 ==="
echo ""
run_test "EN-1 hybrid" "file change detection and monitoring" "async-pipeline.md" "hybrid"
run_test "EN-1 fulltext" "file change detection and monitoring" "async-pipeline.md" "fulltext"

run_test "EN-2 hybrid" "search ranking algorithm with graph" "search-algorithm.md" "hybrid"
run_test "EN-2 fulltext" "search ranking algorithm with graph" "search-algorithm.md" "fulltext"

run_test "EN-3 hybrid" "document freshness and staleness" "staleness-detection.md" "hybrid"
run_test "EN-3 fulltext" "document freshness and staleness" "staleness-detection.md" "fulltext"

echo "================================================================="
echo " 完了"
echo "================================================================="
