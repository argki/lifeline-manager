# ライフライン使用量・料金管理アプリ アーキテクチャ設計書

## 1. 技術スタック

| レイヤー | 採用技術 | 選定理由 |
| :--- | :--- | :--- |
| **言語** | TypeScript (strict) | 静的型付けにより AI 親和性・保守性・リファクタリング耐性が高い |
| **フロントエンド** | React + Vite | エコシステムが最大級で長期保守・情報収集が容易 |
| **グラフ描画** | Recharts | React コンポーネントとして宣言的に折れ線グラフを構築でき、ツールチップや系列フィルタが容易 |
| **ローカル API** | Hono (`@hono/node-server`) | 軽量・高速・TypeScript ファースト。API とビルド済み静的ファイル配信を 1 プロセスで完結可能 |
| **データ永続化** | ローカル JSON ファイル (`/app/data/lifeline.json`) | ネイティブバイナリ依存（C++ ビルド等）がなく、Win/Mac Docker 環境で確実に動作しバックアップも容易 |
| **テスト / 品質** | Vitest + ESLint + Prettier + `tsc` | 高速な単体テストと厳格な静的解析をコンテナ内で完結 |
| **コンテナ** | Docker / Docker Compose (`node:26-alpine`) | ホスト OS に Node.js や依存パッケージをインストールせず環境を清潔に保つ |

---

## 2. ディレクトリ構成

```text
.
├── .agents/skills/          # 開発用エージェントスキル
├── .github/
│   ├── dependabot.yml       # 依存パッケージ・Docker イメージ自動更新
│   └── workflows/ci.yml     # 型チェック・Lint・テスト・ビルド CI
├── data/                    # ホスト側永続データマウント領域（実データは gitignore）
├── docs/                    # 要件定義・設計・タスクリスト
├── src/
│   ├── shared/              # フロント・バック共通の型定義・ドメインロジック（和暦変換・集計・CSVパーサ）
│   ├── server/              # Hono ローカル API サーバー・JSON 永続化ストア
│   └── client/              # React + Vite フロントエンド UI
├── compose.yaml             # 本番・ローカル起動用 Compose 定義（127.0.0.1:3456）
├── Dockerfile               # マルチステージビルド定義
├── package.json
└── tsconfig.json
```

---

## 3. データモデル設計

```typescript
export type UtilityKind = 'water' | 'electricity' | 'gas';

export interface UtilityMeta {
  kind: UtilityKind;
  label: string;           // 例: "水道使用量", "東京電力", "プロパンガス"
  unit: string;            // 例: "㎥", "kWh"
  decimalPlaces: number;   // 水道: 0, 電力/ガス: 1
  billingMonths: number[]; // 水道: [1,3,5,7,9,11], 電力/ガス: [1..12]
  billingNote?: string;    // 例: "利用月の翌月請求（1月利用＝2月請求）"
}

export interface MonthlyEntry {
  usage: number | null;
  amount: number | null;
}

/** key: 月 ("1" 〜 "12") */
export type YearEntries = Record<string, MonthlyEntry>;

/** key: 西暦年 ("2017" 〜 "2026" 等) */
export type YearlyDataMap = Record<string, YearEntries>;

export interface SiteData {
  id: string;
  name: string;
  utilities: Record<UtilityKind, {
    meta: UtilityMeta;
    records: YearlyDataMap;
  }>;
}

export interface LifelineStore {
  version: 1;
  activeSiteId: string | null;
  sites: SiteData[];
  updatedAt: string;
}
```

### 永続化・安全性方針
- コンテナ内 `/app/data/lifeline.json`（ホスト側 `./data/lifeline.json` にバインドマウント）へ保存する。
- 書き込み時は一時ファイル（`lifeline.json.tmp`）へ出力後にリネームし、書き込み途中の破損を防ぐ。

---

## 4. ローカル API 設計

| Method | Path | 概要 |
| :--- | :--- | :--- |
| `GET` | `/api/health` | 起動確認用ヘルスチェック（`{ ok: true }`） |
| `GET` | `/api/store` | 全拠点・全データの取得 |
| `POST` | `/api/sites` | 拠点の新規追加（3種別の初期メタデータ付き） |
| `PATCH` | `/api/sites/:siteId` | 拠点名の変更 |
| `DELETE` | `/api/sites/:siteId` | 拠点の削除 |
| `PUT` | `/api/sites/:siteId/utilities/:kind/records` | 指定拠点・種別の年次/月次レコード更新 |
| `POST` | `/api/sites/:siteId/import-csv` | 既存 Excel 書き出し CSV の取り込み |
| `GET` | `/api/export` | 全拠点または拠点指定の JSON バックアップ出力 |
| `POST` | `/api/import` | JSON バックアップからの復元 |

---

## 5. セキュリティ・ネットワーク方針
- ポートバインドは `127.0.0.1:3456:3456` に限定し、LAN 内他端末からのアクセスを遮断する。
- 外部 API 通信やテレメトリ送信は一切行わない。
