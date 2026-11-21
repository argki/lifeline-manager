import type { LifelineStore, SiteData, UtilityKind, UtilityMeta } from './types.js';

export const UTILITY_KINDS: readonly UtilityKind[] = ['water', 'electricity', 'gas'] as const;

export const DEFAULT_UTILITY_METAS: Record<UtilityKind, UtilityMeta> = {
  water: {
    kind: 'water',
    label: '水道使用量',
    unit: '㎥',
    decimalPlaces: 0,
    billingMonths: [1, 3, 5, 7, 9, 11],
    billingNote: '請求月（隔月）',
  },
  electricity: {
    kind: 'electricity',
    label: '東京電力',
    unit: 'kWh',
    decimalPlaces: 1,
    billingMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    billingNote: '利用月表示（翌月請求：1月利用＝2月請求）',
  },
  gas: {
    kind: 'gas',
    label: 'プロパンガス',
    unit: '㎥',
    decimalPlaces: 1,
    billingMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
};

export function roundTo(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function createDefaultSite(id: string, name: string): SiteData {
  return {
    id,
    name,
    utilities: {
      water: { meta: { ...DEFAULT_UTILITY_METAS.water }, records: {} },
      electricity: { meta: { ...DEFAULT_UTILITY_METAS.electricity }, records: {} },
      gas: { meta: { ...DEFAULT_UTILITY_METAS.gas }, records: {} },
    },
  };
}

export function createEmptyStore(): LifelineStore {
  const defaultSite = createDefaultSite('site-1', '拠点1');
  return {
    version: 1,
    activeSiteId: defaultSite.id,
    sites: [defaultSite],
    updatedAt: new Date().toISOString(),
  };
}
