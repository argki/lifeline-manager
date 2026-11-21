import type {
  CsvImportResult,
  LifelineStore,
  UtilityKind,
  UtilityMeta,
  YearlyDataMap,
} from './types.js';
import { UTILITY_KINDS } from './utilities.js';
import { parseWarekiYear, toWareki } from './wareki.js';

function normalizeFullWidth(text: string): string {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * RFC4180 簡易 CSV パーサ（ダブルクォート内のカンマに対応）
 */
export function parseCsvRows(csvText: string): string[][] {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

export function parseNumericCell(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = normalizeFullWidth(raw).replace(/,/g, '');
  if (!normalized || normalized === '-' || normalized === '#DIV/0!') {
    return null;
  }
  if (/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)+$/.test(normalized)) {
    const sum = normalized
      .split('+')
      .map((part) => Number(part.trim()))
      .reduce((acc, n) => acc + n, 0);
    return Number.isFinite(sum) ? sum : null;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function detectUtilityKind(rows: string[][]): UtilityKind | null {
  const sampleText = rows
    .slice(0, 5)
    .flat()
    .map((c) => normalizeFullWidth(c))
    .join(' ');

  if (sampleText.includes('水道')) return 'water';
  if (sampleText.includes('電力') || sampleText.toLowerCase().includes('kwh')) return 'electricity';
  if (sampleText.includes('ガス')) return 'gas';
  return null;
}

interface MonthHeaderInfo {
  headerRowIndex: number;
  monthColumns: Array<{ month: number; colIndex: number }>;
}

function findMonthHeader(rows: string[][]): MonthHeaderInfo | null {
  const limit = Math.min(rows.length, 10);
  for (let r = 0; r < limit; r++) {
    const row = rows[r]!;
    const monthColumns: Array<{ month: number; colIndex: number }> = [];
    for (let c = 0; c < row.length; c++) {
      const cell = normalizeFullWidth(row[c] ?? '');
      const match = cell.match(/^(\d{1,2})月$/);
      if (match) {
        const month = Number(match[1]);
        if (month >= 1 && month <= 12) {
          monthColumns.push({ month, colIndex: c });
        }
      }
    }
    if (monthColumns.length >= 2) {
      return { headerRowIndex: r, monthColumns };
    }
  }
  return null;
}

function isAmountRowLabel(label: string): boolean {
  const normalized = normalizeFullWidth(label);
  return normalized === '円' || normalized === '金額';
}

function isUsageRowLabel(label: string): boolean {
  const normalized = normalizeFullWidth(label).toLowerCase();
  return (
    normalized.includes('㎥') ||
    normalized.includes('m3') ||
    normalized.includes('kwh') ||
    normalized.includes('使用量')
  );
}

/**
 * 既存 Excel 書き出し CSV 形式をパースする。
 */
export function parseExcelExportCsv(csvText: string): CsvImportResult {
  const rows = parseCsvRows(csvText);
  const detectedKind = detectUtilityKind(rows);
  const header = findMonthHeader(rows);

  if (!header) {
    return {
      detectedKind,
      records: {},
      importedYears: [],
      skippedRows: rows.length,
    };
  }

  const records: YearlyDataMap = {};
  const importedYearSet = new Set<number>();
  let currentYear: number | null = null;
  let skippedRows = 0;

  for (let r = header.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r]!;
    const yearCell = normalizeFullWidth(row[0] ?? '');
    const itemCell = normalizeFullWidth(row[1] ?? '');

    if (!yearCell && !itemCell) {
      skippedRows++;
      continue;
    }

    if (yearCell) {
      const parsedYear = parseWarekiYear(yearCell);
      if (parsedYear !== null) {
        currentYear = parsedYear;
      } else {
        currentYear = null;
        skippedRows++;
        continue;
      }
    } else if (!isAmountRowLabel(itemCell)) {
      // 和暦セルが空欄で「円/金額」行でもない場合は、和暦未入力の空行とみなす
      currentYear = null;
      skippedRows++;
      continue;
    }

    if (currentYear === null) {
      skippedRows++;
      continue;
    }

    const isAmount = isAmountRowLabel(itemCell);
    const isUsage = !isAmount && isUsageRowLabel(itemCell);
    if (!isAmount && !isUsage) {
      skippedRows++;
      continue;
    }

    const yearKey = String(currentYear);
    let hasValueInRow = false;

    for (const { month, colIndex } of header.monthColumns) {
      const val = parseNumericCell(row[colIndex]);
      if (val === null) continue;

      hasValueInRow = true;
      records[yearKey] ??= {};
      records[yearKey][String(month)] ??= { usage: null, amount: null };
      if (isAmount) {
        records[yearKey][String(month)]!.amount = val;
      } else {
        records[yearKey][String(month)]!.usage = val;
      }
    }

    if (hasValueInRow) {
      importedYearSet.add(currentYear);
    }
  }

  return {
    detectedKind,
    records,
    importedYears: Array.from(importedYearSet).sort((a, b) => a - b),
    skippedRows,
  };
}

/**
 * 既存レコードにインポート結果をマージする（月単位で非null値を上書き）。
 */
export function mergeYearlyRecords(
  existing: YearlyDataMap,
  incoming: YearlyDataMap,
): YearlyDataMap {
  const merged: YearlyDataMap = structuredClone(existing);
  for (const [yearKey, months] of Object.entries(incoming)) {
    merged[yearKey] ??= {};
    for (const [monthKey, entry] of Object.entries(months)) {
      const prev = merged[yearKey][monthKey] ?? { usage: null, amount: null };
      merged[yearKey][monthKey] = {
        usage: entry.usage !== null ? entry.usage : prev.usage,
        amount: entry.amount !== null ? entry.amount : prev.amount,
      };
    }
  }
  return merged;
}

/**
 * 指定拠点・種別のデータをバックアップ用 CSV 文字列へエクスポートする。
 */
export function exportUtilityToCsv(meta: UtilityMeta, records: YearlyDataMap): string {
  const header = [meta.label, '', ...meta.billingMonths.map((m) => `${m}月`)].join(',');
  const years = Object.keys(records)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  const lines: string[] = [header];
  for (const year of years) {
    const wareki = toWareki(year).shortLabel;
    const yearEntries = records[String(year)] ?? {};
    const usageRow = [
      wareki,
      meta.unit,
      ...meta.billingMonths.map((m) => {
        const v = yearEntries[String(m)]?.usage;
        return v !== null && v !== undefined ? String(v) : '';
      }),
    ];
    const amountRow = [
      '',
      '円',
      ...meta.billingMonths.map((m) => {
        const v = yearEntries[String(m)]?.amount;
        return v !== null && v !== undefined ? String(v) : '';
      }),
    ];
    lines.push(usageRow.join(','), amountRow.join(','));
  }

  return lines.join('\n');
}

export function validateStoreJson(data: unknown): LifelineStore {
  if (!data || typeof data !== 'object') {
    throw new Error('JSONデータの形式が不正です');
  }
  const obj = data as Partial<LifelineStore>;
  if (obj.version !== 1 || !Array.isArray(obj.sites)) {
    throw new Error('サポートされていないストア形式またはバージョンです');
  }
  for (const site of obj.sites) {
    if (!site || typeof site.id !== 'string' || typeof site.name !== 'string' || !site.utilities) {
      throw new Error('拠点データの構造が不正です');
    }
    for (const kind of UTILITY_KINDS) {
      if (!site.utilities[kind]?.meta || !site.utilities[kind]?.records) {
        throw new Error(`種別(${kind})のデータが不足しています`);
      }
    }
  }
  return obj as LifelineStore;
}
