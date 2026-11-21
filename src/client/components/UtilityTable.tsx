import { useEffect, useState } from 'react';
import { Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import { calculateYearSummary, getSortedYears } from '../../shared/aggregation.js';
import type { UtilityMeta, YearlyDataMap, YearlyNotesMap } from '../../shared/types.js';
import { toWareki } from '../../shared/wareki.js';

interface UtilityTableProps {
  meta: UtilityMeta;
  records: YearlyDataMap;
  notes?: YearlyNotesMap;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChangeCell: (year: number, month: number, field: 'usage' | 'amount', value: number | null) => void;
  onChangeNote: (year: number, note: string) => void;
  onAddYear: (year: number) => void;
  onDeleteYear: (year: number) => void;
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

interface NoteCellInputProps {
  value: string;
  ariaLabel: string;
  onCommit: (next: string) => void;
}

function NoteCellInput({ value, ariaLabel, onCommit }: NoteCellInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <textarea
      className="note-input"
      aria-label={ariaLabel}
      placeholder="備考を入力..."
      rows={2}
      value={editing ? draft : value}
      onFocus={() => {
        setEditing(true);
        setDraft(value);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          (e.currentTarget as HTMLTextAreaElement).blur();
        } else if (e.key === 'Escape') {
          setEditing(false);
          setDraft(value);
          (e.currentTarget as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

export function UtilityTable({
  meta,
  records,
  notes,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onChangeCell,
  onChangeNote,
  onAddYear,
  onDeleteYear,
}: UtilityTableProps) {
  const years = getSortedYears(records);
  const currentYear = new Date().getFullYear();
  const nextYear = years.length > 0 ? years[years.length - 1]! + 1 : currentYear;
  const lastYear = years.length > 0 ? years[years.length - 1]! : null;
  const canAddYear = nextYear <= 2100;

  const addTooltip = canAddYear
    ? `${nextYear} (${toWareki(nextYear).shortLabel}) 年を追加`
    : 'これ以上の年は追加できません';
  const deleteTooltip =
    lastYear !== null
      ? `${lastYear} (${toWareki(lastYear).shortLabel}) 年を削除`
      : '削除できる年がありません';

  const handleAddNextYear = () => {
    if (!canAddYear) return;
    onAddYear(nextYear);
  };

  const handleDeleteLastYear = () => {
    if (lastYear === null) return;

    const yearEntries = records[String(lastYear)] ?? {};
    const filledMonths = Object.values(yearEntries).filter(
      (entry) => entry.usage !== null || entry.amount !== null,
    ).length;
    const wareki = toWareki(lastYear).shortLabel;

    const message =
      filledMonths > 0
        ? `${lastYear}年 (${wareki}) には ${filledMonths} ヶ月分のデータがあります。\n本当に削除しますか？（削除後も「元に戻す (Ctrl+Z)」で復元できます）`
        : `${lastYear}年 (${wareki}) の行を削除しますか？`;

    if (!window.confirm(message)) return;
    onDeleteYear(lastYear);
  };

  return (
    <section className="card">
      <div className="card-header">
        <div className="card-title-group">
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
                <th></th>
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
              <th className="note-header">備考</th>
            </tr>
          </thead>
          <tbody>
            {years.length === 0 ? (
              <tr>
                <td colSpan={meta.billingMonths.length + 5} style={{ textAlign: 'center', padding: 24 }}>
                  データがありません。下の「＋」ボタンから年を追加するか、右上の「管理・移行」→「データ移行・バックアップ」から CSV を取り込んでください。
                </td>
              </tr>
            ) : (
              years.map((year) => {
                const yearKey = String(year);
                const entries = records[yearKey] ?? {};
                const note = notes?.[yearKey] ?? '';
                const summary = calculateYearSummary(entries, meta.billingMonths, meta.decimalPlaces);
                const wareki = toWareki(year);

                return (
                  <FragmentRows
                    key={year}
                    year={year}
                    warekiLabel={wareki.shortLabel}
                    meta={meta}
                    entries={entries}
                    note={note}
                    summary={summary}
                    onChangeCell={onChangeCell}
                    onChangeNote={onChangeNote}
                  />
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="year-actions-cell">
                <div className="year-actions">
                  <button
                    type="button"
                    className="year-action-btn year-action-add"
                    onClick={handleAddNextYear}
                    disabled={!canAddYear}
                    data-tooltip={addTooltip}
                    aria-label={addTooltip}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    className="year-action-btn year-action-remove"
                    onClick={handleDeleteLastYear}
                    disabled={lastYear === null}
                    data-tooltip={deleteTooltip}
                    aria-label={deleteTooltip}
                  >
                    <Minus size={14} />
                  </button>
                </div>
              </td>
              <td colSpan={meta.billingMonths.length + 4} className="year-actions-spacer" />
            </tr>
          </tfoot>
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
  note: string;
  summary: ReturnType<typeof calculateYearSummary>;
  onChangeCell: (year: number, month: number, field: 'usage' | 'amount', value: number | null) => void;
  onChangeNote: (year: number, note: string) => void;
}

function FragmentRows({
  year,
  warekiLabel,
  meta,
  entries,
  note,
  summary,
  onChangeCell,
  onChangeNote,
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
        <td rowSpan={2} className="note-cell">
          <NoteCellInput
            value={note}
            ariaLabel={`${year}年 備考`}
            onCommit={(val) => onChangeNote(year, val)}
          />
        </td>
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
