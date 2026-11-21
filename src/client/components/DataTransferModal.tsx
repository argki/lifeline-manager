import { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { exportUtilityToCsv } from '../../shared/csvImport.js';
import type { LifelineStore, SiteData, UtilityKind } from '../../shared/types.js';
import { exportStoreJson, importCsvToSite, importStoreJson } from '../api.js';

interface DataTransferModalProps {
  store: LifelineStore;
  activeSite: SiteData;
  activeKind: UtilityKind;
  onUpdated: (nextStore: LifelineStore, message: string) => void;
  onClose: () => void;
}

async function decodeCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTransferModal({
  store,
  activeSite,
  activeKind,
  onUpdated,
  onClose,
}: DataTransferModalProps) {
  const [targetSiteId, setTargetSiteId] = useState(activeSite.id);
  const [csvKind, setCsvKind] = useState<'auto' | UtilityKind>('auto');
  const [csvMode, setCsvMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const csvText = await decodeCsvFile(file);
      const res = await importCsvToSite(targetSiteId, csvText, {
        kind: csvKind === 'auto' ? undefined : csvKind,
        mode: csvMode,
      });
      const siteName = store.sites.find((s) => s.id === targetSiteId)?.name ?? '';
      onUpdated(
        res.store,
        `「${siteName}」へ CSV を取り込みました（${res.importedYears.length}年分）`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV の取り込みに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleExportAllJson = async () => {
    setError(null);
    try {
      const data = await exportStoreJson();
      downloadBlob(
        JSON.stringify(data, null, 2),
        `lifeline-backup-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エクスポートに失敗しました');
    }
  };

  const handleExportCurrentCsv = () => {
    const util = activeSite.utilities[activeKind];
    const csv = exportUtilityToCsv(util.meta, util.records);
    downloadBlob(
      `\uFEFF${csv}`,
      `${activeSite.name}-${util.meta.label}.csv`,
      'text/csv;charset=utf-8',
    );
  };

  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const nextStore = await importStoreJson(parsed);
      onUpdated(nextStore, 'JSON バックアップからデータを復元しました');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON の復元に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="データ移行・バックアップ">
      <div className="modal-content">
        <div className="card-header">
          <h3 style={{ margin: 0 }}>データ移行・バックアップ</h3>
          <button type="button" className="btn" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="modal-section">
          <h4>既存 Excel 書き出し CSV インポート</h4>
          <div className="form-row">
            <label>
              取り込み先拠点:{' '}
              <select
                value={targetSiteId}
                onChange={(e) => setTargetSiteId(e.target.value)}
                className="site-select"
              >
                {store.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              種別:{' '}
              <select
                value={csvKind}
                onChange={(e) => setCsvKind(e.target.value as 'auto' | UtilityKind)}
                className="site-select"
              >
                <option value="auto">自動判別</option>
                <option value="water">水道</option>
                <option value="electricity">電力</option>
                <option value="gas">ガス</option>
              </select>
            </label>
            <label>
              モード:{' '}
              <select
                value={csvMode}
                onChange={(e) => setCsvMode(e.target.value as 'merge' | 'replace')}
                className="site-select"
              >
                <option value="merge">既存データにマージ</option>
                <option value="replace">対象種別を上書き置換</option>
              </select>
            </label>
          </div>
          <label className="btn btn-primary">
            <Upload size={15} />
            {busy ? '処理中...' : 'CSV ファイルを選択して取り込む'}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              disabled={busy}
              onChange={handleCsvFileChange}
            />
          </label>
        </div>

        <div className="modal-section">
          <h4>バックアップ（エクスポート / 復元）</h4>
          <div className="form-row">
            <button type="button" className="btn" onClick={handleExportAllJson}>
              <Download size={15} />
              全拠点 JSON バックアップ
            </button>
            <button type="button" className="btn" onClick={handleExportCurrentCsv}>
              <Download size={15} />
              表示中の種別を CSV 出力
            </button>
          </div>
          <div>
            <label className="btn">
              <Upload size={15} />
              JSON バックアップから復元（全拠点上書き）
              <input
                type="file"
                accept=".json,application/json"
                hidden
                disabled={busy}
                onChange={handleJsonImport}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
