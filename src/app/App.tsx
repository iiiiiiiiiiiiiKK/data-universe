import { useCallback, useEffect, useState } from 'react';
import type { Dataset, ThemeMode, ViewMode } from '@/types';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HomePage } from '@/features/library/HomePage';
import { ExamplesPage } from '@/features/library/ExamplesPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { UnderstandPanel } from '@/features/data-engine/UnderstandPanel';
import { WorkspacePage } from '@/features/editor/WorkspacePage';
import { useApp } from '@/stores/app';
import { buildConfig } from '@/features/editor/autoMapping';
import { analyzeDataset } from '@/features/data-engine/analyze';
import { DEMO_DATASETS } from '@/features/import/demos';
import { loadUniverse, saveUniverse } from '@/utils/db';
import { uid } from '@/utils/cn';
import type { Locale } from '@/locales';

export function App({ initialTheme }: { initialTheme: ThemeMode }) {
  const route = useApp((s) => s.route);
  const setRoute = useApp((s) => s.setRoute);
  const dataset = useApp((s) => s.dataset);
  const setDataset = useApp((s) => s.setDataset);
  const setRawText = useApp((s) => s.setRawText);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const setLocale = useApp((s) => s.setLocale);
  const patchConfig = useApp((s) => s.patchConfig);
  const setUniverseId = useApp((s) => s.setUniverseId);
  const setUniverseName = useApp((s) => s.setUniverseName);
  const setFilters = useApp((s) => s.setFilters);
  const pushToast = useApp((s) => s.pushToast);
  const toast = useApp((s) => s.toast);
  const locale = useApp((s) => s.locale);

  const [ready, setReady] = useState(false);

  /* Restore persisted theme + locale once on mount. */
  useEffect(() => {
    setTheme(initialTheme);
    try {
      const storedLocale = localStorage.getItem('du.locale') as Locale | null;
      if (storedLocale === 'zh' || storedLocale === 'en') setLocale(storedLocale);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [initialTheme, setTheme, setLocale]);

  /* Keep <html lang> in sync for screen readers and font rendering. */
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  /**
   * Persist the freshly parsed dataset as a new universe, then build the
   * default config for the requested mode.
   */
  const startUniverse = useCallback(
    async (parsed: Dataset, mode?: ViewMode, rawText?: string | null) => {
      setDataset(parsed);
      setRawText(rawText ?? null);
      const chosen = mode ?? 'galaxy';
      const nextConfig = buildConfig(parsed, chosen);
      patchConfig(nextConfig);
      setFilters([]);

      const id = uid('u');
      const name = parsed.meta.fileName.replace(/\.[^.]+$/, '') || 'Untitled universe';
      setUniverseId(id);
      setUniverseName(name);
      patchConfig({ ...nextConfig, title: name });

      try {
        await saveUniverse(
          {
            id,
            name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sourceFileName: parsed.meta.fileName,
            rowCount: parsed.rows.length,
            columnCount: parsed.fields.length,
            mode: chosen,
            config: { ...nextConfig, title: name },
            filters: [],
          },
          parsed,
        );
      } catch (e) {
        // A quota failure must not block the session: the user can still
        // explore and export, they just cannot persist.
        pushToast((e as Error).message, 'error');
      }
      setRoute('workspace');
    },
    [patchConfig, pushToast, setDataset, setFilters, setRawText, setRoute, setUniverseId, setUniverseName],
  );

  const handleLoaded = useCallback(
    async (parsed: Dataset, rawText: string | null) => {
      setDataset(parsed);
      setRawText(rawText);
      setRoute('understand');
    },
    [setDataset, setRawText, setRoute],
  );

  const handleGenerate = useCallback(
    (mode: ViewMode) => {
      if (!dataset) return;
      void startUniverse(dataset, mode);
    },
    [dataset, startUniverse],
  );

  const handleDemo = useCallback(
    (id: string) => {
      const info = DEMO_DATASETS.find((d) => d.id === id);
      if (!info) return;
      const { fields, rows } = info.build();
      const parsed = analyzeDataset(
        {
          fileName: `${info.id}-demo.csv`,
          fileSize: rows.length * 96,
          fileType: 'CSV',
          rows: rows.length,
          columns: fields.length,
          emptyRows: 0,
          duplicateRows: 0,
          parsedAt: Date.now(),
          parser: 'demo',
          warnings: [`Demo Dataset · ${info.license}`, info.source],
        },
        fields,
        rows,
      );
      void startUniverse(parsed, info.recommended[0] as ViewMode, null);
    },
    [startUniverse],
  );

  const handleOpenUniverse = useCallback(
    async (id: string) => {
      const loaded = await loadUniverse(id);
      if (!loaded) {
        pushToast(locale === 'zh' ? '作品不存在或已被删除' : 'Universe not found', 'error');
        return;
      }
      setDataset(loaded.dataset);
      setUniverseId(id);
      setUniverseName(loaded.record.name);
      patchConfig(loaded.record.config);
      setFilters(loaded.record.filters ?? []);
      setRoute('workspace');
    },
    [locale, patchConfig, pushToast, setDataset, setFilters, setRoute, setUniverseId, setUniverseName],
  );

  const newUniverse = useCallback(() => {
    setDataset(null);
    setUniverseId(null);
    setUniverseName('');
    setRoute('home');
  }, [setDataset, setRoute, setUniverseId, setUniverseName]);

  const showFooter = route === 'home' || route === 'examples' || route === 'library';

  return (
    <div className="flex min-h-[100dvh] flex-col" data-theme={theme}>
      <Header />

      <main className="flex min-h-0 flex-1 flex-col">
        {ready && route === 'home' && <HomePage onLoaded={handleLoaded} onDemo={handleDemo} />}
        {ready && route === 'examples' && <ExamplesPage onDemo={handleDemo} />}
        {ready && route === 'library' && <LibraryPage onOpen={handleOpenUniverse} onNew={newUniverse} />}
        {ready && route === 'understand' && dataset && (
          <UnderstandPanel dataset={dataset} onGenerate={handleGenerate} />
        )}
        {ready && route === 'workspace' && dataset && (
          <WorkspacePage dataset={dataset} onBack={() => setRoute('library')} />
        )}
        {ready && !dataset && (route === 'workspace' || route === 'understand') && (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-1">{locale === 'zh' ? '还没有载入数据' : 'No dataset loaded'}</p>
              <button
                type="button"
                onClick={() => setRoute('home')}
                className="mt-2 text-[12px] accent-text underline underline-offset-2"
              >
                {locale === 'zh' ? '回到首页上传数据' : 'Go to the home page'}
              </button>
            </div>
          </div>
        )}
      </main>

      {showFooter && <Footer />}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] w-[min(92vw,420px)] -translate-x-1/2 animate-fade-up">
          <div
            className="pointer-events-auto flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12px] shadow-2xl"
            style={{
              background: 'var(--bg-2)',
              border: `1px solid ${toast.kind === 'error' ? 'rgba(248,113,113,0.4)' : 'var(--border-strong)'}`,
              color: toast.kind === 'error' ? '#fca5a5' : 'var(--text-0)',
            }}
            role="status"
          >
            <span
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: toast.kind === 'error' ? '#f87171' : toast.kind === 'success' ? '#34d399' : 'var(--accent)',
              }}
            />
            <span className="min-w-0 flex-1 leading-relaxed">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
