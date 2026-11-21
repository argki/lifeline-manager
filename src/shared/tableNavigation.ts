export type FocusDirection = 'next' | 'prev';

export function cellFocusKey(year: number, month: number, field: 'usage' | 'amount'): string {
  return `cell:${year}:${month}:${field}`;
}

export function noteFocusKey(year: number): string {
  return `note:${year}`;
}

export const ADD_YEAR_FOCUS_KEY = 'action:add-year';

/**
 * 表内の実用的な Tab 遷移順序（月ごとの 使用量 → 金額 → 翌月 … → 備考 → 翌年 → 年追加ボタン）を構築する。
 */
export function buildTableFocusOrder(
  years: readonly number[],
  billingMonths: readonly number[],
  includeAddYear = true,
): string[] {
  const order: string[] = [];

  for (const year of years) {
    for (const month of billingMonths) {
      order.push(cellFocusKey(year, month, 'usage'));
      order.push(cellFocusKey(year, month, 'amount'));
    }
    order.push(noteFocusKey(year));
  }

  if (includeAddYear) {
    order.push(ADD_YEAR_FOCUS_KEY);
  }

  return order;
}

/**
 * 現在のフォーカスキーと移動方向から、次にフォーカスすべきキーを返す。
 * 範囲外（先頭で prev、末尾で next）の場合は null を返し、ブラウザ標準の Tab 遷移に委ねる。
 */
export function getAdjacentFocusKey(
  order: readonly string[],
  currentKey: string,
  direction: FocusDirection,
): string | null {
  const index = order.indexOf(currentKey);
  if (index === -1) return null;

  const targetIndex = direction === 'next' ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= order.length) {
    return null;
  }

  return order[targetIndex] ?? null;
}
