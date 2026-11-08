import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Download,
  Filter,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  PanelLeft,
  Redo2,
  Save,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react';
import type { Dataset, ViewMode } from '@/types';
import { applyFilters } from '@/utils/layout';
import { formatNumber } from '@/utils/cn';
import { IconButton, Sheet } from '@/components/ui';
import { useApp } from '@/stores/app';
import { GalaxyCanvas } from '@/features/galaxy/GalaxyCanvas';
import { NetworkCanvas } from '@/features/network/NetworkCanvas';
import { TimelineCanvas } from '@/features/timeline/TimelineCanvas';
import { MapCanvas } from '@/features/map/MapCanvas';
import { MatrixCanvas } from '@/features/matrix/MatrixCanvas';
import { DistributionCanvas } from '@/features/distribution/DistributionCanvas';
import { LeftPanel } from '@/features/editor/LeftPanel';
import { RightPanel } from '@/features/editor/RightPanel';
import { DetailPanel } from '@/features/editor/DetailPanel';
import { ExportDialog } from '@/features/export/ExportDialog';
import { recommendModes } from '@/features/data-engine/parse';
import { updateConfig } from '@/utils/db';
import { cn } from '@/utils/cn';

interface Props {
  dataset: Dataset;
  onBack: () => void;
}

/** A hook that reports whether the viewport is at least `px` wide. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function WorkspacePage({ dataset, onBack }: Props) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const config = useApp((s) => s.config);
  const patchConfig = useApp((s) => s.patchConfig);
  const filters = useApp((s) => s.filters);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const history = useApp((s) => s.history);
  const future = useApp((s) => s.future);
  const selectedRow = useApp((s) => s.selectedRow);
  const setSelectedRow = useApp((s) => s.setSelectedRow);
  const universeId = useApp((s) => s.universeId);
  const universeName = useApp((s) => s.universeName);
  const setUniverseName = useApp((s) => s.setUniverseName);
  const pushToast = useApp((s) => s.pushToast);
  const search = useApp((s) => s.search);

  const [exportOpen, setExportOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [focusCanvas, setFocusCanvas] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const stageRef = useRef<HTMLDivElement>(null);

  /* Filter + search the rows once; every view consumes the same filtered set. */
  const { rowsForView, toOriginal } = useMemo(() => {
    const indexed = dataset.rows.map((row, idx) => ({ row, idx }));
    let kept = indexed;
    if (filters.length > 0) {
      const filtered = new Set(applyFilters(dataset.rows, filters));
      kept = indexed.filter((e) => filtered.has(e.row));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      kept = kept.filter((e) =>
        dataset.fields.some((f) => {
          const v = e.row[f];
          return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
        }),
      );
    }
    // Also fold in selection-level index mapping so detail lookups stay correct.
    return {
      rowsForView: kept.map((e) => e.row),
      toOriginal: kept.map((e) => e.idx),
    };
  }, [dataset.rows, dataset.fields, filters, search]);

  const availableModes = useMemo(() => {
    const modes = recommendModes(dataset) as ViewMode[];
    // Always include all modes so users can try them; unavailable ones explain themselves.
    const all: ViewMode[] = ['galaxy', 'network', 'timeline', 'map', 'matrix', 'distribution'];
    return all.sort((a, b) => {
      const ai = modes.indexOf(a);
      const bi = modes.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [dataset]);

  const handleSelect = useCallback(
    (viewIndex: number | null) => {
      if (viewIndex === null) {
        setSelectedRow(null);
        setDetailOpen(false);
        return;
      }
      // Views index into the filtered array; the store keeps original indices.
      const original = toOriginal[viewIndex];
      setSelectedRow(original ?? null);
      setDetailOpen(original !== undefined);
    },
    [setSelectedRow, toOriginal],
  );

  /* The views highlight indices in the filtered array, so map back. */
  const viewSelectedIndex = useMemo(() => {
    if (selectedRow === null) return null;
    const idx = toOriginal.indexOf(selectedRow);
    return idx >= 0 ? idx : null;
  }, [selectedRow, toOriginal]);

  const saveNow = useCallback(async () => {
    if (!universeId) {
      pushToast(locale === 'zh' ? '这个数据集还没有保存为作品' : 'This dataset is not saved as a universe yet', 'info');
      return;
    }
    setSaving(true);
    try {
      await updateConfig(universeId, config, filters);
      setSavedAt(Date.now());
      pushToast(t('editor.saved'), 'success');
    } catch {
      pushToast(locale === 'zh' ? '保存失败' : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [universeId, config, filters, pushToast, t, locale]);

  /* Keyboard shortcuts (desktop only, and never while typing). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
      } else if (e.key === 'Escape') {
        setSelectedRow(null);
        setDetailOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, saveNow, setSelectedRow]);

  const View = useMemo(() => {
    switch (config.mode) {
      case 'network':
        return NetworkCanvas;
      case 'timeline':
        return TimelineCanvas;
      case 'map':
        return MapCanvas;
      case 'matrix':
        return MatrixCanvas;
      case 'distribution':
        return DistributionCanvas;
      default:
        return GalaxyCanvas;
    }
  }, [config.mode]);

  const activeFilterCount = filters.filter((f) => f.enabled).length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col sm:h-[calc(100dvh-4rem)]">
      {/* ---------------- top toolbar ---------------- */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5 sm:px-3">
        <IconButton label={t('editor.back')} onClick={onBack}>
          <ChevronLeft size={16} />
        </IconButton>

        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              className="text-input h-8 py-1 text-[13px]"
              value={universeName}
              onChange={(e) => setUniverseName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingName(false);
              }}
              aria-label={t('library.rename')}
            />
          ) : (
            <button
              type="button"
              onClick={() => universeId && setEditingName(true)}
              className="block max-w-full truncate text-left text-[13px] font-medium text-0 hover:text-[var(--accent)]"
              title={universeId ? t('library.rename') : dataset.meta.fileName}
            >
              {universeName || dataset.meta.fileName}
            </button>
          )}
          <p className="truncate text-[10px] text-2">
            {formatNumber(rowsForView.length, 0)}
            {rowsForView.length !== dataset.rows.length && ` / ${formatNumber(dataset.rows.length, 0)}`}{' '}
            {t('common.rows')} · {dataset.meta.columns} {t('import.columns')}
            {activeFilterCount > 0 && ` · ${activeFilterCount} ${t('editor.filters')}`}
          </p>
        </div>

        <div className="flex items-center gap-0.5">
          <IconButton label={t('editor.undo')} onClick={undo} disabled={history.length === 0}>
            <Undo2 size={15} />
          </IconButton>
          <IconButton label={t('editor.redo')} onClick={redo} disabled={future.length === 0}>
            <Redo2 size={15} />
          </IconButton>
          <IconButton
            label={t('editor.save')}
            onClick={saveNow}
            disabled={saving || !universeId}
            active={savedAt !== null && Date.now() - savedAt < 2200}
          >
            <Save size={15} />
          </IconButton>
          <IconButton label={t('export.title')} onClick={() => setExportOpen(true)}>
            <Download size={15} />
          </IconButton>

          {!isDesktop && (
            <>
              <IconButton label={t('editor.data')} onClick={() => setLeftOpen(true)}>
                <PanelLeft size={15} />
              </IconButton>
              <IconButton label={t('editor.style')} onClick={() => setRightOpen(true)}>
                <SlidersHorizontal size={15} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {/* ---------------- body ---------------- */}
      <div className="relative flex min-h-0 flex-1">
        {/* left panel */}
        {isDesktop && (
          <aside className="w-[248px] shrink-0 border-r border-line" style={{ background: 'var(--bg-1)' }}>
            <LeftPanel
              columns={dataset.columns}
              rows={dataset.rows}
              mapping={config.mapping}
              availableModes={availableModes}
            />
          </aside>
        )}

        {/* canvas */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={stageRef}
            className={cn(
              'relative min-h-0 flex-1 overflow-hidden',
              focusCanvas && 'fixed inset-0 z-30',
            )}
            style={{ background: 'var(--canvas-0)' }}
          >
            {(config.title || config.subtitle) && (
              <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[62%]">
                {config.title && (
                  <h2 className="truncate font-display text-[15px] font-semibold tracking-tight text-0 sm:text-lg">
                    {config.title}
                  </h2>
                )}
                {config.subtitle && <p className="mt-0.5 truncate text-[11px] text-2">{config.subtitle}</p>}
              </div>
            )}

            <View
              rows={rowsForView}
              config={config}
              onSelect={handleSelect}
              selectedRow={viewSelectedIndex}
            />

            {/* canvas chrome */}
            <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
              <IconButton label={focusCanvas ? 'exit focus' : 'focus'} onClick={() => setFocusCanvas((v) => !v)}>
                {focusCanvas ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </IconButton>
            </div>

            {focusCanvas && (
              <div className="absolute left-2 top-2 z-20">
                <IconButton label="close focus" onClick={() => setFocusCanvas(false)}>
                  <X size={16} />
                </IconButton>
              </div>
            )}
          </div>

          {/* mobile mode switcher */}
          {!isDesktop && (
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line py-1.5 pl-2 pr-28 no-scrollbar">
              {availableModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => patchConfig({ mode })}
                  className={cn(
                    'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                    config.mode === mode
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-2 hover:bg-[var(--panel)]',
                  )}
                >
                  {t(`mode.${mode}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* right panel */}
        {isDesktop && (
          <aside className="w-[268px] shrink-0 border-l border-line" style={{ background: 'var(--bg-1)' }}>
            <RightPanel columns={dataset.columns} />
          </aside>
        )}

        {/* detail drawer (desktop inline-friendly overlay) */}
        {detailOpen && selectedRow !== null && dataset.rows[selectedRow] && (
          <>
            <div
              className="absolute inset-0 z-20 bg-black/10 sm:hidden"
              onClick={() => setDetailOpen(false)}
              aria-hidden="true"
            />
            <div
              className="absolute right-0 top-0 z-30 h-full w-[min(360px,92vw)] animate-fade-up border-l border-line-strong"
              style={{ background: 'var(--bg-1)' }}
            >
              <DetailPanel
                dataset={dataset}
                rowIndex={selectedRow}
                onClose={() => {
                  setDetailOpen(false);
                  setSelectedRow(null);
                }}
                onSelect={(idx) => setSelectedRow(idx)}
              />
            </div>
          </>
        )}
      </div>

      {/* ---------------- mobile sheets ---------------- */}
      {!isDesktop && (
        <>
          <Sheet open={leftOpen} onClose={() => setLeftOpen(false)} side="left" width="w-[min(320px,90vw)]">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <span className="text-[12px] font-semibold text-0">{t('editor.data')}</span>
              <IconButton label="close" onClick={() => setLeftOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <LeftPanel
                columns={dataset.columns}
                rows={dataset.rows}
                mapping={config.mapping}
                availableModes={availableModes}
              />
            </div>
          </Sheet>

          <Sheet open={rightOpen} onClose={() => setRightOpen(false)} side="right" width="w-[min(330px,92vw)]">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <span className="text-[12px] font-semibold text-0">{t('editor.style')}</span>
              <IconButton label="close" onClick={() => setRightOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <RightPanel columns={dataset.columns} />
            </div>
          </Sheet>
        </>
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        dataset={dataset}
        rows={rowsForView}
        config={config}
        filters={filters}
      />

      {/* mobile FABs for quick access */}
      {!isDesktop && (
        <div className="pointer-events-none fixed bottom-4 right-3 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full shadow-lg"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--border-strong)', color: 'var(--text-1)' }}
            aria-label={t('editor.filters')}
          >
            <Filter size={17} />
            {activeFilterCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white"
                style={{ background: 'var(--accent)' }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full shadow-lg"
            style={{ background: 'var(--accent)', color: '#fff' }}
            aria-label={t('export.title')}
          >
            <ImageIcon size={17} />
          </button>
        </div>
      )}

    </div>
  );
}
