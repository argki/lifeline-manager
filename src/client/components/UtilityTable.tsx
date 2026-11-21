import { useEffect, useState } from 'react';
import { Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import { calculateYearSummary, getSortedYears } from '../../shared/aggregation.js';
import type { UtilityMeta, YearlyDataMap } from '../../shared/types.js';
import { toWareki } from '../../shared/wareki.js';

interface UtilityTableProps {
  meta: UtilityMeta;
  records: YearlyDataMap;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChangeCell: (year: number, month: number, field: 'usage' | 'amount', value: number | null) => void;
  onAddYear: (year: number) => void;
  onDeleteYear: (year: number) => void;
  onError: (message: string) => void;
}

interface NumericCellInputProps {
  value: number | null;
  decimalPlaces: number;
  ariaLabel: string;
  onCommit: (next: number | null) => void;
}

function formatNumber(value: number | null, decimalPlaces: number): string {
  if (value === null) return '-';
  if (decimalPlaces === 0) {
    return Math.round(value).toLocaleString('ja-JP');
  }
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

function NumericCellInput({ value, decimalPlaces, ariaLabel, onCommit }: NumericCellInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!editing) {
      setDraft(value === null ? '' : String(value));
    }
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim().replace(/,/g, '');
    if (trimmed === '') {
      if (value !== null) onCommit(null);
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    const factor = 10 ** decimalPlaces;
    const rounded = Math.round(num * factor) / factor;
    if (rounded !== value) {
      onCommit(rounded);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className="cell-input"
      aria-label={ariaLabel}
      value={
        editing
          ? draft
          : value === null
            ? ''
            : value.toLocaleString('ja-JP', {
                minimumFractionDigits: 0,
                maximumFractionDigits: decimalPlaces,
              })
      }
      onFocus={() => {
        setEditing(true);
        setDraft(value === null ? '' : String(value));
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setEditing(false);
          setDraft(value === null ? '' : String(value));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function UtilityTable({
  meta,
  records,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onChangeCell,
  onAddYear,
  onDeleteYear,
  onError,
}: UtilityTableProps) {
  const years = getSortedYears(records);
  const currentYear = new Date().getFullYear();
  const nextSuggestedYear = years.length > 0 ? years[years.length - 1]! + 1 : currentYear;
  const [targetYearInput, setTargetYearInput] = useState<string>(String(nextSuggestedYear));

  useEffect(() => {
    setTargetYearInput(String(nextSuggestedYear));
  }, [nextSuggestedYear]);

  const parseTargetYear = (): number | null => {
    const trimmed = targetYearInput.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      onError('西暦4桁の年（例: 2026）を入力してください');
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1989 || parsed > 2100) {
      onError('1989〜2100 の範囲の西暦年を入力してください');
      return null;
    }
    return parsed;
  };

  const handleAddYear = () => {
    const parsed = parseTargetYear();
    if (parsed === null) return;
    onAddYear(parsed);
  };

  const handleDeleteYear = () => {
    const target = parseTargetYear();
    if (target === null) return;

    const yearEntries = records[String(target)];
    if (!yearEntries) {
      onError(`${target}年は登録されていないため削除できません`);
      return;
    }

    const filledMonths = Object.values(yearEntries).filter(
      (entry) => entry.usage !== null || entry.amount !== null,
    ).length;
    const wareki = toWareki(target).shortLabel;

    const message =
      filledMonths > 0
        ? `${target}年 (${wareki}) には ${filledMonths} ヶ月分のデータがあります。\n本当に削除しますか？（削除後も「元に戻す (Ctrl+Z)」で復元できます）`
        : `${target}年 (${wareki}) の行を削除しますか？`;

    if (!window.confirm(message)) return;
    onDeleteYear(target);
  };

  const parsedPreviewYear = /^\d{4}$/.test(targetYearInput.trim())
    ? Number(targetYearInput.trim())
    : null;
  const addYearLabel =
    parsedPreviewYear && parsedPreviewYear >= 1989 && parsedPreviewYear <= 2100
      ? ` (${toWareki(parsedPreviewYear).shortLabel})`
      : '';

  return (
    <section className="card">
      <div className="card-header">
        <div className="card-title-group">
          <h2 className="card-title">{meta.label}</h2>
          {meta.billingNote && <span className="billing-note">{meta.billingNote}</span>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className="btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="元に戻す (Ctrl+Z)"
          >
            <Undo2 size={15} />
            元に戻す
          </button>
          <button
            type="button"
            className="btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="やり直す (Ctrl+Y)"
          >
            <Redo2 size={15} />
            やり直す
          </button>

          <span style={{ color: 'var(--border)' }}>|</span>

          <input
            type="text"
            inputMode="numeric"
            value={targetYearInput}
            onChange={(e) => setTargetYearInput(e.target.value)}
            style={{
              width: 82,
              padding: '5px 8px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: '0.85rem',
            }}
            aria-label="追加・削除する西暦年"
          />
          <button type="button" className="btn btn-primary" onClick={handleAddYear}>
            <Plus size={15} />
            年を追加{addYearLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDeleteYear}
            disabled={years.length === 0}
            title="入力欄の西暦年を削除"
          >
            <Trash2 size={15} />
            年を削除
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table className="utility-table">
          <thead>
            {meta.kind === 'electricity' && (
              <tr className="sub-header">
                <th colSpan={2}>請求月</th>
                {meta.billingMonths.map((m) => (
                  <th key={m}>{(m % 12) + 1}月請求</th>
                ))}
                <th colSpan={2}>年次集計</th>
              </tr>
            )}
            <tr>
              <th>年</th>
              <th>項目</th>
              {meta.billingMonths.map((m) => (
                <th key={m}>{m}月</th>
              ))}
              <th>合計</th>
              <th>平均</th>
            </tr>
          </thead>
          <tbody>
            {years.length === 0 ? (
              <tr>
                <td colSpan={meta.billingMonths.length + 4} style={{ textAlign: 'center', padding: 24 }}>
                  データがありません。「年を追加」または右上の「データ移行」から CSV を取り込んでください。
                </td>
              </tr>
            ) : (
              years.map((year) => {
                const yearKey = String(year);
                const entries = records[yearKey] ?? {};
                const summary = calculateYearSummary(entries, meta.billingMonths, meta.decimalPlaces);
                const wareki = toWareki(year);

                return (
                  <FragmentRows
                    key={year}
                    year={year}
                    warekiLabel={wareki.shortLabel}
                    meta={meta}
                    entries={entries}
                    summary={summary}
                    onChangeCell={onChangeCell}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface FragmentRowsProps {
  year: number;
  warekiLabel: string;
  meta: UtilityMeta;
  entries: YearlyDataMap[string];
  summary: ReturnType<typeof calculateYearSummary>;
  onChangeCell: (year: number, month: number, field: 'usage' | 'amount', value: number | null) => void;
}

function FragmentRows({
  year,
  warekiLabel,
  meta,
  entries,
  summary,
  onChangeCell,
}: FragmentRowsProps) {
  return (
    <>
      <tr>
        <td rowSpan={2} className="year-cell">
          <div>{warekiLabel}</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>
            {year}
          </div>
        </td>
        <td className="unit-cell">{meta.unit}</td>
        {meta.billingMonths.map((m) => {
          const entry = entries[String(m)];
          return (
            <td key={m}>
              <NumericCellInput
                value={entry?.usage ?? null}
                decimalPlaces={meta.decimalPlaces}
                ariaLabel={`${year}年${m}月 使用量`}
                onCommit={(val) => onChangeCell(year, m, 'usage', val)}
              />
            </td>
          );
        })}
        <td className="summary-cell">{formatNumber(summary.totalUsage, meta.decimalPlaces)}</td>
        <td className="summary-cell">{formatNumber(summary.averageUsage, meta.decimalPlaces)}</td>
      </tr>
      <tr className={`amount-row-${meta.kind}`}>
        <td className="unit-cell">円</td>
        {meta.billingMonths.map((m) => {
          const entry = entries[String(m)];
          return (
            <td key={m}>
              <NumericCellInput
                value={entry?.amount ?? null}
                decimalPlaces={0}
                ariaLabel={`${year}年${m}月 金額`}
                onCommit={(val) => onChangeCell(year, m, 'amount', val)}
              />
            </td>
          );
        })}
        <td className="summary-cell">{formatNumber(summary.totalAmount, 0)}</td>
        <td className="summary-cell">{formatNumber(summary.averageAmount, 0)}</td>
      </tr>
    </>
  );
}
