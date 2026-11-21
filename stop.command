#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[ライフライン管理] コンテナを停止しています..."
docker compose down
echo "[ライフライン管理] 停止しました。"
