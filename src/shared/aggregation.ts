import type { YearEntries, YearSummary, YearlyDataMap } from './types.js';
import { roundTo } from './utilities.js';
import { toWareki } from './wareki.js';

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 1年分の合計・平均を計算する。
 * 未入力（null/undefined）の月は分母から除外し、実績0件時は null を返す（#DIV/0! 防止）。
 */
export function calculateYearSummary(
  yearEntries: YearEntries | undefined,
  billingMonths: readonly number[],
  decimalPlaces: number,
): YearSummary {
  if (!yearEntries) {
    return {
      totalUsage: null,
      averageUsage: null,
      totalAmount: null,
      averageAmount: null,
      usageCount: 0,
      amountCount: 0,
    };
  }

  let usageSum = 0;
  let usageCount = 0;
  let amountSum = 0;
  let amountCount = 0;

  for (const month of billingMonths) {
    const entry = yearEntries[String(month)];
    if (!entry) continue;

    if (isValidNumber(entry.usage)) {
      usageSum += entry.usage;
      usageCount += 1;
    }
    if (isValidNumber(entry.amount)) {
      amountSum += entry.amount;
      amountCount += 1;
    }
  }

  return {
    totalUsage: usageCount > 0 ? roundTo(usageSum, decimalPlaces) : null,
    averageUsage: usageCount > 0 ? roundTo(usageSum / usageCount, decimalPlaces) : null,
    totalAmount: amountCount > 0 ? Math.round(amountSum) : null,
    averageAmount: amountCount > 0 ? Math.round(amountSum / amountCount) : null,
    usageCount,
    amountCount,
  };
}

export type ChartMetric = 'usage' | 'amount';

export interface ChartMonthPoint {
  month: number;
  monthLabel: string;
  [yearKey: string]: number | string | null;
}

/**
 * Recharts 用の月別推移データ配列を構築する。
 * key は `y_<西暦>` 形式（例: "y_2026"）で格納する。
 */
export function buildChartData(
  records: YearlyDataMap,
  billingMonths: readonly number[],
  years: readonly number[],
  metric: ChartMetric = 'usage',
): ChartMonthPoint[] {
  return billingMonths.map((month) => {
    const point: ChartMonthPoint = {
      month,
      monthLabel: `${month}月`,
    };
    for (const year of years) {
      const entry = records[String(year)]?.[String(month)];
      const value = entry?.[metric];
      point[`y_${year}`] = isValidNumber(value) ? value : null;
    }
    return point;
  });
}

export function buildUsageChartData(
  records: YearlyDataMap,
  billingMonths: readonly number[],
  years: readonly number[],
): ChartMonthPoint[] {
  return buildChartData(records, billingMonths, years, 'usage');
}

export function getSortedYears(records: YearlyDataMap): number[] {
  return Object.keys(records)
    .map((k) => Number(k))
    .filter((y) => Number.isInteger(y))
    .sort((a, b) => a - b);
}

export function getYearSeriesLabel(year: number): string {
  return toWareki(year).shortLabel;
}
