import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudOff,
  LayoutGrid,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { UniverseRecord } from '@/types';
import {
  deleteUniverse,
  duplicateUniverse,
  estimateStorage,
  listUniverses,
  renameUniverse,
  saveUniverse,
} from '@/utils/db';
import { formatBytes, formatNumber, formatRelative, uid } from '@/utils/cn';
import { Button, EmptyState, Modal, IconButton, TextInput } from '@/components/ui';
import { useApp } from '@/stores/app';
import { validateImport } from '@/features/export/exporter';

export function LibraryPage({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const universes = useApp((s) => s.universes);
  const setUniverses = useApp((s) => s.setUniverses);
  const pushToast = useApp((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number; supported: boolean }>({
    usage: 0,
    quota: 0,
    supported: false,
  });
  const [deleteTarget, setDeleteTarget] = useState<UniverseRecord | null>(null);
  const [renameTarget, setRenameTarget] = useState<UniverseRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const list = await listUniverses();
    setUniverses(list);
    setStorage(await estimateStorage());
  }, [setUniverses]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!query.trim()) return universes;
    const q = query.toLowerCase();
    return universes.filter(
      (u) => u.name.toLowerCase().includes(q) || u.sourceFileName.toLowerCase().includes(q),
    );
  }, [universes, query]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteUniverse(deleteTarget.id);
      await refresh();
      pushToast(locale === 'zh' ? '作品已删除' : 'Universe deleted', 'success');
    } catch {
      pushToast(locale === 'zh' ? '删除失败' : 'Delete failed', 'error');
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setBusy(true);
    try {
      await renameUniverse(renameTarget.id, renameValue.trim());
      await refresh();
    } finally {
      setBusy(false);
      setRenameTarget(null);
    }
  };

  const handleDuplicate = async (record: UniverseRecord) => {
    setBusy(true);
    try {
      await duplicateUniverse(record.id, uid('u'), `${record.name} (copy)`);
      await refresh();
      pushToast(locale === 'zh' ? '作品已复制' : 'Universe duplicated', 'success');
    } catch {
      pushToast(locale === 'zh' ? '复制失败（存储空间可能不足）' : 'Duplicate failed (storage may be full)', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = validateImport(JSON.parse(text));
      if (!parsed.ok || !parsed.payload) {
        pushToast(parsed.error ?? 'Invalid file', 'error');
        return;
      }
      const payload = parsed.payload;
      const id = uid('u');
      const now = Date.now();
      // Reuse the storage path so imported universes behave exactly like saved ones.
      await saveUniverse(
        {
          id,
          name: payload.config.title || payload.dataset.meta.fileName || 'Imported universe',
          createdAt: now,
          updatedAt: now,
          sourceFileName: payload.dataset.meta.fileName,
          rowCount: payload.dataset.rows.length,
          columnCount: payload.dataset.fields.length,
          mode: payload.config.mode,
          config: payload.config,
          filters: payload.filters ?? [],
        },
        {
          meta: { ...payload.dataset.meta, rows: payload.dataset.rows.length, columns: payload.dataset.fields.length },
          fields: payload.dataset.fields,
          columns: payload.dataset.columns ?? [],
          rows: payload.dataset.rows,
        },
      );
      await refresh();
      pushToast(locale === 'zh' ? '作品导入成功' : 'Universe imported', 'success');
    } catch (e) {
      pushToast((e as Error).message || (locale === 'zh' ? '导入失败' : 'Import failed'), 'error');
    }
  };

  const storagePct = storage.quota > 0 ? Math.min(1, storage.usage / storage.quota) : 0;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-3 pt-4 sm:px-5 sm:pt-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-0 sm:text-2xl">{t('library.title')}</h1>
          <p className="mt-1 text-[11px] text-2 sm:text-xs">
            {locale === 'zh'
              ? `${universes.length} 个作品 · 全部保存在浏览器本地`
              : `${universes.length} universes · all stored locally in your browser`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}>
            <Upload size={13} />
            {t('library.importJson')}
          </Button>
          <Button variant="primary" size="sm" onClick={onNew}>
            <Plus size={13} />
            {t('library.new')}
          </Button>
        </div>
      </div>

      {storage.supported && storage.quota > 0 && (
        <div
          className="mb-3 flex flex-col gap-1.5 rounded-xl px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
          style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
        >
          <span className="text-[11px] text-2">{t('library.storage')}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(1, storagePct * 100)}%`,
                background: storagePct > 0.85 ? '#f87171' : 'var(--accent)',
              }}
            />
          </div>
          <span className="font-mono text-[10px] text-2">
            {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
          </span>
        </div>
      )}

      {!storage.supported && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px]"
          style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.24)', color: '#fcd34d' }}
        >
          <CloudOff size={13} />
          {locale === 'zh'
            ? '当前浏览器不支持存储用量查询，作品仍会保存到 IndexedDB。'
            : 'Usage estimation is unavailable; universes are still saved to IndexedDB.'}
        </div>
      )}

      <div className="mb-3">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-2" />
          <input
            className="text-input pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={locale === 'zh' ? '搜索作品…' : 'Search universes…'}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={26} />}
          title={query ? (locale === 'zh' ? '没有匹配的作品' : 'No matching universes') : t('library.empty')}
          description={query ? undefined : t('library.emptyHint')}
          action={
            !query ? (
              <Button variant="primary" size="sm" onClick={onNew}>
                <Plus size={13} />
                {t('library.new')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="group flex flex-col overflow-hidden rounded-xl transition-all hover:-translate-y-0.5"
              style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
            >
              <button
                type="button"
                onClick={() => onOpen(u.id)}
                className="relative aspect-[16/9] w-full overflow-hidden text-left"
                style={{ background: 'linear-gradient(135deg, var(--bg-2), var(--bg-1))' }}
              >
                {u.thumbnail ? (
                  <img src={u.thumbnail} alt={u.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full w-full place-items-center">
                    <div className="text-center">
                      <div className="mx-auto mb-1.5 h-9 w-9 rounded-full opacity-60" style={{ background: 'radial-gradient(circle, #8b6cff 0%, transparent 70%)' }} />
                      <span className="text-[10px] uppercase tracking-[0.16em] text-2">{u.mode}</span>
                    </div>
                  </div>
                )}
                <span
                  className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                  style={{ background: 'rgba(4,6,15,0.72)', color: '#c8d6ff', backdropFilter: 'blur(4px)' }}
                >
                  {t(`mode.${u.mode}`)}
                </span>
              </button>

              <div className="flex flex-1 flex-col p-2.5">
                <button type="button" onClick={() => onOpen(u.id)} className="text-left">
                  <h3 className="truncate text-[13px] font-medium text-0">{u.name}</h3>
                  <p className="mt-0.5 truncate text-[10px] text-2">{u.sourceFileName}</p>
                </button>
                <p className="mt-1.5 text-[10px] text-2">
                  {formatNumber(u.rowCount, 0)} {t('common.rows')} · {u.columnCount} {t('import.columns')} ·{' '}
                  {formatRelative(u.updatedAt, locale)}
                </p>
                <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
                  <button
                    type="button"
                    onClick={() => onOpen(u.id)}
                    className="rounded px-1.5 py-1 text-[10.5px] font-medium accent-text hover:bg-[var(--panel-strong)]"
                  >
                    {t('library.open')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameTarget(u);
                      setRenameValue(u.name);
                    }}
                    disabled={busy}
                    className="rounded px-1.5 py-1 text-[10.5px] text-2 hover:bg-[var(--panel-strong)] hover:text-1"
                  >
                    {t('library.rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(u)}
                    disabled={busy}
                    className="rounded px-1.5 py-1 text-[10.5px] text-2 hover:bg-[var(--panel-strong)] hover:text-1"
                  >
                    {t('library.duplicate')}
                  </button>
                  <div className="flex-1" />
                  <IconButton label={t('library.delete')} onClick={() => setDeleteTarget(u)} className="h-7 w-7">
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-12" />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t('library.delete')}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" full onClick={handleDelete} disabled={busy}>
              <Trash2 size={13} />
              {t('common.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-1">{t('library.deleteConfirm')}</p>
        {deleteTarget && (
          <p className="mt-2 rounded-lg px-2.5 py-2 text-[11px] text-2" style={{ background: 'var(--panel)' }}>
            {deleteTarget.name} · {formatNumber(deleteTarget.rowCount, 0)} {t('common.rows')}
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title={t('library.rename')}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setRenameTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" full onClick={handleRename} disabled={busy || !renameValue.trim()}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <TextInput value={renameValue} onChange={setRenameValue} placeholder={t('library.rename')} onEnter={handleRename} />
      </Modal>
    </div>
  );
}
