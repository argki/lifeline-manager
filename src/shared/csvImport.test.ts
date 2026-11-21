import { describe, expect, it } from 'vitest';
import { calculateYearSummary } from './aggregation.js';
import {
  exportUtilityToCsv,
  mergeYearlyRecords,
  parseExcelExportCsv,
  validateStoreJson,
} from './csvImport.js';
import { createEmptyStore, DEFAULT_UTILITY_METAS } from './utilities.js';

const SAMPLE_GAS_CSV = [
  'プロパンガス,,,,,,,,,,,,,,,,,',
  ',,1月,2月,3月,4月,5月,6月,7月,8月,9月,10月,11月,12月,計,平均,,',
  'H23,㎥,10.0 ,12.0 ,8.0 ,16+9,5.0 ,4.0 ,3.0 ,2.0 ,2.0 ,3.0 ,4.0 ,6.0 ,80.0 ,6.7 ,,',
  ',円," 5,000 "," 5,500 "," 4,500 ", 2275+7308 ," 3,500 "," 3,000 "," 2,500 "," 2,000 "," 2,000 "," 2,500 "," 3,000 "," 4,000 "," 45,083 "," 3,757 ",,',
  'R8,㎥,4.8 ,4.6 ,4.1 ,,,,,,,,,,13.5 ,4.5 ,,',
  ',円," 4,987 "," 4,859 "," 3,440 ",,,,,,,,,," 13,286 "," 4,429 ",,',
  'R9,㎥,,,,,,,,,,,,,0.0 ,#DIV/0!,,',
  ',円,,,,,,,,,,,,, - ,#DIV/0!,,',
  ',㎥,,,,,,,,,,,,,0.0 ,#DIV/0!,,',
].join('\n');

const SAMPLE_ELECTRICITY_CSV = [
  '電力,,２月請求,３月請求,４月請求,５月請求,６月請求,７月請求,８月請求,９月請求,１０月請求,１１月請求,１２月請求,1月請求,,,,',
  ',, 1月 , 2月 , 3月 , 4月 , 5月 , 6月 , 7月 , 8月 , 9月 , 10月 , 11月 , 12月 , 計 , 平均 ,,',
  'R4,ｋWh,400.0 ,350.0 ,300.0 ,250.0 ,200.0 ,220.0 ,310.0 ,390.0 ,280.0 ,240.0 ,320.0 ,380.0 ,"3,640.0 ",303.3 ,77.2,267',
  ',円," 12,000 "," 10,500 "," 9,000 "," 7,500 "," 6,000 "," 6,600 "," 9,300 "," 11,700 "," 8,400 "," 7,200 "," 9,600 "," 11,400 "," 109,200 "," 9,100 ",3143,9256',
].join('\n');

const SAMPLE_WATER_CSV = [
  '水道使用量,,,,,,,,,',
  ',,請求月,,,,,,,',
  ',,1月,3月,5月,7月,9月,11月,合計,平均',
  'H17,使用量㎡,,,,,, 45 , 45 , 45 ',
  ',金額,,,,,," 12,473 "," 12,473 "," 12,473 "',
  'R5,使用量㎡, 17 , 17 , 17 , 18 , 15 , 16 , 100 , 17 ',
  ',金額," 5,509 "," 5,509 "," 5,509 "," 5,572 "," 5,384 ",," 27,483 "," 5,497 "',
].join('\n');

describe('csvImport with sample CSV fixtures', () => {
  it('parses monthly gas CSV including plus-separated cells and ignores blank/DIV0 rows', () => {
    const result = parseExcelExportCsv(SAMPLE_GAS_CSV);

    expect(result.detectedKind).toBe('gas');
    expect(result.importedYears).toEqual([2011, 2026]);
    expect(result.records['2011']?.['4']).toEqual({ usage: 25, amount: 9583 });

    const r8 = calculateYearSummary(
      result.records['2026'],
      DEFAULT_UTILITY_METAS.gas.billingMonths,
      1,
    );
    expect(r8.totalUsage).toBe(13.5);
    expect(r8.averageUsage).toBe(4.5);
    expect(r8.totalAmount).toBe(13286);
    expect(r8.averageAmount).toBe(4429);
  });

  it('parses electricity CSV with full-width kWh and ignores extra memo columns', () => {
    const result = parseExcelExportCsv(SAMPLE_ELECTRICITY_CSV);

    expect(result.detectedKind).toBe('electricity');
    const r4 = calculateYearSummary(
      result.records['2022'],
      DEFAULT_UTILITY_METAS.electricity.billingMonths,
      1,
    );
    expect(r4.totalUsage).toBe(3640.0);
    expect(r4.averageUsage).toBe(303.3);
    expect(r4.totalAmount).toBe(109200);
    expect(r4.averageAmount).toBe(9100);
  });

  it('parses bimonthly water CSV from H17 and handles partial missing amount', () => {
    const result = parseExcelExportCsv(SAMPLE_WATER_CSV);

    expect(result.detectedKind).toBe('water');
    expect(result.importedYears).toEqual([2005, 2023]);

    const r5 = calculateYearSummary(
      result.records['2023'],
      DEFAULT_UTILITY_METAS.water.billingMonths,
      0,
    );
    expect(r5.totalUsage).toBe(100);
    expect(r5.usageCount).toBe(6);
    expect(r5.totalAmount).toBe(27483);
    expect(r5.amountCount).toBe(5);
  });

  it('exports and re-imports CSV and validates store JSON', () => {
    const parsed = parseExcelExportCsv(SAMPLE_WATER_CSV);
    const exported = exportUtilityToCsv(DEFAULT_UTILITY_METAS.water, parsed.records);
    const reparsed = parseExcelExportCsv(exported);

    expect(reparsed.records['2023']).toEqual(parsed.records['2023']);

    const merged = mergeYearlyRecords(
      { '2026': { '1': { usage: 10, amount: 1000 } } },
      { '2026': { '1': { usage: 16, amount: null } } },
    );
    expect(merged['2026']?.['1']).toEqual({ usage: 16, amount: 1000 });

    const store = createEmptyStore();
    expect(validateStoreJson(store)).toEqual(store);
  });
});
