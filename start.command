#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

DATA_FILE="$(pwd)/data/lifeline.json"
UPDATE_NEEDED=false
THIRTY_DAYS_SEC=$((30 * 86400))
NOW_EPOCH=$(date +%s)

get_file_mtime_epoch() {
  local target="$1"
  if stat -f %m "$target" >/dev/null 2>&1; then
    stat -f %m "$target"
  else
    stat -c %Y "$target"
  fi
}

if [ -f "$DATA_FILE" ]; then
  DATA_EPOCH=$(get_file_mtime_epoch "$DATA_FILE")
  if [ $((NOW_EPOCH - DATA_EPOCH)) -ge "$THIRTY_DAYS_SEC" ]; then
    UPDATE_NEEDED=true
    IMG_ID=$(docker compose images -q lifeline-app 2>/dev/null || true)
    if [ -n "$IMG_ID" ]; then
      IMG_CREATED=$(docker image inspect --format '{{.Created}}' "$IMG_ID" 2>/dev/null || true)
      if [ -n "$IMG_CREATED" ] && command -v python3 >/dev/null 2>&1; then
        if python3 -c "
import datetime, sys
s = sys.argv[1].replace('Z', '+00:00')
dt = datetime.datetime.fromisoformat(s)
age = (datetime.datetime.now(datetime.timezone.utc) - dt.astimezone(datetime.timezone.utc)).total_seconds()
sys.exit(0 if age < 30 * 86400 else 1)
" "$IMG_CREATED" 2>/dev/null; then
          UPDATE_NEEDED=false
        fi
      fi
    fi
  fi
fi

STARTING_FILE="$(pwd)/public/starting.html"
OPENED_STARTING=false
if [ -f "$STARTING_FILE" ]; then
  if [ "$UPDATE_NEEDED" = true ]; then
    echo "[ライフライン管理] 最終更新から30日以上経過しているため、アップデート中画面をブラウザで開きます..."
    open "file://${STARTING_FILE}?mode=update"
  else
    echo "[ライフライン管理] 起動中画面をブラウザで開きます..."
    open "file://${STARTING_FILE}"
  fi
  OPENED_STARTING=true
fi

echo "[ライフライン管理] Docker の起動状態を確認しています..."
if ! docker info >/dev/null 2>&1; then
  echo "[エラー] Docker Desktop が起動していません。Docker Desktop を起動してから再実行してください。"
  read -r -p "Enter キーを押して閉じます..."
  exit 1
fi

if [ "$UPDATE_NEEDED" = true ]; then
  echo "[ライフライン管理] 最終更新から30日以上経過しているため、コンテナを再ビルドして更新しています..."
  docker compose up -d --build
  MAX_WAIT=180
else
  echo "[ライフライン管理] コンテナを起動しています..."
  docker compose up -d
  MAX_WAIT=30
fi

echo "[ライフライン管理] アプリの起動を待機しています..."
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf "http://127.0.0.1:3456/api/health" >/dev/null 2>&1; then
    if [ "$OPENED_STARTING" = true ]; then
      echo "[ライフライン管理] アプリの起動が完了しました (http://127.0.0.1:3456)"
    else
      echo "[ライフライン管理] ブラウザを開きます (http://127.0.0.1:3456)"
      open "http://127.0.0.1:3456"
    fi
    exit 0
  fi
  sleep 1
done

echo "[エラー] アプリの起動確認がタイムアウトしました。docker compose logs を確認してください。"
read -r -p "Enter キーを押して閉じます..."
exit 1
