#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

STARTING_FILE="$(pwd)/public/starting.html"
OPENED_STARTING=false
if [ -f "$STARTING_FILE" ]; then
  echo "[ライフライン管理] アップデート中画面をブラウザで開きます..."
  open "file://${STARTING_FILE}?mode=update"
  OPENED_STARTING=true
fi

echo "[ライフライン管理] Docker の起動状態を確認しています..."
if ! docker info >/dev/null 2>&1; then
  echo "[エラー] Docker Desktop が起動していません。Docker Desktop を起動してから再実行してください。"
  read -r -p "Enter キーを押して閉じます..."
  exit 1
fi

echo "[ライフライン管理] コンテナを再ビルドして更新しています..."
docker compose up -d --build --force-recreate

echo "[ライフライン管理] アプリの起動を待機しています..."
for i in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:3456/api/health" >/dev/null 2>&1; then
    if [ "$OPENED_STARTING" = true ]; then
      echo "[ライフライン管理] 更新完了。アプリの準備が整いました (http://127.0.0.1:3456)"
    else
      echo "[ライフライン管理] 更新完了。ブラウザを開きます (http://127.0.0.1:3456)"
      open "http://127.0.0.1:3456"
    fi
    exit 0
  fi
  sleep 1
done

echo "[エラー] アプリの起動確認がタイムアウトしました。docker compose logs を確認してください。"
read -r -p "Enter キーを押して閉じます..."
exit 1
