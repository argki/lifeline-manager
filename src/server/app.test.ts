import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LifelineStore } from '../shared/types.js';
import { createApp } from './app.js';
import { createStoreRepository } from './store.js';

const tempDirs: string[] = [];

const SAMPLE_WATER_CSV = [
  '水道使用量,,,,,,,,,',
  ',,請求月,,,,,,,',
  ',,1月,3月,5月,7月,9月,11月,合計,平均',
  'H29,使用量㎡,,,,,, 5 , 5 , 5 ',
  ',金額,,,,,," 2,488 "," 2,488 "," 2,488 "',
].join('\n');

function setupTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeline-api-test-'));
  tempDirs.push(dir);
  const repo = createStoreRepository(dir);
  return { app: createApp(repo), dir };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Local API endpoints', () => {
  it('returns health status and initializes default store', async () => {
    const { app } = setupTestApp();
    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toMatchObject({ ok: true });

    const storeRes = await app.request('/api/store');
    expect(storeRes.status).toBe(200);
    const store = (await storeRes.json()) as LifelineStore;
    expect(store.sites).toHaveLength(1);
    expect(store.sites[0]?.name).toBe('拠点1');
  });

  it('supports site CRUD and prevents deleting the last site', async () => {
    const { app } = setupTestApp();
    const initialRes = await app.request('/api/store');
    const initial = (await initialRes.json()) as LifelineStore;
    const firstId = initial.sites[0]!.id;

    // 最後の1拠点は削除不可
    const deleteLastRes = await app.request(`/api/sites/${firstId}`, { method: 'DELETE' });
    expect(deleteLastRes.status).toBe(400);

    // 拠点追加
    const addRes = await app.request('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '拠点2' }),
    });
    expect(addRes.status).toBe(201);
    const addBody = (await addRes.json()) as {
      site: { id: string; name: string };
      store: LifelineStore;
    };
    expect(addBody.site.name).toBe('拠点2');
    expect(addBody.store.sites).toHaveLength(2);

    // 拠点名変更
    const renameRes = await app.request(`/api/sites/${addBody.site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '拠点B' }),
    });
    expect(renameRes.status).toBe(200);
    const renamed = (await renameRes.json()) as LifelineStore;
    expect(renamed.sites.find((s) => s.id === addBody.site.id)?.name).toBe('拠点B');

    // 拠点削除
    const delRes = await app.request(`/api/sites/${addBody.site.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    const afterDel = (await delRes.json()) as LifelineStore;
    expect(afterDel.sites).toHaveLength(1);
  });

  it('updates monthly entry, imports sample CSV, and exports/re-imports store', async () => {
    const { app } = setupTestApp();
    const storeRes = await app.request('/api/store');
    const store = (await storeRes.json()) as LifelineStore;
    const siteId = store.sites[0]!.id;

    // セル更新
    const patchRes = await app.request(`/api/sites/${siteId}/utilities/water/records/2026/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usage: 16, amount: 5909 }),
    });
    expect(patchRes.status).toBe(200);
    const afterPatch = (await patchRes.json()) as LifelineStore;
    expect(afterPatch.sites[0]?.utilities.water.records['2026']?.['1']).toEqual({
      usage: 16,
      amount: 5909,
    });

    // サンプルCSV取り込み
    const importCsvRes = await app.request(`/api/sites/${siteId}/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: SAMPLE_WATER_CSV }),
    });
    expect(importCsvRes.status).toBe(200);
    const importResult = (await importCsvRes.json()) as {
      detectedKind: string;
      importedYears: number[];
      store: LifelineStore;
    };
    expect(importResult.detectedKind).toBe('water');
    expect(importResult.importedYears).toContain(2017);

    // エクスポート & インポート
    const exportRes = await app.request('/api/export');
    expect(exportRes.status).toBe(200);
    const exportedJson = (await exportRes.json()) as LifelineStore;

    const reimportRes = await app.request('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportedJson),
    });
    expect(reimportRes.status).toBe(200);
  });

  it('updates and clears yearly notes and preserves them across export/import', async () => {
    const { app } = setupTestApp();
    const storeRes = await app.request('/api/store');
    const store = (await storeRes.json()) as LifelineStore;
    const siteId = store.sites[0]!.id;

    // 備考を保存
    const noteRes = await app.request(`/api/sites/${siteId}/utilities/water/notes/2026`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '節水シャワーヘッドに交換' }),
    });
    expect(noteRes.status).toBe(200);
    const afterNote = (await noteRes.json()) as LifelineStore;
    expect(afterNote.sites[0]?.utilities.water.notes?.['2026']).toBe('節水シャワーヘッドに交換');

    // エクスポート後に備考が保持されていること
    const exportRes = await app.request('/api/export');
    expect(exportRes.status).toBe(200);
    const exported = (await exportRes.json()) as LifelineStore;
    expect(exported.sites[0]?.utilities.water.notes?.['2026']).toBe('節水シャワーヘッドに交換');

    // 空文字送信で備考キーが削除されること
    const clearRes = await app.request(`/api/sites/${siteId}/utilities/water/notes/2026`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '   ' }),
    });
    expect(clearRes.status).toBe(200);
    const afterClear = (await clearRes.json()) as LifelineStore;
    expect(afterClear.sites[0]?.utilities.water.notes?.['2026']).toBeUndefined();
  });

  it('streams SSE store-updated events on mutations and ignores active-site changes', async () => {
    const { app } = setupTestApp();
    const storeRes = await app.request('/api/store');
    const store = (await storeRes.json()) as LifelineStore;
    const siteId = store.sites[0]!.id;

    const controller = new AbortController();
    const sseRes = await app.request('/api/events', { signal: controller.signal });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();

    const readChunkText = async () => {
      const result = await reader.read();
      if (result.done || !result.value) return '';
      return decoder.decode(result.value, { stream: true });
    };

    const firstChunk = await readChunkText();
    expect(firstChunk).toContain('event: connected');

    // active-site の切り替えは他ウィンドウへブロードキャストしない
    const activeRes = await app.request('/api/active-site', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': 'client-a',
      },
      body: JSON.stringify({ siteId }),
    });
    expect(activeRes.status).toBe(200);

    // セル更新時は store-updated イベントと sourceClientId が配信される
    const patchRes = await app.request(`/api/sites/${siteId}/utilities/water/records/2026/3`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': 'client-a',
      },
      body: JSON.stringify({ usage: 20, amount: 7000 }),
    });
    expect(patchRes.status).toBe(200);

    const updateChunk = await readChunkText();
    expect(updateChunk).toContain('event: store-updated');
    expect(updateChunk).toContain('"sourceClientId":"client-a"');

    controller.abort();
    await reader.cancel();
  });
});
