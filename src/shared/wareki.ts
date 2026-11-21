export type EraGroup = 'heisei' | 'reiwa' | 'other';

export interface WarekiInfo {
  year: number;
  eraCode: 'S' | 'H' | 'R' | '';
  eraName: string;
  eraYear: number;
  /** 短縮表記 (例: "H29", "H31", "R8") */
  shortLabel: string;
  /** 西暦併記 (例: "2026 (R8)") */
  displayLabel: string;
}

/**
 * 西暦を和暦情報へ変換する。
 * 2019年は従来のExcel表に合わせて H31 と表記する。
 */
export function toWareki(year: number): WarekiInfo {
  if (year >= 2020) {
    const eraYear = year - 2018;
    const shortLabel = `R${eraYear}`;
    return {
      year,
      eraCode: 'R',
      eraName: '令和',
      eraYear,
      shortLabel,
      displayLabel: `${year} (${shortLabel})`,
    };
  }
  if (year >= 1989) {
    const eraYear = year - 1988;
    const shortLabel = `H${eraYear}`;
    return {
      year,
      eraCode: 'H',
      eraName: '平成',
      eraYear,
      shortLabel,
      displayLabel: `${year} (${shortLabel})`,
    };
  }
  if (year >= 1926) {
    const eraYear = year - 1925;
    const shortLabel = `S${eraYear}`;
    return {
      year,
      eraCode: 'S',
      eraName: '昭和',
      eraYear,
      shortLabel,
      displayLabel: `${year} (${shortLabel})`,
    };
  }
  return {
    year,
    eraCode: '',
    eraName: '',
    eraYear: year,
    shortLabel: String(year),
    displayLabel: String(year),
  };
}

/**
 * 和暦文字列（例: "H17", "H31", "R1", "R8", "Ｒ８", "2026"）を西暦年へ変換する。
 */
export function parseWarekiYear(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toUpperCase();

  if (!normalized) {
    return null;
  }

  if (/^\d{4}$/.test(normalized)) {
    const y = Number(normalized);
    return Number.isInteger(y) && y >= 1900 && y <= 2200 ? y : null;
  }

  const match = normalized.match(/^([SHR]|令和|平成|昭和)\s*(\d{1,2})年?$/);
  if (!match) {
    return null;
  }

  const prefix = match[1];
  const eraYear = Number(match[2]);
  if (!Number.isInteger(eraYear) || eraYear <= 0) {
    return null;
  }

  switch (prefix) {
    case 'R':
    case '令和':
      return 2018 + eraYear;
    case 'H':
    case '平成':
      return 1988 + eraYear;
    case 'S':
    case '昭和':
      return 1925 + eraYear;
    default:
      return null;
  }
}

/**
 * 現行Excelのグラフグループ分け（平成: H1〜H30, 令和: H31/R1〜）を返す。
 */
export function getEraGroup(year: number): EraGroup {
  if (year >= 2019) {
    return 'reiwa';
  }
  if (year >= 1989) {
    return 'heisei';
  }
  return 'other';
}
