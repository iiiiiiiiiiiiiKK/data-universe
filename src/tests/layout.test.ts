import { describe, expect, it } from 'vitest';
import {
  aggregateMatrix,
  applyFilters,
  buildBox,
  buildGalaxyLayout,
  buildHistogram,
  buildNetwork,
  buildTimeline,
  correlationMatrix,
  defaultConfig,
  defaultMapping,
  matchFilter,
  pearson,
} from '@/utils/layout';
import type { DataFilter } from '@/types';

const rows = [
  { name: 'A', value: 10, cat: 'x', when: '2024-01-01', parent: 'p1', lat: 10, lon: 20 },
  { name: 'B', value: 20, cat: 'y', when: '2024-02-01', parent: 'p1', lat: 11, lon: 21 },
  { name: 'C', value: 30, cat: 'x', when: '2024-03-01', parent: 'p2', lat: 12, lon: 22 },
  { name: 'D', value: 40, cat: 'y', when: '2024-04-01', parent: 'p2', lat: 13, lon: 23 },
];

describe('applyFilters', () => {
  const textFilter: DataFilter = { id: '1', field: 'name', kind: 'text', query: 'a', enabled: true };

  it('returns all rows with no active filters', () => {
    expect(applyFilters(rows, [])).toHaveLength(4);
  });

  it('filters by text, case-insensitively', () => {
    const out = applyFilters(rows, [textFilter]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('A');
  });

  it('ignores disabled filters', () => {
    expect(applyFilters(rows, [{ ...textFilter, enabled: false }])).toHaveLength(4);
  });

  it('filters by number range', () => {
    const out = applyFilters(rows, [
      { id: '2', field: 'value', kind: 'numberRange', min: 20, max: 40, enabled: true },
    ]);
    expect(out.map((r) => r.name)).toEqual(['B', 'C', 'D']);
  });

  it('filters by category selection', () => {
    const out = applyFilters(rows, [{ id: '3', field: 'cat', kind: 'category', values: ['x'], enabled: true }]);
    expect(out.map((r) => r.name)).toEqual(['A', 'C']);
  });

  it('filters fully synchronised with the canvas contract (date range)', () => {
    const out = applyFilters(rows, [
      {
        id: '4',
        field: 'when',
        kind: 'dateRange',
        min: Date.UTC(2024, 1, 1),
        max: Date.UTC(2024, 2, 1),
        enabled: true,
      },
    ]);
    expect(out.map((r) => r.name)).toEqual(['B', 'C']);
  });

  it('filters nulls both ways', () => {
    const withNull = [{ a: 1 }, { a: null }];
    expect(applyFilters(withNull as never, [{ id: '5', field: 'a', kind: 'nullCheck', onlyMissing: true, enabled: true }])).toHaveLength(1);
    expect(applyFilters(withNull as never, [{ id: '6', field: 'a', kind: 'nullCheck', onlyMissing: false, enabled: true }])).toHaveLength(1);
  });

  it('matchFilter treats a blank text query as a pass-through', () => {
    expect(matchFilter(rows[0] as never, { id: 'x', field: 'name', kind: 'text', enabled: true })).toBe(true);
  });
});

describe('buildGalaxyLayout', () => {
  it('creates one node per row with deterministic positions', () => {
    const config = { ...defaultConfig('galaxy'), mapping: { ...defaultMapping(), colorField: 'cat', sizeField: 'value', labelField: 'name' } };
    const a = buildGalaxyLayout(rows as never, config.mapping, config);
    const b = buildGalaxyLayout(rows as never, config.mapping, config);
    expect(a.nodes).toHaveLength(4);
    expect(a.nodes[0]!.x).toBe(b.nodes[0]!.x);
    expect(a.nodes[0]!.y).toBe(b.nodes[0]!.y);
  });

  it('maps size and colour from real values', () => {
    const config = { ...defaultConfig('galaxy'), mapping: { ...defaultMapping(), colorField: 'cat', sizeField: 'value' } };
    const layout = buildGalaxyLayout(rows as never, config.mapping, config);
    const weights = layout.nodes.map((n) => n.weight);
    expect(Math.min(...weights)).toBe(0);
    expect(Math.max(...weights)).toBe(1);
    expect(new Set(layout.nodes.map((n) => n.category)).size).toBe(2);
  });

  it('labels come from the label field', () => {
    const config = { ...defaultConfig('galaxy'), mapping: { ...defaultMapping(), labelField: 'name' } };
    const layout = buildGalaxyLayout(rows as never, config.mapping, config);
    expect(layout.nodes.map((n) => n.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('noticeably samples very large datasets', () => {
    const big = Array.from({ length: 20000 }, (_, i) => ({ v: i }));
    const config = defaultConfig('galaxy');
    const layout = buildGalaxyLayout(big as never, config.mapping, config);
    expect(layout.sampled.total).toBe(20000);
    expect(layout.sampled.shown).toBeLessThanOrEqual(6000);
    expect(layout.nodes.length).toBe(layout.sampled.shown);
  });
});

describe('buildNetwork', () => {
  it('builds edges only from real value pairs', () => {
    const g = buildNetwork(rows as never, 'parent', 'name');
    expect(g.nodes).toHaveLength(6); // p1, p2 + A..D
    expect(g.links).toHaveLength(4);
  });

  it('skips rows with blank endpoints', () => {
    const g = buildNetwork([{ a: 'x', b: null }, { a: 'x', b: 'y' }] as never, 'a', 'b');
    expect(g.links).toHaveLength(1);
  });

  it('skips self-loops', () => {
    const g = buildNetwork([{ a: 'x', b: 'x' }] as never, 'a', 'b');
    expect(g.links).toHaveLength(0);
  });
});

describe('buildTimeline', () => {
  it('sorts points by real timestamps', () => {
    const m = buildTimeline(rows as never, 'when', 'value', 'cat', 'name', 4);
    expect(m.points).toHaveLength(4);
    expect(m.points[0]!.time).toBeLessThan(m.points[3]!.time);
    expect(m.hasValue).toBe(true);
  });

  it('reports the true min/max value range', () => {
    const m = buildTimeline(rows as never, 'when', 'value', null, null, 4);
    expect(m.minValue).toBe(10);
    expect(m.maxValue).toBe(40);
  });

  it('drops rows with unparseable times', () => {
    const m = buildTimeline([{ t: 'not a date', v: 1 }, { t: '2024-01-01', v: 2 }] as never, 't', 'v', null, null, 2);
    expect(m.points).toHaveLength(1);
  });
});

describe('matrix helpers', () => {
  it('aggregates averages into a matrix', () => {
    const m = aggregateMatrix(rows as never, 'parent', 'cat', 'value', 'avg');
    expect(m.rowLabels).toEqual(['p1', 'p2']);
    expect(m.colLabels).toEqual(['x', 'y']);
    expect(m.values[0]![0]).toBe(10);
    expect(m.values[1]![1]).toBe(40);
  });

  it('counts when no value field is provided', () => {
    const m = aggregateMatrix(rows as never, 'parent', 'cat', null, 'count');
    expect(m.values[0]![0]).toBe(1);
  });

  it('leaves empty combinations null rather than zero', () => {
    const sparse = [{ r: 'a', c: 'x', v: 1 }];
    const m = aggregateMatrix(sparse as never, 'r', 'c', 'v', 'sum');
    expect(m.values[0]![0]).toBe(1);
  });
});

describe('correlation', () => {
  it('pearson of identical series is 1', () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('pearson of inverse series is -1', () => {
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });

  it('correlationMatrix has unit diagonal and is symmetric', () => {
    const c = correlationMatrix(rows as never, ['value', 'lat'], 'pearson');
    expect(c.matrix[0]![0]).toBe(1);
    expect(c.matrix[1]![1]).toBe(1);
    expect(c.matrix[0]![1]).toBeCloseTo(c.matrix[1]![0]!);
  });

  it('spearman handles equal values without NaN', () => {
    const c = correlationMatrix(
      [{ a: 1, b: 5 }, { a: 2, b: 5 }, { a: 3, b: 6 }] as never,
      ['a', 'b'],
      'spearman',
    );
    expect(Number.isFinite(c.matrix[0]![1]!)).toBe(true);
  });
});

describe('distribution helpers', () => {
  it('histogram bin counts sum to the input length', () => {
    const bins = buildHistogram([1, 2, 3, 4, 5], 5);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(5);
  });

  it('histogram handles identical values without dividing by zero', () => {
    const bins = buildHistogram([5, 5, 5], 4);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(3);
  });

  it('box summary excludes outlier whiskers', () => {
    const b = buildBox([1, 2, 2, 3, 3, 4, 100]);
    expect(b).not.toBeNull();
    expect(b!.max).toBeLessThan(100);
    expect(b!.outliers).toContain(100);
  });

  it('box returns null for no values', () => {
    expect(buildBox([])).toBeNull();
  });
});
