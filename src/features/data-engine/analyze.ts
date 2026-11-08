import type {
  CategoryStats,
  ColumnStats,
  ColumnRole,
  DataRow,
  Dataset,
  DatasetMeta,
  DateStats,
  FieldType,
  GeoPoint,
  NumberStats,
} from '@/types';
import { inferFieldType, isBlank, toNumber, toTimestamp } from './infer';

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sorted[base]!;
  const hi = sorted[Math.min(base + 1, sorted.length - 1)]!;
  return lo + rest * (hi - lo);
}

export function median(values: number[]): number {
  return quantile(
    values.slice().sort((a, b) => a - b),
    0.5,
  );
}

export function numericStats(values: number[]): NumberStats {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = n > 1 ? sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const iqrLower = q1 - 1.5 * iqr;
  const iqrUpper = q3 + 1.5 * iqr;
  let outlierCount = 0;
  for (const v of sorted) if (v < iqrLower || v > iqrUpper) outlierCount++;
  return {
    min: sorted[0]!,
    max: sorted[n - 1]!,
    mean,
    median: quantile(sorted, 0.5),
    sum,
    stdDev: Math.sqrt(variance),
    q1,
    q3,
    iqrLower,
    iqrUpper,
    outlierCount,
  };
}

export function categoryStats(values: string[], limit = 40): CategoryStats {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const all = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    uniqueCount: counts.size,
    top: all.slice(0, 10),
    distribution: all.slice(0, limit),
  };
}

function formatDate(ts: number, granularity: DateStats['granularity']): string {
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, '0');
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  if (granularity === 'year') return String(y);
  if (granularity === 'month') return `${y}-${mo}`;
  if (granularity === 'second') return `${y}-${mo}-${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${y}-${mo}-${day}`;
}

export function dateStats(values: number[]): DateStats {
  const sorted = values.slice().sort((a, b) => a - b);
  const minTime = sorted[0]!;
  const maxTime = sorted[sorted.length - 1]!;
  const span = maxTime - minTime;
  const DAY = 86400000;
  const granularity: DateStats['granularity'] =
    span > 1000 * DAY * 365 * 3 ? 'year' : span > 1000 * DAY * 60 ? 'month' : span > 1000 * DAY ? 'day' : 'second';
  return {
    minTime,
    maxTime,
    span,
    minLabel: formatDate(minTime, granularity),
    maxLabel: formatDate(maxTime, granularity),
    granularity,
  };
}

function roleFor(type: FieldType, distinct: number, total: number, field: string): ColumnRole {
  if (type === 'latitude' || type === 'longitude') return 'geo';
  if (type === 'date' || type === 'datetime') return 'time';
  if (type === 'integer' || type === 'float') return 'measure';
  if (/^(id|uuid|key|编号|序号|索引)$/i.test(field)) return 'identifier';
  if (distinct === total && total > 0) return 'identifier';
  return 'dimension';
}

function countDuplicates(rows: DataRow[], fields: string[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const row of rows) {
    const key = fields.map((f) => `${typeof row[f]}:${String(row[f])}`).join('\u0001');
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes;
}

function detectGeo(
  fields: string[],
  rows: DataRow[],
  columns: ColumnStats[],
): Dataset['geo'] {
  const latCandidates = columns.filter(
    (c) => c.type === 'latitude' || (/lat/i.test(c.field) && (c.type === 'float' || c.type === 'integer')),
  );
  const lonCandidates = columns.filter(
    (c) =>
      c.type === 'longitude' || (/lon|lng|long/i.test(c.field) && (c.type === 'float' || c.type === 'integer')),
  );
  for (const lat of latCandidates) {
    for (const lon of lonCandidates) {
      if (lat.field === lon.field) continue;
      const points: GeoPoint[] = [];
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      rows.forEach((row, i) => {
        const la = toNumber(row[lat.field]);
        const lo = toNumber(row[lon.field]);
        if (la === null || lo === null) return;
        if (la < -90 || la > 90 || lo < -180 || lo > 180) return;
        points.push({ lat: la, lon: lo, row: i });
        minLat = Math.min(minLat, la);
        maxLat = Math.max(maxLat, la);
        minLon = Math.min(minLon, lo);
        maxLon = Math.max(maxLon, lo);
      });
      // Require meaningful coverage before advertising a map mode.
      if (points.length >= Math.max(3, Math.floor(rows.length * 0.25))) {
        return {
          latField: lat.field,
          lonField: lon.field,
          points,
          bounds: { minLat, maxLat, minLon, maxLon },
        };
      }
    }
  }
  // Some datasets only have field names that hint at geography; only accept
  // those when the numeric values are actually inside valid ranges.
  const maybeLat = fields.find((f) => /^(lat|latitude)$/i.test(f));
  const maybeLon = fields.find((f) => /^(lon|lng|longitude)$/i.test(f));
  if (maybeLat && maybeLon) {
    const points: GeoPoint[] = [];
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    rows.forEach((row, i) => {
      const la = toNumber(row[maybeLat]);
      const lo = toNumber(row[maybeLon]);
      if (la === null || lo === null) return;
      if (la < -90 || la > 90 || lo < -180 || lo > 180) return;
      points.push({ lat: la, lon: lo, row: i });
      minLat = Math.min(minLat, la);
      maxLat = Math.max(maxLat, la);
      minLon = Math.min(minLon, lo);
      maxLon = Math.max(maxLon, lo);
    });
    if (points.length >= 3) {
      return {
        latField: maybeLat,
        lonField: maybeLon,
        points,
        bounds: { minLat, maxLat, minLon, maxLon },
      };
    }
  }
  return undefined;
}

/**
 * Suggest possible parent/child relationships by comparing value overlap of
 * low-cardinality fields against higher-cardinality "id"-like fields.
 * These are *candidates* backed by real value overlap — never invented edges.
 */
function detectRelations(fields: string[], rows: DataRow[], columns: ColumnStats[]): Dataset['relations'] {
  const out: Array<{ from: string; to: string; score: number; reason: string }> = [];
  if (rows.length === 0 || rows.length > 50000) return out;
  const sampleRows = rows.length > 8000 ? rows.filter((_, i) => i % Math.ceil(rows.length / 8000) === 0) : rows;

  const valueSets = new Map<string, Set<string>>();
  for (const c of columns) {
    if (c.type === 'string' || c.type === 'category') {
      const set = new Set<string>();
      for (const row of sampleRows) {
        const v = row[c.field];
        if (!isBlank(v)) set.add(String(v));
        if (set.size > 20000) break;
      }
      valueSets.set(c.field, set);
    }
  }

  const entries = [...valueSets.entries()].filter(([, s]) => s.size >= 2);

  // A parent/child candidate: child values largely contained in parent values,
  // parent has strictly more distinct values.
  for (const [childField, childSet] of entries) {
    for (const [parentField, parentSet] of entries) {
      if (childField === parentField) continue;
      if (parentSet.size <= childSet.size) continue;
      if (childSet.size < 2) continue;
      let hit = 0;
      for (const v of childSet) if (parentSet.has(v)) hit++;
      const overlap = hit / childSet.size;
      if (overlap >= 0.6) {
        out.push({
          from: parentField,
          to: childField,
          score: overlap,
          reason: `值包含度 ${(overlap * 100).toFixed(1)}%`,
        });
      }
    }
  }

  // Also propose link-by-shared-category when two categorical fields co-vary.
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aField, aSet] = entries[i]!;
      const [bField, bSet] = entries[j]!;
      if (aSet.size <= 1 || bSet.size <= 1) continue;
      let inter = 0;
      for (const v of aSet) if (bSet.has(v)) inter++;
      const jaccard = inter / (aSet.size + bSet.size - inter);
      if (jaccard > 0.5 && !out.some((r) => (r.from === aField && r.to === bField) || (r.from === bField && r.to === aField))) {
        out.push({
          from: aField,
          to: bField,
          score: jaccard,
          reason: `取值重合度 ${(jaccard * 100).toFixed(1)}%`,
        });
      }
    }
  }

  // Name-hint relations: "user_id"/"user" style pairs, still verified by overlap.
  const idLike = fields.filter((f) => /(_id|Id|ID|_key|Key)$/.test(f));
  for (const idField of idLike) {
    const base = idField.replace(/(_id|Id|ID|_key|Key)$/, '');
    const target = fields.find((f) => f !== idField && f.toLowerCase() === base.toLowerCase());
    if (target && !out.some((r) => r.from === target && r.to === idField)) {
      const aSet = valueSets.get(target);
      const bSet = valueSets.get(idField);
      if (aSet && bSet && aSet.size > 0) out.push({ from: target, to: idField, score: 0.5, reason: '字段命名推断（需人工确认）' });
    }
  }

  return out
    .filter((r, i, arr) => arr.findIndex((x) => x.from === r.from && x.to === r.to) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export interface AnalyzeOptions {
  fieldTypes?: Record<string, FieldType>;
}

/**
 * Full column analysis + dataset-level quality checks.
 * Runs in O(rows * columns) and is safe for the worker.
 */
export function analyzeDataset(
  meta: DatasetMeta,
  fields: string[],
  rows: DataRow[],
  options: AnalyzeOptions = {},
): Dataset {
  const columns: ColumnStats[] = [];
  const warnings = [...meta.warnings];

  for (const field of fields) {
    const raw: unknown[] = rows.map((r) => r[field]);
    const present: NonNullable<typeof raw[number]>[] = [];
    for (const v of raw) if (!isBlank(v as never)) present.push(v as never);

    const forced = options.fieldTypes?.[field];
    const probe = forced ? { type: forced, confidence: 1 } : inferFieldType(raw as never[], field);
    const type = probe.type;

    const distinctSet = new Set<string>();
    const samples: ColumnStats['samples'] = [];
    for (const v of present) {
      const s = String(v);
      distinctSet.add(s);
      if (samples.length < 3 && !samples.some((x) => String(x) === s)) samples.push(v as never);
    }

    const stat: ColumnStats = {
      field,
      type,
      role: roleFor(type, distinctSet.size, present.length, field),
      total: rows.length,
      valid: present.length,
      missing: rows.length - present.length,
      distinct: distinctSet.size,
      samples,
      confidence: probe.confidence,
    };

    if (type === 'integer' || type === 'float') {
      const nums: number[] = [];
      for (const v of present) {
        const n = toNumber(v as never);
        if (n !== null) nums.push(n);
      }
      if (nums.length > 0) stat.numeric = numericStats(nums);
    } else if (type === 'date' || type === 'datetime') {
      const times: number[] = [];
      for (const v of present) {
        const t = toTimestamp(v as never);
        if (t !== null) times.push(t);
      }
      if (times.length > 0) stat.date = dateStats(times);
    } else {
      stat.category = categoryStats(present.map((v) => String(v)));
      if (stat.category.uniqueCount === present.length && present.length > 20) {
        stat.role = 'identifier';
      }
    }

    if (stat.missing / Math.max(1, rows.length) > 0.6) {
      warnings.push(`字段「${field}」缺失率超过 60%，可视化时可能影响判断。`);
    }
    if (type === 'unknown') {
      warnings.push(`字段「${field}」无法解析出明确类型，已按文本处理。`);
    }

    columns.push(stat);
  }

  const emptyRows = rows.filter((r) => fields.every((f) => isBlank(r[f]))).length;
  const duplicateRows = countDuplicates(rows, fields);
  if (duplicateRows > 0) warnings.push(`检测到 ${duplicateRows} 行完全重复的数据。`);

  const outliers = columns.filter((c) => (c.numeric?.outlierCount ?? 0) > 0);
  if (outliers.length > 0) {
    warnings.push(
      `以下字段存在 IQR(1.5×) 判定为离群的值：${outliers
        .slice(0, 5)
        .map((c) => `${c.field}(${c.numeric!.outlierCount})`)
        .join('、')}。离群值不等于错误数据。`,
    );
  }

  const geo = detectGeo(fields, rows, columns);
  const relations = detectRelations(fields, rows, columns);

  return {
    meta: {
      ...meta,
      rows: rows.length,
      columns: fields.length,
      emptyRows,
      duplicateRows,
      warnings,
    },
    fields,
    rows,
    columns,
    geo,
    relations: relations && relations.length > 0 ? relations : undefined,
  };
}
