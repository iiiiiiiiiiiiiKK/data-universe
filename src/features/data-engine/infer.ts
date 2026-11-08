import type { CellValue, FieldType } from '@/types';

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const INT_RE = /^[-+]?\d+$/;
const BOOL_TRUE = new Set(['true', 'yes', 'y', '1', '是', '真', 't']);
const BOOL_FALSE = new Set(['false', 'no', 'n', '0', '否', '假', 'f']);

const DATE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => number | null }> = [
  // 2024-05-01 / 2024/5/1
  {
    re: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/,
    build: (m) => {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return Date.UTC(y, mo - 1, d);
    },
  },
  // 2024-05-01T10:20:30Z / with space / with ms
  {
    re: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    build: (m) => {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const h = Number(m[4]);
      const mi = Number(m[5]);
      const s = Number(m[6] ?? 0);
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
      return Date.UTC(y, mo - 1, d, h, mi, s);
    },
  },
  // 2024-05 (year-month)
  {
    re: /^(\d{4})[-/.](\d{1,2})$/,
    build: (m) => {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (mo < 1 || mo > 12) return null;
      return Date.UTC(y, mo - 1, 1);
    },
  },
  // 05/01/2024 (US)
  {
    re: /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
    build: (m) => {
      const mo = Number(m[1]);
      const d = Number(m[2]);
      const y = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return Date.UTC(y, mo - 1, d);
    },
  },
  // ISO with milliseconds but no timezone: covered above.
];

export function isBlank(v: CellValue | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function toNumber(v: CellValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = v.trim();
  if (!s) return null;
  // Strip thousands separators and currency symbols, keep sign/exponent.
  const cleaned = s.replace(/[,\s_]/g, '').replace(/^[$€£¥￥]/, '').replace(/%$/, '');
  if (!NUMBER_RE.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function toBoolean(v: CellValue | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 0 ? false : v === 1 ? true : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (BOOL_TRUE.has(s)) return true;
  if (BOOL_FALSE.has(s)) return false;
  return null;
}

export function toTimestamp(v: CellValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    // Heuristic: treat plausible epoch values as timestamps.
    if (v > 1e12 && v < 4e12) return v; // ms
    if (v > 1e9 && v < 4e9) return v * 1000; // s
    return null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  for (const p of DATE_PATTERNS) {
    const m = s.match(p.re);
    if (m) {
      const t = p.build(m);
      if (t !== null) return t;
    }
  }
  // Fall back to Date.parse for RFC/other well-known formats, but only when it
  // looks like a real date string (containing a separator and 4-digit year).
  if (/\d{4}/.test(s) && /[-/:T ]/.test(s)) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** True when every non-blank value looks like an integer. */
export function looksLikeInteger(v: CellValue | undefined): boolean {
  if (typeof v === 'number') return Number.isInteger(v);
  if (typeof v !== 'string') return false;
  const s = v.trim().replace(/[,\s_]/g, '');
  return INT_RE.test(s);
}

export interface TypeProbe {
  type: FieldType;
  confidence: number;
}

/**
 * Infer a field type from a sample of values using conservative rules:
 * a type is only assigned when a high share of present values agree.
 */
export function inferFieldType(values: CellValue[], fieldName = ''): TypeProbe {
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return { type: 'unknown', confidence: 0 };

  const n = present.length;
  let numericCount = 0;
  let intCount = 0;
  let boolCount = 0;
  let dateCount = 0;
  let datetimeCount = 0;
  const distinct = new Set<string>();

  for (const v of present) {
    if (toNumber(v) !== null) {
      numericCount++;
      if (looksLikeInteger(v)) intCount++;
    }
    if (typeof v === 'boolean' || toBoolean(v) !== null) boolCount++;
    const ts = toTimestamp(v);
    if (ts !== null) {
      dateCount++;
      if (/(\d{1,2}:\d{2})/.test(String(v))) datetimeCount++;
    }
    distinct.add(String(v));
  }

  const ratio = (c: number) => c / n;
  const lowerName = fieldName.toLowerCase();
  const nameLat = /^(lat|latitude|纬度)$/.test(lowerName) || /(^|[_\s])lat(itude)?($|[_\s])/.test(lowerName);
  const nameLon =
    /^(lon|lng|long|longitude|经度)$/.test(lowerName) || /(^|[_\s])(lon|lng|long|longitude)($|[_\s])/.test(lowerName);

  // Latitude / longitude names take priority when the values are geographically valid.
  if (numericCount / n > 0.9) {
    const nums = present.map((v) => toNumber(v)).filter((x): x is number => x !== null);
    const inLatRange = nums.every((x) => x >= -90 && x <= 90);
    const inLonRange = nums.every((x) => x >= -180 && x <= 180);
    if (nameLat && inLatRange) return { type: 'latitude', confidence: 0.99 };
    if (nameLon && inLonRange) return { type: 'longitude', confidence: 0.99 };
  }

  if (ratio(boolCount) > 0.95 && distinct.size <= 2) return { type: 'boolean', confidence: ratio(boolCount) };

  if (ratio(dateCount) > 0.9) {
    if (datetimeCount / dateCount > 0.3) return { type: 'datetime', confidence: ratio(dateCount) };
    return { type: 'date', confidence: ratio(dateCount) };
  }

  if (ratio(numericCount) > 0.9) {
    if (ratio(intCount) > 0.98) {
      // Small-cardinality integers are usually category codes, not measures.
      const perValue = distinct.size / n;
      if (distinct.size <= 12 && perValue < 0.5) return { type: 'category', confidence: 0.7 };
      return { type: 'integer', confidence: ratio(numericCount) };
    }
    return { type: 'float', confidence: ratio(numericCount) };
  }

  // Low-cardinality strings behave like categories for visual mapping purposes.
  const uniqueRatio = distinct.size / n;
  if (n >= 8 && uniqueRatio < 0.5) return { type: 'category', confidence: 0.85 };
  if (distinct.size <= 24 && uniqueRatio < 0.9) return { type: 'category', confidence: 0.7 };
  return { type: 'string', confidence: 1 - ratio(numericCount) };
}
