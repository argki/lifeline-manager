# ライフライン使用量・料金管理アプリ

複数拠点における「水道」「電力」「ガス」の使用量・料金を管理し、リアルタイムに年別比較グラフを表示するローカル Web アプリケーションです。
Docker コンテナ上で完結して動作するため、PC（Windows / macOS）本体に Node.js 等をインストールする必要はありません。

## 前提条件

- **Windows**: WSL 上で Docker / Docker Compose が利用可能で起動していること
- **macOS**: Docker Desktop がインストールされ、起動していること

## 使い方（ダブルクリック起動）

### Windows
- **起動**: `start.bat` をダブルクリック（ビルド済みイメージですぐ起動し、ブラウザで `http://127.0.0.1:3456` を開きます。初回は自動でビルドされます）
- **停止**: `stop.bat` をダブルクリック
- **アップデート（再ビルド）**: コード更新後は `update.bat` をダブルクリック

### macOS
- **初回のみ実行権限を付与**:
  ```bash
  chmod +x start.command stop.command update.command
  ```
- **起動**: `start.command` をダブルクリック
- **停止**: `stop.command` をダブルクリック
- **アップデート（再ビルド）**: `update.command` をダブルクリック

## データ保存とセキュリティ

- データはすべてホスト側の `./data/lifeline.json` にローカル保存され、外部サーバーへ送信されません。
- ポート公開は `127.0.0.1:3456` に限定されており、LAN 内の他端末からはアクセスできません。
- 画面右上の「データ移行・バックアップ」から、既存 Excel 書き出し CSV の取り込みや JSON バックアップが可能です。

## 開発・テスト用コマンド（コンテナ実行）

```bash
docker run --rm -v "$(pwd):/app" -w /app node:22-alpine sh -c "corepack enable && pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
```
