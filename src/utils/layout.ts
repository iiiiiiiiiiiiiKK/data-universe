import type { DataRow, DataFilter, FieldMapping, VisualConfig, ViewMode } from '@/types';
import { isBlank, toNumber, toTimestamp } from '@/features/data-engine/infer';
import { hashString, mulberry32 } from './cn';

export function defaultMapping(): FieldMapping {
  return {
    colorField: null,
    sizeField: null,
    weightField: null,
    labelField: null,
    timeField: null,
    valueField: null,
    edgeFromField: null,
    edgeToField: null,
    latField: null,
    lonField: null,
    matrixRowField: null,
    matrixColField: null,
    matrixValueField: null,
    distributionField: null,
  };
}

export function defaultConfig(mode: ViewMode = 'galaxy'): VisualConfig {
  return {
    mode,
    mapping: defaultMapping(),
    palette: 'nebula',
    layout: 'spiral',
    opacity: 0.9,
    sizeScale: 1,
    showLabels: true,
    showLinks: true,
    starfield: 0.6,
    animate: true,
    title: '',
    subtitle: '',
    distributionKind: 'histogram',
    matrixKind: 'heatmap',
    correlationMethod: 'pearson',
  };
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export function applyFilters(rows: DataRow[], filters: DataFilter[]): DataRow[] {
  const active = filters.filter((f) => f.enabled);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((f) => matchFilter(row, f)));
}

export function matchFilter(row: DataRow, f: DataFilter): boolean {
  const v = row[f.field];
  switch (f.kind) {
    case 'text': {
      if (!f.query) return true;
      return String(v ?? '')
        .toLowerCase()
        .includes(f.query.toLowerCase());
    }
    case 'numberRange': {
      const n = toNumber(v);
      if (n === null) return false;
      if (f.min !== undefined && n < f.min) return false;
      if (f.max !== undefined && n > f.max) return false;
      return true;
    }
    case 'dateRange': {
      const t = toTimestamp(v);
      if (t === null) return false;
      if (f.min !== undefined && t < f.min) return false;
      if (f.max !== undefined && t > f.max) return false;
      return true;
    }
    case 'category': {
      if (!f.values || f.values.length === 0) return true;
      return f.values.includes(String(v ?? ''));
    }
    case 'nullCheck': {
      return f.onlyMissing ? isBlank(v) : !isBlank(v);
    }
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ */
/* Spatial layouts                                                     */
/* ------------------------------------------------------------------ */

export interface NodePos {
  x: number;
  y: number;
  z: number;
  /** Index into the ORIGINAL row array (so details can look up the record). */
  row: number;
  /** Category value used for colouring. */
  category: string;
  /** Normalised weight 0..1 (size). */
  weight: number;
  /** Normalised brightness 0..1. */
  brightness: number;
  label: string;
}

export interface LinkPos {
  a: number;
  b: number;
  weight: number;
}

export interface GalaxyLayout {
  nodes: NodePos[];
  links: LinkPos[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** How many original rows were represented (sampling note). */
  sampled: { total: number; shown: number };
}

const MAX_NODES = 6000;

function normalize(values: Array<number | null>): { norm: (v: number | null) => number; hasData: boolean } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const hasData = Number.isFinite(min) && Number.isFinite(max) && max > min;
  return {
    norm: (v) => {
      if (v === null || !hasData) return 0.5;
      return (v - min) / (max - min);
    },
    hasData,
  };
}

/**
 * Build galaxy node positions from real data.
 *
 * Every node property (position, size, brightness, colour, label) is derived
 * from actual record values. Sampling is deterministic (stride) so the same
 * dataset always produces the same universe.
 */
export function buildGalaxyLayout(
  rows: DataRow[],
  mapping: FieldMapping,
  config: VisualConfig,
): GalaxyLayout {
  const total = rows.length;
  const stride = total > MAX_NODES ? Math.ceil(total / MAX_NODES) : 1;
  const picked: number[] = [];
  for (let i = 0; i < total; i += stride) picked.push(i);
  const shown = picked.length;

  const colorField = mapping.colorField;
  const sizeField = mapping.sizeField;
  const weightField = mapping.weightField;
  const labelField = mapping.labelField;

  const sizeVals = picked.map((i) => (sizeField ? toNumber(rows[i]![sizeField]) : null));
  const brightVals = picked.map((i) => (weightField ? toNumber(rows[i]![weightField]) : null));
  const sizeNorm = normalize(sizeVals);
  const brightNorm = normalize(brightVals);

  const rand = mulberry32(hashString(`${total}:${colorField ?? ''}:${sizeField ?? ''}:${weightField ?? ''}`));

  const categories: string[] = colorField
    ? picked.map((i) => String(rows[i]![colorField] ?? '—'))
    : [];

  // Group indices by category so clusters are spatially meaningful.
  const groups = new Map<string, number[]>();
  if (colorField) {
    picked.forEach((_rowIdx, k) => {
      const cat = categories[k]!;
      const arr = groups.get(cat) ?? [];
      arr.push(k);
      groups.set(cat, arr);
    });
  } else {
    groups.set('__all__', picked.map((_, k) => k));
  }

  const nodeCount = picked.length;
  const nodes: NodePos[] = new Array(nodeCount);
  const layout = config.layout;
  const R = 1000;

  if (layout === 'cluster' && colorField) {
    // Each category occupies a disc around a ring, positioned by a golden angle.
    const groupKeys = [...groups.keys()].sort();
    const golden = Math.PI * (3 - Math.sqrt(5));
    groupKeys.forEach((cat, gi) => {
      const members = groups.get(cat)!;
      const angle = gi * golden;
      const ringR = groupKeys.length === 1 ? 0 : R * 0.55 * Math.sqrt((gi + 0.7) / groupKeys.length);
      const cx = Math.cos(angle) * ringR;
      const cy = Math.sin(angle) * ringR;
      const localR = Math.max(24, R * 0.16 * Math.sqrt(members.length / Math.max(1, nodeCount)));
      members.forEach((k, mi) => {
        const a = mi * golden;
        const r = localR * Math.sqrt((mi + 0.5) / members.length);
        const jitter = 0.75 + rand() * 0.5;
        const rowIdx = picked[k]!;
        nodes[k] = {
          x: cx + Math.cos(a) * r * jitter,
          y: cy + Math.sin(a) * r * jitter,
          z: (rand() - 0.5) * 220,
          row: rowIdx,
          category: cat,
          weight: sizeNorm.norm(sizeVals[k] ?? null),
          brightness: brightNorm.norm(brightVals[k] ?? null),
          label: labelField ? String(rows[rowIdx]![labelField] ?? '') : cat,
        };
      });
    });
  } else if (layout === 'radial') {
    picked.forEach((rowIdx, k) => {
      const size = 0.35 + sizeNorm.norm(sizeVals[k] ?? null) * 0.65;
      const r = R * 0.22 + (R * 0.78 * Math.sqrt((k + 0.5) / nodeCount)) * size;
      const angle = (k / nodeCount) * Math.PI * 2 * 12 + rand() * 0.4;
      nodes[k] = {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: (rand() - 0.5) * 240,
        row: rowIdx,
        category: categories[k] ?? '__all__',
        weight: sizeNorm.norm(sizeVals[k] ?? null),
        brightness: brightNorm.norm(brightVals[k] ?? null),
        label: labelField ? String(rows[rowIdx]![labelField] ?? '') : '',
      };
    });
  } else if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const step = (R * 2) / Math.max(1, cols - 1 || 1);
    picked.forEach((rowIdx, k) => {
      const gx = k % cols;
      const gy = Math.floor(k / cols);
      nodes[k] = {
        x: -R + gx * step + (rand() - 0.5) * step * 0.5,
        y: -R + gy * step + (rand() - 0.5) * step * 0.5,
        z: (rand() - 0.5) * 160,
        row: rowIdx,
        category: categories[k] ?? '__all__',
        weight: sizeNorm.norm(sizeVals[k] ?? null),
        brightness: brightNorm.norm(brightVals[k] ?? null),
        label: labelField ? String(rows[rowIdx]![labelField] ?? '') : '',
      };
    });
  } else if (layout === 'force') {
    // Deterministic mini force simulation: category centres + local repulsion.
    const groupKeys = [...groups.keys()].sort();
    const golden = Math.PI * (3 - Math.sqrt(5));
    const centres = new Map<string, { x: number; y: number }>();
    groupKeys.forEach((cat, gi) => {
      const angle = gi * golden;
      const ringR = groupKeys.length === 1 ? 0 : R * 0.6 * Math.sqrt((gi + 0.6) / groupKeys.length);
      centres.set(cat, { x: Math.cos(angle) * ringR, y: Math.sin(angle) * ringR });
    });
    const sim = picked.map((rowIdx) => {
      const cat = colorField ? String(rows[rowIdx]![colorField] ?? '—') : '__all__';
      const c = centres.get(cat)!;
      return { x: c.x + (rand() - 0.5) * 60, y: c.y + (rand() - 0.5) * 60, cat, rowIdx };
    });
    const iterations = Math.min(90, Math.max(30, Math.floor(24000 / Math.max(1, nodeCount))));
    for (let it = 0; it < iterations; it++) {
      const alpha = 1 - it / iterations;
      // Repulsion between close pairs (O(n^2) capped for safety).
      const step = nodeCount > 1200 ? Math.ceil(nodeCount / 1200) : 1;
      for (let i = 0; i < sim.length; i += step) {
        const a = sim[i]!;
        for (let j = i + 1; j < sim.length; j += step) {
          const b = sim[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 0.01;
          if (d2 > 22500) continue;
          const f = (600 * alpha) / d2;
          a.x -= dx * f * 0.08;
          a.y -= dy * f * 0.08;
          b.x += dx * f * 0.08;
          b.y += dy * f * 0.08;
        }
        // Attraction to own category centre.
        const c = centres.get(a.cat)!;
        a.x += (c.x - a.x) * 0.02 * alpha;
        a.y += (c.y - a.y) * 0.02 * alpha;
      }
    }
    sim.forEach((s, k) => {
      nodes[k] = {
        x: s.x,
        y: s.y,
        z: (rand() - 0.5) * 200,
        row: s.rowIdx,
        category: s.cat,
        weight: sizeNorm.norm(sizeVals[k] ?? null),
        brightness: brightNorm.norm(brightVals[k] ?? null),
        label: labelField ? String(rows[s.rowIdx]![labelField] ?? '') : '',
      };
    });
  } else {
    // 'spiral' — the signature Data Universe look: an offset logarithmic spiral
    // whose radius scales with the record's own weight value.
    picked.forEach((rowIdx, k) => {
      const t = k / Math.max(1, nodeCount);
      const size = 0.3 + sizeNorm.norm(sizeVals[k] ?? null) * 0.7;
      const arms = colorField ? Math.max(2, Math.min(5, groups.size)) : 3;
      const armIdx = k % arms;
      const armOffset = (armIdx / arms) * Math.PI * 2;
      const theta = t * Math.PI * 2 * 4.2 + armOffset;
      const r = R * (0.06 + 0.94 * Math.pow(t, 0.82)) * (0.86 + size * 0.28);
      const spread = (1 - t) * 90 + 30;
      nodes[k] = {
        x: Math.cos(theta) * r + (rand() - 0.5) * spread,
        y: Math.sin(theta) * r + (rand() - 0.5) * spread,
        z: (rand() - 0.5) * (300 - t * 200),
        row: rowIdx,
        category: categories[k] ?? '__all__',
        weight: sizeNorm.norm(sizeVals[k] ?? null),
        brightness: brightNorm.norm(brightVals[k] ?? null),
        label: labelField ? String(rows[rowIdx]![labelField] ?? '') : '',
      };
    });
  }

  // Links: connect consecutive records inside the same category (a real
  // ordering relation from the data, not invented edges).
  const links: LinkPos[] = [];
  if (config.showLinks && colorField) {
    for (const members of groups.values()) {
      for (let i = 0; i + 1 < members.length; i++) {
        links.push({ a: members[i]!, b: members[i + 1]!, weight: 1 });
        if (links.length > 12000) break;
      }
      if (links.length > 12000) break;
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (!n) continue;
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  if (!Number.isFinite(minX)) {
    minX = -R;
    maxX = R;
    minY = -R;
    maxY = R;
  }

  return {
    nodes: nodes.filter(Boolean),
    links,
    bounds: { minX, maxX, minY, maxY },
    sampled: { total, shown },
  };
}

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

export interface NetworkGraph {
  nodes: Array<{ id: string; label: string; group: string; degree: number; rows: number[] }>;
  links: Array<{ source: string; target: string; weight: number }>;
  note: string;
}

/**
 * Build a node/edge graph from two real fields. Edges only ever come from
 * actual (parent → child) value pairs present in the data.
 */
export function buildNetwork(rows: DataRow[], fromField: string, toField: string, groupField?: string | null): NetworkGraph {
  const nodeMap = new Map<string, { id: string; label: string; group: string; degree: number; rows: number[] }>();
  const edgeMap = new Map<string, { source: string; target: string; weight: number }>();

  const ensure = (id: string, group: string): { id: string; label: string; group: string; degree: number; rows: number[] } => {
    let n = nodeMap.get(id);
    if (!n) {
      n = { id, label: id, group, degree: 0, rows: [] };
      nodeMap.set(id, n);
    }
    return n;
  };

  rows.forEach((row, i) => {
    const a = row[fromField];
    const b = row[toField];
    if (isBlank(a) || isBlank(b)) return;
    const aId = String(a);
    const bId = String(b);
    if (aId === bId) return;
    const gA = groupField ? String(row[groupField] ?? '—') : 'source';
    const gB = groupField ? String(row[groupField] ?? '—') : 'target';
    const na = ensure(aId, gA);
    const nb = ensure(bId, gB);
    na.rows.push(i);
    nb.rows.push(i);
    const key = `${aId}\u0001${bId}`;
    const e = edgeMap.get(key);
    if (e) e.weight++;
    else edgeMap.set(key, { source: aId, target: bId, weight: 1 });
  });

  for (const e of edgeMap.values()) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (s) s.degree += e.weight;
    if (t) t.degree += e.weight;
  }

  return {
    nodes: [...nodeMap.values()],
    links: [...edgeMap.values()],
    note: `基于「${fromField}」→「${toField}」的真实取值关系生成，共 ${edgeMap.size} 条边。`,
  };
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export interface TimelinePoint {
  time: number;
  value: number;
  row: number;
  category: string;
  label: string;
}

export interface TimelineModel {
  points: TimelinePoint[];
  /** Aggregated buckets for the overview strip. */
  buckets: Array<{ start: number; end: number; count: number; sum: number; avg: number }>;
  minTime: number;
  maxTime: number;
  minValue: number;
  maxValue: number;
  hasValue: boolean;
}

export function buildTimeline(
  rows: DataRow[],
  timeField: string,
  valueField: string | null,
  colorField: string | null,
  labelField: string | null,
  bucketCount = 60,
): TimelineModel {
  const points: TimelinePoint[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const t = toTimestamp(row[timeField]);
    if (t === null) continue;
    const v = valueField ? toNumber(row[valueField]) : null;
    points.push({
      time: t,
      value: v ?? 1,
      row: i,
      category: colorField ? String(row[colorField] ?? '—') : 'all',
      label: labelField ? String(row[labelField] ?? '') : '',
    });
  }
  points.sort((a, b) => a.time - b.time);

  const minTime = points.length ? points[0]!.time : Date.now();
  const maxTime = points.length ? points[points.length - 1]!.time : Date.now();
  const values = points.map((p) => p.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;

  const span = Math.max(1, maxTime - minTime);
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    start: minTime + (span * i) / bucketCount,
    end: minTime + (span * (i + 1)) / bucketCount,
    count: 0,
    sum: 0,
    avg: 0,
  }));
  for (const p of points) {
    const idx = Math.min(bucketCount - 1, Math.floor(((p.time - minTime) / span) * bucketCount));
    const b = buckets[idx]!;
    b.count++;
    b.sum += p.value;
  }
  for (const b of buckets) b.avg = b.count > 0 ? b.sum / b.count : 0;

  return {
    points,
    buckets,
    minTime,
    maxTime,
    minValue,
    maxValue,
    hasValue: Boolean(valueField),
  };
}

/* ------------------------------------------------------------------ */
/* Matrix                                                              */
/* ------------------------------------------------------------------ */

export interface MatrixModel {
  rowLabels: string[];
  colLabels: string[];
  /** values[rowIndex][colIndex] — null means no data for that cell. */
  values: Array<Array<number | null>>;
  min: number;
  max: number;
  /** Present when matrixKind === 'correlation'. */
  correlation?: { fields: string[]; matrix: number[][]; method: 'pearson' | 'spearman' };
}

export function aggregateMatrix(
  rows: DataRow[],
  rowField: string,
  colField: string,
  valueField: string | null,
  mode: 'sum' | 'avg' | 'count' = 'avg',
): MatrixModel {
  const rowCounts = new Map<string, number>();
  const colCounts = new Map<string, number>();
  for (const row of rows) {
    const r = String(row[rowField] ?? '—');
    const c = String(row[colField] ?? '—');
    rowCounts.set(r, (rowCounts.get(r) ?? 0) + 1);
    colCounts.set(c, (colCounts.get(c) ?? 0) + 1);
  }
  const rowLabels = [...rowCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k]) => k)
    .sort();
  const colLabels = [...colCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k]) => k)
    .sort();

  const rowIdx = new Map(rowLabels.map((l, i) => [l, i]));
  const colIdx = new Map(colLabels.map((l, i) => [l, i]));
  const sums = rowLabels.map(() => colLabels.map(() => 0));
  const counts = rowLabels.map(() => colLabels.map(() => 0));

  for (const row of rows) {
    const ri = rowIdx.get(String(row[rowField] ?? '—'));
    const ci = colIdx.get(String(row[colField] ?? '—'));
    if (ri === undefined || ci === undefined) continue;
    const v = valueField ? toNumber(row[valueField]) : 1;
    if (v === null) continue;
    sums[ri]![ci]! += v;
    counts[ri]![ci]! += 1;
  }

  let min = Infinity;
  let max = -Infinity;
  const values = sums.map((rowVals, ri) =>
    rowVals.map((s, ci) => {
      const c = counts[ri]![ci]!;
      if (c === 0) return null;
      const v = mode === 'count' || !valueField ? c : mode === 'sum' ? s : s / c;
      if (v < min) min = v;
      if (v > max) max = v;
      return v;
    }),
  );
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  return { rowLabels, colLabels, values, min, max };
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i]! - mx;
    const b = y[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function rank(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]![1]!] = avg;
    i = j + 1;
  }
  return ranks;
}

export function correlationMatrix(
  rows: DataRow[],
  numericFields: string[],
  method: 'pearson' | 'spearman',
): { fields: string[]; matrix: number[][]; method: 'pearson' | 'spearman' } {
  const cols = numericFields.map((f) => rows.map((r) => toNumber(r[f])));
  const matrix: number[][] = [];
  for (let i = 0; i < numericFields.length; i++) {
    matrix.push([]);
    for (let j = 0; j < numericFields.length; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let r = 0; r < rows.length; r++) {
        const a = cols[i]![r];
        const b = cols[j]![r];
        if (a === null || b === null) continue;
        xs.push(a);
        ys.push(b);
      }
      if (i === j) {
        matrix[i]!.push(1);
        continue;
      }
      if (xs.length < 3) {
        matrix[i]!.push(NaN);
        continue;
      }
      const v =
        method === 'spearman' ? pearson(rank(xs), rank(ys)) : pearson(xs, ys);
      matrix[i]!.push(Number.isFinite(v) ? v : NaN);
    }
  }
  return { fields: numericFields, matrix, method };
}

/* ------------------------------------------------------------------ */
/* Distribution                                                        */
/* ------------------------------------------------------------------ */

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export function buildHistogram(values: number[], binCount = 24): HistogramBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    start: min + (span * i) / binCount,
    end: min + (span * (i + 1)) / binCount,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor(((v - min) / span) * binCount);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx]!.count++;
  }
  return bins;
}

export interface BoxSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
  mean: number;
}

export function buildBox(values: number[]): BoxSummary | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const q = (p: number) => {
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    const lo = sorted[base]!;
    const hi = sorted[Math.min(base + 1, sorted.length - 1)]!;
    return lo + rest * (hi - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const outliers = sorted.filter((v) => v < lower || v > upper);
  const inliers = sorted.filter((v) => v >= lower && v <= upper);
  return {
    min: inliers[0] ?? sorted[0]!,
    max: inliers[inliers.length - 1] ?? sorted[sorted.length - 1]!,
    q1,
    median: q(0.5),
    q3,
    outliers: outliers.slice(0, 500),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

export interface ScatterPoint {
  x: number;
  y: number;
  row: number;
  category: string;
}

export function buildScatter(rows: DataRow[], xField: string, yField: string, colorField: string | null): ScatterPoint[] {
  const out: ScatterPoint[] = [];
  const stride = rows.length > 12000 ? Math.ceil(rows.length / 12000) : 1;
  for (let i = 0; i < rows.length; i += stride) {
    const row = rows[i]!;
    const x = toNumber(row[xField]);
    const y = toNumber(row[yField]);
    if (x === null || y === null) continue;
    out.push({ x, y, row: i, category: colorField ? String(row[colorField] ?? '—') : 'all' });
  }
  return out;
}
