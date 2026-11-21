import { describe, expect, it } from 'vitest';
import {
  ADD_YEAR_FOCUS_KEY,
  buildTableFocusOrder,
  cellFocusKey,
  getAdjacentFocusKey,
  noteFocusKey,
} from './tableNavigation.js';

describe('tableNavigation', () => {
  it('builds month-by-month usage -> amount -> note order across years', () => {
    const order = buildTableFocusOrder([2025, 2026], [1, 3]);

    expect(order).toEqual([
      cellFocusKey(2025, 1, 'usage'),
      cellFocusKey(2025, 1, 'amount'),
      cellFocusKey(2025, 3, 'usage'),
      cellFocusKey(2025, 3, 'amount'),
      noteFocusKey(2025),
      cellFocusKey(2026, 1, 'usage'),
      cellFocusKey(2026, 1, 'amount'),
      cellFocusKey(2026, 3, 'usage'),
      cellFocusKey(2026, 3, 'amount'),
      noteFocusKey(2026),
      ADD_YEAR_FOCUS_KEY,
    ]);
  });

  it('moves from final month usage to final month amount, then note, then next year', () => {
    const order = buildTableFocusOrder([2025, 2026], [1, 2, 12]);

    const decUsage = cellFocusKey(2025, 12, 'usage');
    const decAmount = cellFocusKey(2025, 12, 'amount');
    const note2025 = noteFocusKey(2025);
    const nextYearJanUsage = cellFocusKey(2026, 1, 'usage');

    expect(getAdjacentFocusKey(order, decUsage, 'next')).toBe(decAmount);
    expect(getAdjacentFocusKey(order, decAmount, 'next')).toBe(note2025);
    expect(getAdjacentFocusKey(order, note2025, 'next')).toBe(nextYearJanUsage);
  });

  it('moves from last year note to add-year button and supports full reverse navigation', () => {
    const order = buildTableFocusOrder([2026], [1, 12]);

    expect(getAdjacentFocusKey(order, noteFocusKey(2026), 'next')).toBe(ADD_YEAR_FOCUS_KEY);
    expect(getAdjacentFocusKey(order, ADD_YEAR_FOCUS_KEY, 'prev')).toBe(noteFocusKey(2026));
    expect(getAdjacentFocusKey(order, noteFocusKey(2026), 'prev')).toBe(
      cellFocusKey(2026, 12, 'amount'),
    );
    expect(getAdjacentFocusKey(order, cellFocusKey(2026, 12, 'amount'), 'prev')).toBe(
      cellFocusKey(2026, 12, 'usage'),
    );
  });

  it('returns null at boundaries so browser default Tab takes over', () => {
    const order = buildTableFocusOrder([2026], [1]);

    expect(getAdjacentFocusKey(order, cellFocusKey(2026, 1, 'usage'), 'prev')).toBeNull();
    expect(getAdjacentFocusKey(order, ADD_YEAR_FOCUS_KEY, 'next')).toBeNull();
    expect(getAdjacentFocusKey(order, 'unknown-key', 'next')).toBeNull();
  });
});
