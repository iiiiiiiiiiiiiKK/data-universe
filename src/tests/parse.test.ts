import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  flattenObject,
  parseDelimited,
  parseJson,
  stripBom,
  tableFromRecords,
} from '@/features/data-engine/parse';

describe('stripBom', () => {
  it('removes a leading UTF-8 BOM', () => {
    expect(stripBom('\uFEFFa,b')).toBe('a,b');
  });

  it('leaves plain text untouched', () => {
    expect(stripBom('a,b')).toBe('a,b');
  });
});

describe('detectDelimiter', () => {
  it('detects commas', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',');
  });

  it('detects tabs', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3\n4\t5\t6')).toBe('\t');
  });

  it('detects semicolons', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';');
  });

  it('detects pipes', () => {
    expect(detectDelimiter('a|b|c\n1|2|3\n4|5|6')).toBe('|');
  });
});

describe('parseDelimited', () => {
  it('parses a normal CSV', () => {
    const { meta, table } = parseDelimited('name,age\nAda,36\nAlan,41', 'a.csv', 100);
    expect(meta.rows).toBe(2);
    expect(meta.columns).toBe(2);
    expect(table.fields).toEqual(['name', 'age']);
    expect(table.rows[0]).toEqual({ name: 'Ada', age: '36' });
  });

  it('parses Chinese headers and values', () => {
    const { table } = parseDelimited('城市,人口\n北京,2189\n上海,2487', 'cn.csv', 80);
    expect(table.fields).toEqual(['城市', '人口']);
    expect(table.rows[1]!.城市).toBe('上海');
  });

  it('handles a BOM-prefixed file', () => {
    const { table } = parseDelimited('\uFEFFid,value\n1,10', 'bom.csv', 30);
    expect(table.fields[0]).toBe('id');
  });

  it('de-duplicates repeated header names', () => {
    const { table } = parseDelimited('a,a,b\n1,2,3', 'dup.csv', 20);
    expect(table.fields).toEqual(['a', 'a_2', 'b']);
  });

  it('fills missing header names with column_N', () => {
    const { table } = parseDelimited('a,,c\n1,2,3', 'h.csv', 20);
    expect(table.fields).toEqual(['a', 'column_2', 'c']);
  });

  it('treats empty cells as null', () => {
    const { table } = parseDelimited('a,b\n1,\n,2', 'n.csv', 20);
    expect(table.rows[0]!.b).toBeNull();
    expect(table.rows[1]!.a).toBeNull();
  });

  it('warns when rows have a different column count', () => {
    const { meta } = parseDelimited('a,b,c\n1,2\n1,2,3', 'w.csv', 20);
    expect(meta.warnings.some((w) => w.includes('列数'))).toBe(true);
  });

  it('throws on an empty file', () => {
    expect(() => parseDelimited('   ', 'empty.csv', 10)).toThrowError(/为空/);
  });
});

describe('flattenObject', () => {
  it('flattens nested objects into dotted paths', () => {
    expect(flattenObject({ a: { b: 1, c: { d: 2 } } })).toEqual({ 'a.b': 1, 'a.c.d': 2 });
  });

  it('joins primitive arrays', () => {
    expect(flattenObject({ tags: ['x', 'y'] })).toEqual({ tags: 'x | y' });
  });

  it('stringifies object arrays', () => {
    const out = flattenObject({ items: [{ a: 1 }] });
    expect(out.items).toBe('[{"a":1}]');
  });
});

describe('parseJson', () => {
  it('parses an array of objects', () => {
    const { meta, table } = parseJson('[{"a":1},{"a":2}]', 'd.json', 30);
    expect(meta.rows).toBe(2);
    expect(table.fields).toEqual(['a']);
  });

  it('parses a nested array found inside an object', () => {
    const { table, meta } = parseJson('{"data":[{"x":1},{"x":2}]}', 'd.json', 30);
    expect(table.rows).toHaveLength(2);
    expect(meta.warnings.some((w) => w.includes('data'))).toBe(true);
  });

  it('wraps a single object into one row', () => {
    const { meta, table } = parseJson('{"a":1,"b":2}', 'd.json', 30);
    expect(meta.rows).toBe(1);
    expect(table.fields).toEqual(['a', 'b']);
  });

  it('wraps primitive arrays as index/value', () => {
    const { table } = parseJson('[1,2,3]', 'd.json', 20);
    expect(table.fields).toEqual(['index', 'value']);
    expect(table.rows).toHaveLength(3);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJson('{oops', 'd.json', 10)).toThrowError(/JSON 解析失败/);
  });

  it('throws on an empty array', () => {
    expect(() => parseJson('[]', 'd.json', 10)).toThrowError(/为空/);
  });
});

describe('tableFromRecords', () => {
  it('unions keys across heterogeneous records', () => {
    const table = tableFromRecords([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }]);
    expect(table.fields).toEqual(['a', 'b', 'c']);
    expect(table.rows[1]).toEqual({ a: null, b: 2, c: null });
  });
});
