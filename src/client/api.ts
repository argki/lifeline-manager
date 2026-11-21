import type { LifelineStore, UtilityKind, YearlyDataMap, YearlyNotesMap } from '../shared/types.js';

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const CLIENT_ID = createClientId();

export function getClientId(): string {
  return CLIENT_ID;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-Client-Id', CLIENT_ID);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let message = `API Error (${res.status})`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) message = err.error;
    } catch {
      // ignore json parse failure
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function fetchStore(): Promise<LifelineStore> {
  return requestJson<LifelineStore>('/api/store');
}

export function setActiveSite(siteId: string): Promise<LifelineStore> {
  return requestJson<LifelineStore>('/api/active-site', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId }),
  });
}

export function createSite(name: string): Promise<{ site: { id: string; name: string }; store: LifelineStore }> {
  return requestJson('/api/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function renameSite(siteId: string, name: string): Promise<LifelineStore> {
  return requestJson<LifelineStore>(`/api/sites/${siteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function deleteSite(siteId: string): Promise<LifelineStore> {
  return requestJson<LifelineStore>(`/api/sites/${siteId}`, {
    method: 'DELETE',
  });
}

export function updateMonthlyCell(
  siteId: string,
  kind: UtilityKind,
  year: number,
  month: number,
  patch: { usage?: number | null; amount?: number | null },
): Promise<LifelineStore> {
  return requestJson<LifelineStore>(
    `/api/sites/${siteId}/utilities/${kind}/records/${year}/${month}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
}

export function updateYearlyNote(
  siteId: string,
  kind: UtilityKind,
  year: number,
  note: string,
): Promise<LifelineStore> {
  return requestJson<LifelineStore>(`/api/sites/${siteId}/utilities/${kind}/notes/${year}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
}

export function replaceUtilityRecords(
  siteId: string,
  kind: UtilityKind,
  records: YearlyDataMap,
  notes?: YearlyNotesMap,
): Promise<LifelineStore> {
  return requestJson<LifelineStore>(`/api/sites/${siteId}/utilities/${kind}/records`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notes !== undefined ? { records, notes } : { records }),
  });
}

export function importCsvToSite(
  siteId: string,
  csvText: string,
  options?: { kind?: UtilityKind; mode?: 'merge' | 'replace' },
): Promise<{ detectedKind: UtilityKind; importedYears: number[]; store: LifelineStore }> {
  return requestJson(`/api/sites/${siteId}/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csvText,
      kind: options?.kind,
      mode: options?.mode ?? 'merge',
    }),
  });
}

export function exportStoreJson(siteId?: string): Promise<LifelineStore> {
  const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  return requestJson<LifelineStore>(`/api/export${query}`);
}

export function importStoreJson(store: unknown): Promise<LifelineStore> {
  return requestJson<LifelineStore>('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(store),
  });
}
