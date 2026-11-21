import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import {
  mergeYearlyRecords,
  parseExcelExportCsv,
  validateStoreJson,
} from '../shared/csvImport.js';
import type { UtilityKind, YearlyDataMap, YearlyNotesMap } from '../shared/types.js';
import { createDefaultSite, UTILITY_KINDS } from '../shared/utilities.js';
import type { StoreRepository } from './store.js';

function isUtilityKind(value: string): value is UtilityKind {
  return (UTILITY_KINDS as readonly string[]).includes(value);
}

function createSiteId(): string {
  return `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createApp(repo: StoreRepository, clientDistDir?: string): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => {
    return c.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/store', async (c) => {
    const store = await repo.load();
    return c.json(store);
  });

  app.put('/api/active-site', async (c) => {
    const body = await c.req.json<{ siteId?: string }>();
    if (!body.siteId) {
      return c.json({ error: 'siteId is required' }, 400);
    }
    try {
      const updated = await repo.update((current) => {
        const exists = current.sites.some((s) => s.id === body.siteId);
        if (!exists) {
          throw new Error('SITE_NOT_FOUND');
        }
        return { ...current, activeSiteId: body.siteId! };
      });
      return c.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.post('/api/sites', async (c) => {
    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim();
    if (!name) {
      return c.json({ error: '拠点名を入力してください' }, 400);
    }

    const newSite = createDefaultSite(createSiteId(), name);
    const updated = await repo.update((current) => ({
      ...current,
      activeSiteId: newSite.id,
      sites: [...current.sites, newSite],
    }));
    return c.json({ site: newSite, store: updated }, 201);
  });

  app.patch('/api/sites/:siteId', async (c) => {
    const siteId = c.req.param('siteId');
    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim();
    if (!name) {
      return c.json({ error: '拠点名を入力してください' }, 400);
    }

    try {
      const updated = await repo.update((current) => {
        const idx = current.sites.findIndex((s) => s.id === siteId);
        if (idx === -1) throw new Error('SITE_NOT_FOUND');
        const sites = [...current.sites];
        sites[idx] = { ...sites[idx]!, name };
        return { ...current, sites };
      });
      return c.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.delete('/api/sites/:siteId', async (c) => {
    const siteId = c.req.param('siteId');
    try {
      const updated = await repo.update((current) => {
        if (current.sites.length <= 1) {
          throw new Error('LAST_SITE');
        }
        const filtered = current.sites.filter((s) => s.id !== siteId);
        if (filtered.length === current.sites.length) {
          throw new Error('SITE_NOT_FOUND');
        }
        const nextActive =
          current.activeSiteId === siteId ? (filtered[0]?.id ?? null) : current.activeSiteId;
        return { ...current, activeSiteId: nextActive, sites: filtered };
      });
      return c.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === 'LAST_SITE') {
        return c.json({ error: '最後の拠点は削除できません' }, 400);
      }
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.put('/api/sites/:siteId/utilities/:kind/records', async (c) => {
    const siteId = c.req.param('siteId');
    const kind = c.req.param('kind');
    if (!isUtilityKind(kind)) {
      return c.json({ error: 'Invalid utility kind' }, 400);
    }
    const body = await c.req.json<{ records?: YearlyDataMap; notes?: YearlyNotesMap }>();
    if (!body.records || typeof body.records !== 'object') {
      return c.json({ error: 'records is required' }, 400);
    }

    try {
      const updated = await repo.update((current) => {
        const idx = current.sites.findIndex((s) => s.id === siteId);
        if (idx === -1) throw new Error('SITE_NOT_FOUND');
        const sites = [...current.sites];
        const target = sites[idx]!;
        const prevUtil = target.utilities[kind];
        sites[idx] = {
          ...target,
          utilities: {
            ...target.utilities,
            [kind]: {
              ...prevUtil,
              records: body.records!,
              ...(body.notes !== undefined ? { notes: body.notes } : {}),
            },
          },
        };
        return { ...current, sites };
      });
      return c.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.patch('/api/sites/:siteId/utilities/:kind/notes/:year', async (c) => {
    const { siteId, kind, year } = c.req.param();
    if (!isUtilityKind(kind)) {
      return c.json({ error: 'Invalid utility kind' }, 400);
    }
    if (!/^\d{4}$/.test(year)) {
      return c.json({ error: 'Invalid year' }, 400);
    }

    const body = await c.req.json<{ note?: unknown }>();
    if (typeof body.note !== 'string') {
      return c.json({ error: 'note must be a string' }, 400);
    }
    const noteText = body.note;

    try {
      const updated = await repo.update((current) => {
        const idx = current.sites.findIndex((s) => s.id === siteId);
        if (idx === -1) throw new Error('SITE_NOT_FOUND');
        const sites = [...current.sites];
        const target = sites[idx]!;
        const util = target.utilities[kind];
        const nextNotes: YearlyNotesMap = { ...(util.notes ?? {}) };
        if (noteText.trim() === '') {
          delete nextNotes[year];
        } else {
          nextNotes[year] = noteText;
        }
        sites[idx] = {
          ...target,
          utilities: {
            ...target.utilities,
            [kind]: {
              ...util,
              notes: nextNotes,
            },
          },
        };
        return { ...current, sites };
      });
      return c.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.patch('/api/sites/:siteId/utilities/:kind/records/:year/:month', async (c) => {
    const { siteId, kind, year, month } = c.req.param();
    if (!isUtilityKind(kind)) {
      return c.json({ error: 'Invalid utility kind' }, 400);
    }
    const monthNum = Number(month);
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return c.json({ error: 'Invalid month' }, 400);
    }

    const body = await c.req.json<{ usage?: number | null; amount?: number | null }>();

    try {
      const updated = await repo.update((current) => {
        const idx = current.sites.findIndex((s) => s.id === siteId);
        if (idx === -1) throw new Error('SITE_NOT_FOUND');
        const sites = [...current.sites];
        const target = sites[idx]!;
        const util = target.utilities[kind];
        const prevYear = util.records[year] ?? {};
        const prevEntry = prevYear[month] ?? { usage: null, amount: null };
        const nextEntry = {
          usage: body.usage !== undefined ? body.usage : prevEntry.usage,
          amount: body.amount !== undefined ? body.amount : prevEntry.amount,
        };
        sites[idx] = {
          ...target,
          utilities: {
            ...target.utilities,
            [kind]: {
              ...util,
              records: {
                ...util.records,
                [year]: {
                  ...prevYear,
                  [month]: nextEntry,
                },
              },
            },
          },
        };
        return { ...current, sites };
      });
      return c.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.post('/api/sites/:siteId/import-csv', async (c) => {
    const siteId = c.req.param('siteId');
    const body = await c.req.json<{
      csvText?: string;
      kind?: UtilityKind;
      mode?: 'merge' | 'replace';
    }>();

    if (!body.csvText || typeof body.csvText !== 'string') {
      return c.json({ error: 'csvText is required' }, 400);
    }

    const parsed = parseExcelExportCsv(body.csvText);
    const targetKind = body.kind ?? parsed.detectedKind;
    if (!targetKind || !isUtilityKind(targetKind)) {
      return c.json(
        { error: '種別（水道・電力・ガス）を自動判別できませんでした。種別を指定してください。' },
        400,
      );
    }
    if (parsed.importedYears.length === 0) {
      return c.json({ error: '取り込み可能な年次データが見つかりませんでした' }, 400);
    }

    const mode = body.mode ?? 'merge';
    try {
      const updated = await repo.update((current) => {
        const idx = current.sites.findIndex((s) => s.id === siteId);
        if (idx === -1) throw new Error('SITE_NOT_FOUND');
        const sites = [...current.sites];
        const target = sites[idx]!;
        const util = target.utilities[targetKind];
        const nextRecords =
          mode === 'replace'
            ? parsed.records
            : mergeYearlyRecords(util.records, parsed.records);

        sites[idx] = {
          ...target,
          utilities: {
            ...target.utilities,
            [targetKind]: {
              ...util,
              records: nextRecords,
            },
          },
        };
        return { ...current, sites };
      });
      return c.json({
        detectedKind: targetKind,
        importedYears: parsed.importedYears,
        store: updated,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'SITE_NOT_FOUND') {
        return c.json({ error: 'Site not found' }, 404);
      }
      throw e;
    }
  });

  app.get('/api/export', async (c) => {
    const store = await repo.load();
    const siteId = c.req.query('siteId');
    if (siteId) {
      const site = store.sites.find((s) => s.id === siteId);
      if (!site) {
        return c.json({ error: 'Site not found' }, 404);
      }
      const singleStore = {
        ...store,
        activeSiteId: site.id,
        sites: [site],
      };
      return c.json(singleStore);
    }
    return c.json(store);
  });

  app.post('/api/import', async (c) => {
    try {
      const raw: unknown = await c.req.json();
      const validated = validateStoreJson(raw);
      const saved = await repo.save(validated);
      return c.json(saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'インポートデータが不正です';
      return c.json({ error: msg }, 400);
    }
  });

  if (clientDistDir && fs.existsSync(clientDistDir)) {
    const relRoot = path.relative(process.cwd(), clientDistDir) || '.';
    app.use('/*', serveStatic({ root: relRoot }));
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api/')) {
        return c.json({ error: 'Not Found' }, 404);
      }
      const indexHtml = fs.readFileSync(path.join(clientDistDir, 'index.html'), 'utf8');
      return c.html(indexHtml);
    });
  }

  return app;
}
