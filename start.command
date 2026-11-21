#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[ライフライン管理] Docker の起動状態を確認しています..."
if ! docker info >/dev/null 2>&1; then
  echo "[エラー] Docker Desktop が起動していません。Docker Desktop を起動してから再実行してください。"
  read -r -p "Enter キーを押して閉じます..."
  exit 1
fi

echo "[ライフライン管理] コンテナを起動しています..."
docker compose up -d

echo "[ライフライン管理] アプリの起動を待機しています..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:3456/api/health" >/dev/null 2>&1; then
    echo "[ライフライン管理] ブラウザを開きます (http://127.0.0.1:3456)"
    open "http://127.0.0.1:3456"
    exit 0
  fi
  sleep 1
done

echo "[エラー] アプリの起動確認がタイムアウトしました。docker compose logs を確認してください。"
read -r -p "Enter キーを押して閉じます..."
exit 1
