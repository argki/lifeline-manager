import { describe, expect, it } from 'vitest';
import { buildChartData, buildUsageChartData, calculateYearSummary } from './aggregation.js';
import { DEFAULT_UTILITY_METAS } from './utilities.js';

describe('aggregation', () => {
  it('returns null totals and averages when no entries exist (no #DIV/0!)', () => {
    const summary = calculateYearSummary(undefined, DEFAULT_UTILITY_METAS.water.billingMonths, 0);
    expect(summary).toEqual({
      totalUsage: null,
      averageUsage: null,
      totalAmount: null,
      averageAmount: null,
      usageCount: 0,
      amountCount: 0,
    });
  });

  it('excludes empty months from average calculation (water R6 example)', () => {
    const summary = calculateYearSummary(
      {
        '1': { usage: 17, amount: 5509 },
        '3': { usage: 15, amount: 5384 },
        '5': { usage: 17, amount: 5509 },
        '7': { usage: 15, amount: 5846 },
        '9': { usage: 18, amount: 6034 },
        '11': { usage: 17, amount: 5971 },
      },
      DEFAULT_UTILITY_METAS.water.billingMonths,
      0,
    );
    expect(summary.totalUsage).toBe(99);
    expect(summary.averageUsage).toBe(17);
    expect(summary.totalAmount).toBe(34253);
    expect(summary.averageAmount).toBe(5709);
  });

  it('handles partial-year data and floating-point precision (gas H29 example)', () => {
    const summary = calculateYearSummary(
      {
        '10': { usage: 1.8, amount: 1766 },
        '11': { usage: 5.8, amount: 4492 },
        '12': { usage: 7.1, amount: 5124 },
      },
      DEFAULT_UTILITY_METAS.gas.billingMonths,
      1,
    );
    expect(summary.totalUsage).toBe(14.7);
    expect(summary.averageUsage).toBe(4.9);
    expect(summary.totalAmount).toBe(11382);
    expect(summary.averageAmount).toBe(3794);
    expect(summary.usageCount).toBe(3);
  });

  it('builds chart data series for selected years', () => {
    const data = buildUsageChartData(
      {
        '2025': { '1': { usage: 16, amount: 5909 }, '3': { usage: 18, amount: 6034 } },
        '2026': { '1': { usage: 16, amount: 5909 } },
      },
      [1, 3, 5],
      [2025, 2026],
    );
    expect(data).toEqual([
      { month: 1, monthLabel: '1月', y_2025: 16, y_2026: 16 },
      { month: 3, monthLabel: '3月', y_2025: 18, y_2026: null },
      { month: 5, monthLabel: '5月', y_2025: null, y_2026: null },
    ]);
  });

  it('builds amount chart data series when metric is amount', () => {
    const data = buildChartData(
      {
        '2025': { '1': { usage: 16, amount: 5909 }, '3': { usage: 18, amount: 6034 } },
        '2026': { '1': { usage: 16, amount: null } },
      },
      [1, 3, 5],
      [2025, 2026],
      'amount',
    );
    expect(data).toEqual([
      { month: 1, monthLabel: '1月', y_2025: 5909, y_2026: null },
      { month: 3, monthLabel: '3月', y_2025: 6034, y_2026: null },
      { month: 5, monthLabel: '5月', y_2025: null, y_2026: null },
    ]);
  });
});
