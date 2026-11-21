---
name: lifeline-docker-setup
description: >-
  Use this skill when setting up, modifying, or verifying the Docker / Docker Compose
  container environment, host volume mounts for local data persistence, localhost-only
  port binding, or Windows/macOS double-click launcher scripts (start/stop).
---

# Lifeline Docker & Launcher Setup

ホスト環境を汚さず、Windows / macOS の双方でダブルクリック起動できるコンテナ環境を構築・検証するための手順。

## 1. コンテナ構成要件

1. **環境非汚染**: Node.js・パッケージマネージャ（`pnpm` 等）・アプリ依存はすべてコンテナ内に閉じ込める。開発用には `.devcontainer/` の用意も検討する。
2. **セキュリティ（localhost 限定）**:
   - `compose.yaml`（または `docker-compose.yml`）のポートマッピングは必ず `127.0.0.1:<PORT>:<PORT>` とし、`0.0.0.0` で公開しない。
3. **データ永続化**:
   - アプリが読み書きするデータディレクトリ（例: `./data:/app/data`）をホスト側へバインドマウントし、コンテナ再作成時もデータが消えないようにする。
   - `.gitignore` で実データ（`data/*.json` や `*.sqlite` 等）が誤ってリポジトリにコミットされないよう保護する（サンプル・空ディレクトリ用 `.gitkeep` は除く）。

## 2. ダブルクリック起動・停止スクリプト要件

ユーザーがターミナル操作なしで起動・停止できるよう、ルート直下（または `scripts/`）に以下を作成する。

- **Windows**: `start.bat` / `stop.bat`
  - Docker Desktop が起動していない場合の案内メッセージ表示。
  - `docker compose up -d --build` 実行後、ヘルスチェック（`curl` や PowerShell の `Invoke-WebRequest` 等）でサーバー応答を待機。
  - 応答確認後に `start http://127.0.0.1:<PORT>` で規定ブラウザを開く。
- **macOS**: `start.command` / `stop.command`
  - スクリプト配置ディレクトリへ `cd "$(dirname "$0")"` で移動。
  - `docker compose up -d --build` 実行後、`curl` 等でヘルスチェック待機。
  - 応答確認後に `open http://127.0.0.1:<PORT>` で規定ブラウザを開く。
  - 実行権限（`chmod +x`）の付与手順または Git での実行権限保持を確認する。

## 3. 検証手順

1. `docker compose config` で設定構文エラーがないことを確認する。
2. `docker compose up -d --build` でコンテナが正常起動し、ヘルスチェックが通ることを確認する。
3. コンテナ再起動（`docker compose down && docker compose up -d`）後も、マウント先ディレクトリ内のデータが保持されることを確認する。
4. ポートバインドが `127.0.0.1` に限定されていることを `docker compose ps` 等で確認する。
