import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildChartData,
  getSortedYears,
  getYearSeriesLabel,
  type ChartMetric,
} from '../../shared/aggregation.js';
import type { UtilityMeta, YearlyDataMap } from '../../shared/types.js';

interface UsageChartsProps {
  meta: UtilityMeta;
  records: YearlyDataMap;
}

const LINE_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#be123c',
  '#0d9488',
  '#ca8a04',
  '#65a30d',
  '#db2777',
];

export function UsageCharts({ meta, records }: UsageChartsProps) {
  const allYears = useMemo(() => getSortedYears(records), [records]);
  const [selectedYears, setSelectedYears] = useState<number[]>(allYears);
  const [metric, setMetric] = useState<ChartMetric>('usage');

  useEffect(() => {
    setSelectedYears((prev) => {
      const prevSet = new Set(prev);
      const next = allYears.filter((y) => prevSet.has(y));
      for (const y of allYears) {
        if (!prevSet.has(y) && prev.length === 0) {
          next.push(y);
        }
      }
      return next.length > 0 ? next : allYears;
    });
  }, [allYears]);

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year].sort((a, b) => a - b),
    );
  };

  const chartData = useMemo(
    () => buildChartData(records, meta.billingMonths, selectedYears, metric),
    [records, meta.billingMonths, selectedYears, metric],
  );

  if (allYears.length === 0) {
    return null;
  }

  const metricLabel = metric === 'usage' ? '使用量' : '金額';
  const metricUnit = metric === 'usage' ? meta.unit : '円';

  return (
    <section className="card">
      <div className="card-header">
        <div className="card-title-group">
          <h2 className="card-title">{metricLabel}推移グラフ</h2>
          <span className="billing-note">単位: {metricUnit}</span>
          <div className="metric-toggle" role="group" aria-label="グラフ表示指標">
            <button
              type="button"
              className={`metric-toggle-btn ${metric === 'usage' ? 'active' : ''}`}
              aria-pressed={metric === 'usage'}
              onClick={() => setMetric('usage')}
            >
              使用量 ({meta.unit})
            </button>
            <button
              type="button"
              className={`metric-toggle-btn ${metric === 'amount' ? 'active' : ''}`}
              aria-pressed={metric === 'amount'}
              onClick={() => setMetric('amount')}
            >
              金額 (円)
            </button>
          </div>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <button type="button" className="btn" onClick={() => setSelectedYears(allYears)}>
            すべて選択
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSelectedYears(allYears.slice(-5))}
          >
            直近5年
          </button>
          <button type="button" className="btn" onClick={() => setSelectedYears([])}>
            すべて解除
          </button>
        </div>
      </div>

      <div className="year-filter-bar">
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>表示年:</span>
        {allYears.map((y) => (
          <label key={y} className="year-chip">
            <input
              type="checkbox"
              checked={selectedYears.includes(y)}
              onChange={() => toggleYear(y)}
            />
            {getYearSeriesLabel(y)}
          </label>
        ))}
      </div>

      <div className="chart-panel">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="monthLabel" />
            <YAxis
              width={68}
              tickFormatter={(value: number) => value.toLocaleString('ja-JP')}
              label={{
                value: `${metricLabel} [${metricUnit}]`,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 12, fill: '#475569' },
              }}
            />
            <Tooltip
              formatter={(value) => {
                if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
                const formatted =
                  metric === 'amount'
                    ? Math.round(value).toLocaleString('ja-JP')
                    : value.toLocaleString('ja-JP', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: meta.decimalPlaces,
                      });
                return `${formatted} ${metricUnit}`;
              }}
              itemSorter={(item) =>
                typeof item.value === 'number' && Number.isFinite(item.value)
                  ? -item.value
                  : Number.POSITIVE_INFINITY
              }
            />
            <Legend />
            {selectedYears.map((year, idx) => (
              <Line
                key={year}
                type="monotone"
                dataKey={`y_${year}`}
                name={getYearSeriesLabel(year)}
                stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
