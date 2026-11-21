---
name: lifeline-quality-deps
description: >-
  Use this skill when running type checks, linting, formatting, or unit tests inside
  the container, or when setting up and verifying automated dependency updates
  (Renovate / Dependabot) to keep all modules up to date.
---

# Quality Checks & Dependency Freshness

依存モジュールを常に最新に保ちつつ、AI・人間双方にとって安全に保守できる品質ゲートを運用するための手順。

## 1. 品質チェック構成

すべてのチェックはホスト環境を汚さず、Docker コンテナ内で完結して実行できるコマンドとして `package.json` の `scripts` に定義する。

- **型チェック**: `tsc --noEmit`
- **Lint / Format**: ESLint + Prettier（または Biome）
- **単体テスト**: Vitest 等の高速なテストランナー

## 2. 依存関係最新化の仕組み

1. **パッケージマネージャ**: `pnpm` 等を使用し、ロックファイルでバージョンを厳密に管理する。
2. **自動アップデート設定**:
   - `.github/dependabot.yml` または `renovate.json` をリポジトリに配置し、npm 依存関係および Docker ベースイメージ（`Dockerfile`）の定期アップデート PR が自動生成されるようにする。
3. **CI 検証（GitHub Actions 等）**:
   - PR 作成時に「型チェック → Lint → 単体テスト → ビルド」を自動実行し、ライブラリ更新による破壊的変更を即検知できるようにする。

## 3. 検証手順

変更を加えた際は、コンテナ内で以下を順に実行し、すべてエラー 0 で完了することを確認する（エージェント環境で `docker` が実行できない場合は、ユーザーへ以下のコンテナ内実行コマンドを案内する）。

1. 型チェックコマンドの実行
2. Lint チェックコマンドの実行
3. 単体テストコマンドの実行
4. 本番ビルドコマンドの実行
