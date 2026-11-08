import { create } from 'zustand';
import type { DataFilter, Dataset, FieldMapping, UniverseRecord, ViewMode, VisualConfig, ThemeMode } from '@/types';
import { defaultConfig, defaultMapping } from '@/utils/layout';
import type { Locale } from '@/locales';
import { translate } from '@/locales';

export type Route = 'home' | 'understand' | 'workspace' | 'library' | 'examples';

interface HistoryEntry {
  config: VisualConfig;
  filters: DataFilter[];
}

interface AppState {
  /* routing */
  route: Route;
  setRoute: (r: Route) => void;

  /* settings */
  locale: Locale;
  theme: ThemeMode;
  setLocale: (l: Locale) => void;
  setTheme: (t: ThemeMode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;

  /* current dataset */
  dataset: Dataset | null;
  setDataset: (d: Dataset | null) => void;
  /** Raw text retained so "re-parse" works without reselecting a file. */
  rawText: string | null;
  setRawText: (t: string | null) => void;

  /* universe being edited */
  universeId: string | null;
  universeName: string;
  setUniverseId: (id: string | null) => void;
  setUniverseName: (n: string) => void;

  /* visual config + filters w/ history */
  config: VisualConfig;
  filters: DataFilter[];
  history: HistoryEntry[];
  future: HistoryEntry[];
  patchConfig: (patch: Partial<VisualConfig>) => void;
  patchMapping: (patch: Partial<FieldMapping>) => void;
  setFilters: (f: DataFilter[]) => void;
  addFilter: (f: DataFilter) => void;
  updateFilter: (id: string, patch: Partial<DataFilter>) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;
  undo: () => void;
  redo: () => void;
  resetConfig: () => void;

  /* selection */
  selectedRow: number | null;
  setSelectedRow: (r: number | null) => void;
  selectedRows: number[];
  toggleRowSelection: (r: number) => void;
  clearSelection: () => void;

  /* search */
  search: string;
  setSearch: (s: string) => void;

  /* library cache */
  universes: UniverseRecord[];
  setUniverses: (u: UniverseRecord[]) => void;

  /* toasts */
  toast: { id: number; message: string; kind: 'info' | 'error' | 'success' } | null;
  pushToast: (message: string, kind?: 'info' | 'error' | 'success') => void;
  clearToast: () => void;
}

const HISTORY_LIMIT = 60;

export const useApp = create<AppState>((set, get) => ({
  route: 'home',
  setRoute: (r) => set({ route: r }),

  locale: 'zh',
  theme: 'dark',
  setLocale: (l) => set({ locale: l }),
  setTheme: (t) => {
    set({ theme: t });
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', t === 'dark');
    }
  },
  t: (key, params) => translate(get().locale, key, params),

  dataset: null,
  setDataset: (d) => set({ dataset: d }),
  rawText: null,
  setRawText: (t) => set({ rawText: t }),

  universeId: null,
  universeName: '',
  setUniverseId: (id) => set({ universeId: id }),
  setUniverseName: (n) => set({ universeName: n }),

  config: defaultConfig(),
  filters: [],
  history: [],
  future: [],

  patchConfig: (patch) => {
    const { config, filters, history } = get();
    const next: VisualConfig = { ...config, ...patch };
    set({
      config: next,
      history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }],
      future: [],
    });
  },

  patchMapping: (patch) => {
    const { config, filters, history } = get();
    const next: VisualConfig = { ...config, mapping: { ...config.mapping, ...patch } };
    set({
      config: next,
      history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }],
      future: [],
    });
  },

  setFilters: (f) => {
    const { config, filters, history } = get();
    set({
      filters: f,
      history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }],
      future: [],
    });
  },

  addFilter: (f) => {
    const { config, filters, history } = get();
    const next = [...filters, f];
    set({ filters: next, history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }], future: [] });
  },

  updateFilter: (id, patch) => {
    const { config, filters, history } = get();
    const next = filters.map((f) => (f.id === id ? { ...f, ...patch } : f));
    set({ filters: next, history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }], future: [] });
  },

  removeFilter: (id) => {
    const { config, filters, history } = get();
    const next = filters.filter((f) => f.id !== id);
    set({ filters: next, history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }], future: [] });
  },

  clearFilters: () => {
    const { config, filters, history } = get();
    set({ filters: [], history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }], future: [] });
  },

  undo: () => {
    const { config, filters, history, future } = get();
    const last = history[history.length - 1];
    if (!last) return;
    set({
      config: last.config,
      filters: last.filters,
      history: history.slice(0, -1),
      future: [{ config, filters }, ...future].slice(0, HISTORY_LIMIT),
    });
  },

  redo: () => {
    const { config, filters, history, future } = get();
    const next = future[0];
    if (!next) return;
    set({
      config: next.config,
      filters: next.filters,
      history: [...history, { config, filters }].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    });
  },

  resetConfig: () => {
    const { config, filters, history } = get();
    set({
      config: { ...defaultConfig(config.mode), mapping: defaultMapping() },
      filters: [],
      history: [...history.slice(-HISTORY_LIMIT + 1), { config, filters }],
      future: [],
    });
  },

  selectedRow: null,
  setSelectedRow: (r) => set({ selectedRow: r }),
  selectedRows: [],
  toggleRowSelection: (r) => {
    const { selectedRows } = get();
    set({
      selectedRows: selectedRows.includes(r) ? selectedRows.filter((x) => x !== r) : [...selectedRows, r],
    });
  },
  clearSelection: () => set({ selectedRows: [] }),

  search: '',
  setSearch: (s) => set({ search: s }),

  universes: [],
  setUniverses: (u) => set({ universes: u }),

  toast: null,
  pushToast: (message, kind = 'info') => {
    const id = Date.now();
    set({ toast: { id, message, kind } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },
  clearToast: () => set({ toast: null }),
}));

/** Convenience selector for the active view mode. */
export function useMode(): ViewMode {
  return useApp((s) => s.config.mode);
}
