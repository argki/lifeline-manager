import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Droplets,
  Flame,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Zap,
} from 'lucide-react';
import type { LifelineStore, UtilityKind, YearlyDataMap, YearlyNotesMap } from '../shared/types.js';
import {
  createSite,
  deleteSite,
  fetchStore,
  getClientId,
  renameSite,
  replaceUtilityRecords,
  setActiveSite,
  updateMonthlyCell,
  updateYearlyNote,
} from './api.js';
import { DataTransferModal } from './components/DataTransferModal.js';
import { UsageCharts } from './components/UsageCharts.js';
import { UtilityTable } from './components/UtilityTable.js';

const TAB_CONFIG: Array<{ kind: UtilityKind; label: string; icon: typeof Droplets }> = [
  { kind: 'water', label: '水道', icon: Droplets },
  { kind: 'electricity', label: '電力', icon: Zap },
  { kind: 'gas', label: 'ガス', icon: Flame },
];

interface HistoryEntry {
  siteId: string;
  kind: UtilityKind;
  prevRecords: YearlyDataMap;
  nextRecords: YearlyDataMap;
  prevNotes?: YearlyNotesMap;
  nextNotes?: YearlyNotesMap;
}

const MAX_HISTORY = 50;
const ACTIVE_SITE_STORAGE_KEY = 'lifeline.activeSiteId';

function getStoredActiveSiteId(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_SITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStoredActiveSiteId(siteId: string | null): void {
  try {
    if (siteId) {
      window.sessionStorage.setItem(ACTIVE_SITE_STORAGE_KEY, siteId);
    } else {
      window.sessionStorage.removeItem(ACTIVE_SITE_STORAGE_KEY);
    }
  } catch {
    // ignore sessionStorage failure
  }
}

export function App() {
  const [store, setStore] = useState<LifelineStore | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(() => getStoredActiveSiteId());
  const [activeKind, setActiveKind] = useState<UtilityKind>('water');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showManagementMenu, setShowManagementMenu] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    fetchStore()
      .then((data) => {
        setStore(data);
        setActiveSiteId((prev) => {
          const validPrev = prev && data.sites.some((s) => s.id === prev) ? prev : null;
          const resolved = validPrev ?? data.activeSiteId ?? data.sites[0]?.id ?? null;
          saveStoredActiveSiteId(resolved);
          return resolved;
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);

  const syncFromServer = useCallback(async () => {
    if (syncInFlightRef.current) {
      syncPendingRef.current = true;
      return;
    }
    syncInFlightRef.current = true;
    try {
      do {
        syncPendingRef.current = false;
        const latest = await fetchStore();
        setStore(latest);
        setActiveSiteId((prev) => {
          if (prev && latest.sites.some((s) => s.id === prev)) {
            return prev;
          }
          const fallback = latest.activeSiteId ?? latest.sites[0]?.id ?? null;
          saveStoredActiveSiteId(fallback);
          return fallback;
        });
      } while (syncPendingRef.current);
    } catch {
      // ネットワーク一時エラー時は次回イベント・再接続で再同期
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');

    source.addEventListener('connected', () => {
      if (hasConnectedOnceRef.current) {
        void syncFromServer();
      } else {
        hasConnectedOnceRef.current = true;
      }
    });

    source.addEventListener('store-updated', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          sourceClientId?: string;
        };
        if (payload.sourceClientId === getClientId()) {
          return;
        }
      } catch {
        // パース失敗時も安全側で最新化する
      }
      void syncFromServer();
    });

    return () => {
      source.close();
    };
  }, [syncFromServer]);

  const applyUtilityState = useCallback(
    (siteId: string, kind: UtilityKind, records: YearlyDataMap, notes?: YearlyNotesMap) => {
      setStore((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sites: prev.sites.map((site) =>
            site.id !== siteId
              ? site
              : {
                  ...site,
                  utilities: {
                    ...site.utilities,
                    [kind]: {
                      ...site.utilities[kind],
                      records,
                      ...(notes !== undefined ? { notes } : {}),
                    },
                  },
                },
          ),
        };
      });
    },
    [],
  );

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1]!;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, entry]);

    setActiveKind(entry.kind);
    applyUtilityState(entry.siteId, entry.kind, entry.prevRecords, entry.prevNotes);

    setSaving(true);
    setError(null);
    try {
      const next = await replaceUtilityRecords(
        entry.siteId,
        entry.kind,
        entry.prevRecords,
        entry.prevNotes,
      );
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '元に戻す処理の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [undoStack, applyUtilityState]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1]!;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, entry]);

    setActiveKind(entry.kind);
    applyUtilityState(entry.siteId, entry.kind, entry.nextRecords, entry.nextNotes);

    setSaving(true);
    setError(null);
    try {
      const next = await replaceUtilityRecords(
        entry.siteId,
        entry.kind,
        entry.nextRecords,
        entry.nextNotes,
      );
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'やり直す処理の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [redoStack, applyUtilityState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          e.preventDefault();
          void handleUndo();
        }
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (redoStack.length > 0) {
          e.preventDefault();
          void handleRedo();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack.length, redoStack.length, handleUndo, handleRedo]);

  if (loading) {
    return <div className="app-shell">読み込み中...</div>;
  }

  if (!store || store.sites.length === 0) {
    return (
      <div className="app-shell">
        <div className="error-banner">{error ?? 'データを初期化できませんでした'}</div>
      </div>
    );
  }

  const activeSite =
    store.sites.find((s) => s.id === activeSiteId) ??
    store.sites.find((s) => s.id === store.activeSiteId) ??
    store.sites[0]!;
  const activeUtility = activeSite.utilities[activeKind];

  const pushHistory = (
    siteId: string,
    kind: UtilityKind,
    prevRecords: YearlyDataMap,
    nextRecords: YearlyDataMap,
    prevNotes?: YearlyNotesMap,
    nextNotes?: YearlyNotesMap,
  ) => {
    setUndoStack((prev) => [
      ...prev.slice(-(MAX_HISTORY - 1)),
      { siteId, kind, prevRecords, nextRecords, prevNotes, nextNotes },
    ]);
    setRedoStack([]);
  };

  const handleSelectSite = async (siteId: string) => {
    setError(null);
    setActiveSiteId(siteId);
    saveStoredActiveSiteId(siteId);
    try {
      await setActiveSite(siteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拠点切替に失敗しました');
    }
  };

  const handleAddSite = async () => {
    const name = window.prompt('新しい拠点名を入力してください（例: 実家、別宅）');
    if (!name || !name.trim()) return;
    setError(null);
    try {
      const res = await createSite(name.trim());
      setStore(res.store);
      setActiveSiteId(res.site.id);
      saveStoredActiveSiteId(res.site.id);
      setNotice(`拠点「${res.site.name}」を追加しました`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拠点追加に失敗しました');
    }
  };

  const handleRenameSite = async () => {
    const name = window.prompt('新しい拠点名を入力してください', activeSite.name);
    if (!name || !name.trim() || name.trim() === activeSite.name) return;
    setError(null);
    try {
      const next = await renameSite(activeSite.id, name.trim());
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拠点名の変更に失敗しました');
    }
  };

  const handleDeleteSite = async () => {
    if (store.sites.length <= 1) return;
    if (!window.confirm(`拠点「${activeSite.name}」と全記録を削除しますか？`)) return;
    setError(null);
    try {
      const next = await deleteSite(activeSite.id);
      setStore(next);
      const nextSiteId = next.activeSiteId ?? next.sites[0]?.id ?? null;
      setActiveSiteId(nextSiteId);
      saveStoredActiveSiteId(nextSiteId);
      setUndoStack([]);
      setRedoStack([]);
      setNotice(`拠点「${activeSite.name}」を削除しました`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拠点削除に失敗しました');
    }
  };

  const handleChangeCell = async (
    year: number,
    month: number,
    field: 'usage' | 'amount',
    value: number | null,
  ) => {
    const yearKey = String(year);
    const monthKey = String(month);
    const prevRecords = activeUtility.records;
    const prevYear = prevRecords[yearKey] ?? {};
    const prevEntry = prevYear[monthKey] ?? { usage: null, amount: null };
    const nextRecords: YearlyDataMap = {
      ...prevRecords,
      [yearKey]: {
        ...prevYear,
        [monthKey]: {
          ...prevEntry,
          [field]: value,
        },
      },
    };

    pushHistory(activeSite.id, activeKind, prevRecords, nextRecords);
    applyUtilityState(activeSite.id, activeKind, nextRecords);

    setSaving(true);
    setError(null);
    try {
      const next = await updateMonthlyCell(activeSite.id, activeKind, year, month, {
        [field]: value,
      });
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeNote = async (year: number, note: string) => {
    const yearKey = String(year);
    const prevNotes = activeUtility.notes ?? {};
    const prevValue = prevNotes[yearKey] ?? '';
    const nextNotes: YearlyNotesMap = { ...prevNotes };
    if (note.trim() === '') {
      delete nextNotes[yearKey];
    } else {
      nextNotes[yearKey] = note;
    }
    const nextValue = nextNotes[yearKey] ?? '';
    if (prevValue === nextValue) return;

    pushHistory(
      activeSite.id,
      activeKind,
      activeUtility.records,
      activeUtility.records,
      prevNotes,
      nextNotes,
    );
    applyUtilityState(activeSite.id, activeKind, activeUtility.records, nextNotes);

    setSaving(true);
    setError(null);
    try {
      const next = await updateYearlyNote(activeSite.id, activeKind, year, note);
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '備考の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAddYear = async (year: number) => {
    const yearKey = String(year);
    if (activeUtility.records[yearKey]) {
      setNotice(`${year}年はすでに存在します`);
      return;
    }

    const prevRecords = activeUtility.records;
    const nextRecords: YearlyDataMap = {
      ...prevRecords,
      [yearKey]: {},
    };

    pushHistory(activeSite.id, activeKind, prevRecords, nextRecords);
    applyUtilityState(activeSite.id, activeKind, nextRecords);

    setSaving(true);
    setError(null);
    try {
      const next = await replaceUtilityRecords(activeSite.id, activeKind, nextRecords);
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '年の追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteYear = async (year: number) => {
    const yearKey = String(year);
    if (!activeUtility.records[yearKey]) return;

    const prevRecords = activeUtility.records;
    const nextRecords: YearlyDataMap = { ...prevRecords };
    delete nextRecords[yearKey];

    const prevNotes = activeUtility.notes ?? {};
    const nextNotes: YearlyNotesMap = { ...prevNotes };
    delete nextNotes[yearKey];

    pushHistory(activeSite.id, activeKind, prevRecords, nextRecords, prevNotes, nextNotes);
    applyUtilityState(activeSite.id, activeKind, nextRecords, nextNotes);

    setSaving(true);
    setError(null);
    try {
      const next = await replaceUtilityRecords(activeSite.id, activeKind, nextRecords, nextNotes);
      setStore(next);
      setNotice(`${year}年を削除しました（誤操作の場合は「元に戻す」で復元できます）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '年の削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-main">
          <div className="header-left">
            <h1 className="app-title">ライフライン使用量・料金管理アプリ</h1>
            <div className="site-controls">
              <select
                className="site-select"
                aria-label="拠点選択"
                value={activeSite.id}
                onChange={(e) => handleSelectSite(e.target.value)}
              >
                {store.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="header-right">
            <span className={`save-badge ${saving ? 'saving' : ''}`}>
              {saving ? '保存中...' : 'ローカル保存済み'}
            </span>
            <button
              type="button"
              className={`btn ${showManagementMenu ? 'btn-active' : ''}`}
              aria-expanded={showManagementMenu}
              onClick={() => setShowManagementMenu((prev) => !prev)}
            >
              <Settings size={15} />
              管理・移行
              {showManagementMenu ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {showManagementMenu && (
          <div className="management-panel">
            <div className="management-group">
              <span className="management-label">拠点管理:</span>
              <button type="button" className="btn" onClick={handleAddSite} title="拠点を追加">
                <Plus size={14} />
                追加
              </button>
              <button type="button" className="btn" onClick={handleRenameSite} title="拠点名を変更">
                <Pencil size={14} />
                名称変更
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteSite}
                disabled={store.sites.length <= 1}
                title="拠点を削除"
              >
                <Trash2 size={14} />
                削除
              </button>
            </div>
            <div className="management-group">
              <button type="button" className="btn" onClick={() => setShowTransferModal(true)}>
                <ArrowLeftRight size={15} />
                データ移行・バックアップ
              </button>
            </div>
          </div>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}
      {notice && (
        <div className="success-banner" onClick={() => setNotice(null)} role="status">
          {notice}
        </div>
      )}

      <nav className="utility-tabs" aria-label="ライフライン種別">
        {TAB_CONFIG.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            className={`utility-tab ${activeKind === kind ? 'active' : ''}`}
            onClick={() => setActiveKind(kind)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <UtilityTable
        meta={activeUtility.meta}
        records={activeUtility.records}
        notes={activeUtility.notes}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onChangeCell={handleChangeCell}
        onChangeNote={handleChangeNote}
        onAddYear={handleAddYear}
        onDeleteYear={handleDeleteYear}
      />

      <UsageCharts meta={activeUtility.meta} records={activeUtility.records} />

      {showTransferModal && (
        <DataTransferModal
          store={store}
          activeSite={activeSite}
          activeKind={activeKind}
          onUpdated={(nextStore, message) => {
            setStore(nextStore);
            setUndoStack([]);
            setRedoStack([]);
            setNotice(message);
          }}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </div>
  );
}
