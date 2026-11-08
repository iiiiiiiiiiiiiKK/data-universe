import { describe, expect, it } from 'vitest';
import { inferFieldType, isBlank, toBoolean, toNumber, toTimestamp } from '@/features/data-engine/infer';
import { analyzeDataset, categoryStats, median, numericStats, quantile } from '@/features/data-engine/analyze';

describe('toNumber', () => {
  it('parses plain numbers', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber('-3.5')).toBe(-3.5);
    expect(toNumber(7)).toBe(7);
  });

  it('strips thousands separators and currency', () => {
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('$1,000')).toBe(1000);
  });

  it('returns null for non-numeric values', () => {
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('toBoolean', () => {
  it('maps common truthy/falsy tokens', () => {
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean('yes')).toBe(true);
    expect(toBoolean('是')).toBe(true);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean('否')).toBe(false);
  });
});

describe('toTimestamp', () => {
  it('parses ISO dates', () => {
    expect(toTimestamp('2024-05-01')).toBe(Date.UTC(2024, 4, 1));
  });

  it('parses ISO datetimes', () => {
    expect(toTimestamp('2024-05-01T10:20:30')).toBe(Date.UTC(2024, 4, 1, 10, 20, 30));
  });

  it('parses year-month only', () => {
    expect(toTimestamp('2024-05')).toBe(Date.UTC(2024, 4, 1));
  });

  it('parses slash-separated dates', () => {
    expect(toTimestamp('2024/5/1')).toBe(Date.UTC(2024, 4, 1));
  });

  it('rejects nonsense', () => {
    expect(toTimestamp('hello')).toBeNull();
    expect(toTimestamp('2024-13-45')).toBeNull();
  });

  it('treats plausible epochs as timestamps', () => {
    expect(toTimestamp(1700000000000)).toBe(1700000000000);
    expect(toTimestamp(1700000000)).toBe(1700000000000);
  });
});

describe('isBlank', () => {
  it('detects blanks', () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank(0)).toBe(false);
  });
});

describe('inferFieldType', () => {
  it('detects integers', () => {
    expect(inferFieldType(['1', '2', '3', '4']).type).toBe('integer');
    expect(inferFieldType(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']).type).toBe('integer');
  });

  it('treats repeated small-cardinality integers as category codes', () => {
    // 3 distinct values over 21 rows: a code column, not a measure.
    const codes = Array.from({ length: 21 }, (_, i) => String(i % 3));
    expect(inferFieldType(codes).type).toBe('category');
  });

  it('treats 0/1 columns as boolean', () => {
    const flags = Array.from({ length: 20 }, (_, i) => String(i % 2));
    expect(inferFieldType(flags).type).toBe('boolean');
  });

  it('detects floats', () => {
    expect(inferFieldType(['1.5', '2.25', '3.125', '4.5']).type).toBe('float');
  });

  it('detects dates', () => {
    expect(inferFieldType(['2024-01-01', '2024-02-01', '2024-03-01']).type).toBe('date');
  });

  it('detects datetimes', () => {
    expect(
      inferFieldType(['2024-01-01T10:00:00', '2024-02-01T11:30:00', '2024-03-01T12:45:00']).type,
    ).toBe('datetime');
  });

  it('detects booleans', () => {
    expect(inferFieldType(['true', 'false', 'true']).type).toBe('boolean');
  });

  it('detects low-cardinality categories', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 'red' : 'blue'));
    expect(inferFieldType(values).type).toBe('category');
  });

  it('detects free text', () => {
    const values = Array.from({ length: 20 }, (_, i) => `unique value number ${i} with words`);
    expect(inferFieldType(values).type).toBe('string');
  });

  it('recognises latitude/longitude by name and range', () => {
    expect(inferFieldType(['10.5', '45.2', '-33.9'], 'lat').type).toBe('latitude');
    expect(inferFieldType(['110.5', '45.2', '-33.9'], 'lon').type).toBe('longitude');
  });

  it('does not claim latitude for out-of-range values', () => {
    expect(inferFieldType(['999', '888'], 'lat').type).not.toBe('latitude');
  });

  it('returns unknown for empty input', () => {
    expect(inferFieldType([]).type).toBe('unknown');
    expect(inferFieldType([null, '', null]).type).toBe('unknown');
  });
});

describe('statistics helpers', () => {
  it('quantile interpolates', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('median of an even set averages the middles', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('numericStats computes summary values', () => {
    const s = numericStats([1, 2, 3, 4, 5]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.sum).toBe(15);
    expect(s.q1).toBe(2);
    expect(s.q3).toBe(4);
  });

  it('numericStats flags IQR outliers, not merely large values', () => {
    const s = numericStats([1, 2, 2, 3, 3, 4, 100]);
    expect(s.outlierCount).toBe(1);
  });

  it('categoryStats counts and sorts', () => {
    const c = categoryStats(['a', 'b', 'a', 'a']);
    expect(c.uniqueCount).toBe(2);
    expect(c.top[0]).toEqual({ value: 'a', count: 3 });
  });
});

describe('analyzeDataset', () => {
  const meta = {
    fileName: 'test.csv',
    fileSize: 100,
    fileType: 'CSV',
    rows: 0,
    columns: 0,
    emptyRows: 0,
    duplicateRows: 0,
    parsedAt: Date.now(),
    parser: 'csv' as const,
    warnings: [],
  };

  it('analyses numeric, category, date and geo fields', () => {
    const rows = [
      { city: 'A', pop: 10, when: '2024-01-01', lat: 10, lon: 20 },
      { city: 'B', pop: 20, when: '2024-02-01', lat: 11, lon: 21 },
      { city: 'A', pop: 30, when: '2024-03-01', lat: 12, lon: 22 },
      { city: 'C', pop: 40, when: '2024-04-01', lat: 13, lon: 23 },
    ];
    const ds = analyzeDataset(meta, ['city', 'pop', 'when', 'lat', 'lon'], rows);
    expect(ds.meta.rows).toBe(4);
    expect(ds.columns.find((c) => c.field === 'pop')!.numeric!.sum).toBe(100);
    expect(ds.columns.find((c) => c.field === 'city')!.category!.uniqueCount).toBe(3);
    expect(ds.columns.find((c) => c.field === 'when')!.date).toBeDefined();
    expect(ds.geo).toBeDefined();
    expect(ds.geo!.latField).toBe('lat');
    expect(ds.geo!.lonField).toBe('lon');
  });

  it('counts duplicates and empty rows', () => {
    const rows = [
      { a: 1, b: 2 },
      { a: 1, b: 2 },
      { a: null, b: null },
    ];
    const ds = analyzeDataset(meta, ['a', 'b'], rows);
    expect(ds.meta.duplicateRows).toBe(1);
    expect(ds.meta.emptyRows).toBe(1);
  });

  it('warns about high missing rates', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ a: i < 2 ? i : null }));
    const ds = analyzeDataset(meta, ['a'], rows as never);
    expect(ds.meta.warnings.some((w) => w.includes('缺失率'))).toBe(true);
  });

  it('does not fabricate geo when values are out of range', () => {
    const rows = [
      { lat: 999, lon: 999 },
      { lat: 888, lon: 888 },
      { lat: 777, lon: 777 },
    ];
    const ds = analyzeDataset(meta, ['lat', 'lon'], rows);
    expect(ds.geo).toBeUndefined();
  });
});
