import { describe, expect, it } from 'vitest';
import { getEraGroup, parseWarekiYear, toWareki } from './wareki.js';

describe('wareki conversion', () => {
  it('converts western years to Wareki labels matching legacy Excel convention', () => {
    expect(toWareki(2005).shortLabel).toBe('H17');
    expect(toWareki(2017).shortLabel).toBe('H29');
    expect(toWareki(2018).shortLabel).toBe('H30');
    expect(toWareki(2019).shortLabel).toBe('H31');
    expect(toWareki(2020).shortLabel).toBe('R2');
    expect(toWareki(2026).shortLabel).toBe('R8');
    expect(toWareki(2026).displayLabel).toBe('2026 (R8)');
  });

  it('parses Wareki strings including full-width and R1/H31', () => {
    expect(parseWarekiYear('H17')).toBe(2005);
    expect(parseWarekiYear('H29')).toBe(2017);
    expect(parseWarekiYear('H31')).toBe(2019);
    expect(parseWarekiYear('R1')).toBe(2019);
    expect(parseWarekiYear('R2')).toBe(2020);
    expect(parseWarekiYear('Ｒ８')).toBe(2026);
    expect(parseWarekiYear('2026')).toBe(2026);
    expect(parseWarekiYear('')).toBeNull();
    expect(parseWarekiYear('invalid')).toBeNull();
  });

  it('classifies years into Heisei and Reiwa chart groups', () => {
    expect(getEraGroup(2005)).toBe('heisei');
    expect(getEraGroup(2018)).toBe('heisei');
    expect(getEraGroup(2019)).toBe('reiwa');
    expect(getEraGroup(2026)).toBe('reiwa');
  });
});
