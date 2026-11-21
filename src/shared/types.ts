export type UtilityKind = 'water' | 'electricity' | 'gas';

export interface UtilityMeta {
  kind: UtilityKind;
  label: string;
  unit: string;
  decimalPlaces: number;
  billingMonths: number[];
  billingNote?: string;
}

export interface MonthlyEntry {
  usage: number | null;
  amount: number | null;
}

/** key: 月 ("1" 〜 "12") */
export type YearEntries = Record<string, MonthlyEntry>;

/** key: 西暦年 ("2005", "2017", "2026" 等) */
export type YearlyDataMap = Record<string, YearEntries>;

/** key: 西暦年 ("2005", "2017", "2026" 等) */
export type YearlyNotesMap = Record<string, string>;

export interface UtilityData {
  meta: UtilityMeta;
  records: YearlyDataMap;
  notes?: YearlyNotesMap;
}

export interface SiteData {
  id: string;
  name: string;
  utilities: Record<UtilityKind, UtilityData>;
}

export interface LifelineStore {
  version: 1;
  activeSiteId: string | null;
  sites: SiteData[];
  updatedAt: string;
}

export interface YearSummary {
  totalUsage: number | null;
  averageUsage: number | null;
  totalAmount: number | null;
  averageAmount: number | null;
  usageCount: number;
  amountCount: number;
}

export interface CsvImportResult {
  detectedKind: UtilityKind | null;
  records: YearlyDataMap;
  importedYears: number[];
  skippedRows: number;
}
