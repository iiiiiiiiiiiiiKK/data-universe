import type { PaletteId } from '@/types';
import { hashString } from './cn';

export interface Palette {
  id: PaletteId;
  name: { zh: string; en: string };
  /** Categorical colours for star/node fills. */
  colors: string[];
  /** Accent used for highlights and the active UI state. */
  accent: string;
  /** Deep background gradient stops (dark theme). */
  background: [string, string, string];
}

export const PALETTES: Record<PaletteId, Palette> = {
  nebula: {
    id: 'nebula',
    name: { zh: '星云', en: 'Nebula' },
    colors: ['#7d96f8', '#8b6cff', '#c084fc', '#f472b6', '#5eead4', '#facc15', '#38bdf8', '#fb923c'],
    accent: '#8b6cff',
    background: ['#04060f', '#080d1d', '#0c1226'],
  },
  aurora: {
    id: 'aurora',
    name: { zh: '极光', en: 'Aurora' },
    colors: ['#2ed3a6', '#6ce6c4', '#34d399', '#22d3ee', '#0ea5e9', '#a3e635', '#fde047', '#f0abfc'],
    accent: '#2ed3a6',
    background: ['#03090b', '#061318', '#08181d'],
  },
  solar: {
    id: 'solar',
    name: { zh: '恒星', en: 'Solar' },
    colors: ['#ffa62b', '#ffc46b', '#f97316', '#ef4444', '#f43f5e', '#fbbf24', '#fcd34d', '#fdba74'],
    accent: '#ffa62b',
    background: ['#0a0503', '#150a05', '#1d0f07'],
  },
  ice: {
    id: 'ice',
    name: { zh: '冰蓝', en: 'Ice' },
    colors: ['#7dd3fc', '#38bdf8', '#60a5fa', '#93c5fd', '#bae6fd', '#67e8f9', '#a5b4fc', '#e0f2fe'],
    accent: '#38bdf8',
    background: ['#03070f', '#050c18', '#071023'],
  },
  magma: {
    id: 'magma',
    name: { zh: '熔岩', en: 'Magma' },
    colors: ['#fbbf24', '#f59e0b', '#ea580c', '#dc2626', '#be123c', '#9f1239', '#fb7185', '#fda4af'],
    accent: '#ea580c',
    background: ['#0b0402', '#150804', '#1c0b05'],
  },
  spectrum: {
    id: 'spectrum',
    name: { zh: '光谱', en: 'Spectrum' },
    colors: [
      '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
      '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
      '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    ],
    accent: '#6366f1',
    background: ['#05060f', '#0a0b17', '#0f1020'],
  },
  mono: {
    id: 'mono',
    name: { zh: '单色', en: 'Mono' },
    colors: ['#e5ecff', '#c8d6ff', '#a3b8ff', '#7d96f8', '#5b74e8', '#4a5fd0', '#3b4bb0', '#2c3888'],
    accent: '#7d96f8',
    background: ['#05060a', '#0a0c14', '#0f121d'],
  },
};

export const PALETTE_LIST = Object.values(PALETTES);

/** Stable colour assignment so the same category always gets the same hue. */
export function colorForCategory(category: string, palette: Palette, distinctCategories?: number): string {
  const idx = hashString(category) % palette.colors.length;
  // When the palette covers most categories, use the plain hash bucket so
  // colours stay stable while categories are filtered out.
  if (distinctCategories && distinctCategories <= palette.colors.length) {
    return palette.colors[idx]!;
  }
  return palette.colors[idx]!;
}

export function buildColorMap(categories: string[], palette: Palette): Map<string, string> {
  const map = new Map<string, string>();
  const sorted = [...new Set(categories)].sort();
  sorted.forEach((cat, i) => {
    map.set(cat, palette.colors[i % palette.colors.length]!);
  });
  return map;
}

/** Continuous heat gradient for matrices / heatmaps. */
export function interpolateColor(t: number, from: [number, number, number], to: [number, number, number]): string {
  const k = Math.min(1, Math.max(0, t));
  const c = from.map((v, i) => Math.round(v + (to[i]! - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0, [12, 18, 38]],
  [0.25, [46, 63, 138]],
  [0.5, [122, 85, 242]],
  [0.75, [214, 106, 196]],
  [1, [255, 196, 107]],
];

export function heatColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [t0, c0] = HEAT_STOPS[i]!;
    const [t1, c1] = HEAT_STOPS[i + 1]!;
    if (clamped >= t0 && clamped <= t1) {
      const local = (clamped - t0) / (t1 - t0 || 1);
      return interpolateColor(local, c0, c1);
    }
  }
  return interpolateColor(clamped, HEAT_STOPS[0]![1], HEAT_STOPS[HEAT_STOPS.length - 1]![1]);
}
