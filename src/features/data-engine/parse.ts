import Papa from 'papaparse';
import type { CellValue, DataRow, DatasetMeta, FieldType } from '@/types';
import { isBlank, toNumber } from './infer';
import { analyzeDataset } from './analyze';

export const DEFAULT_MAX_FILE_BYTES = 40 * 1024 * 1024; // 40 MB
export const HARD_ROW_LIMIT = 300_000;

export class ParseError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

function normalizeHeader(h: string, index: number): string {
  const trimmed = h.trim();
  return trimmed.length > 0 ? trimmed : `column_${index + 1}`;
}

function coerceCell(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.trim() === '' ? null : s;
}

/** Strip UTF-8 BOM which otherwise breaks the first header name. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface RawTable {
  fields: string[];
  rows: DataRow[];
}

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const parsed = Papa.parse<string[]>(sample, { delimiter: d, preview: 20, skipEmptyLines: 'greedy' });
    const widths = parsed.data.filter((r) => r.length > 1).map((r) => r.length);
    if (widths.length === 0) continue;
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    const consistent = widths.every((w) => w === widths[0]) ? 1.5 : 1;
    const score = avg * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseDelimited(text: string, fileName: string, fileSize: number, forcedDelimiter?: string): {
  meta: DatasetMeta;
  table: RawTable;
} {
  const clean = stripBom(text);
  if (clean.trim().length === 0) {
    throw new ParseError('文件内容为空。', '请确认文件不是 0 字节，或另存为 UTF-8 编码后重试。');
  }
  const delimiter = forcedDelimiter ?? detectDelimiter(clean);
  const parsed = Papa.parse<string[]>(clean, {
    delimiter,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });

  if (parsed.data.length === 0) {
    throw new ParseError('未解析到任何数据行。', '请检查分隔符是否与文件实际格式一致。');
  }

  const warnings: string[] = [];
  const fatal = parsed.errors.filter((e) => e.type === 'Quotes' || e.type === 'Delimiter');
  if (fatal.length > 0) {
    warnings.push(`CSV 结构告警：${fatal[0]!.message}（第 ${(fatal[0]!.row ?? 0) + 1} 行附近）`);
  }

  const headerRow = parsed.data[0]!;
  const fields = headerRow.map((h, i) => normalizeHeader(String(h ?? ''), i));
  // De-duplicate duplicated header names so records keep every column.
  const seen = new Map<string, number>();
  const uniqueFields = fields.map((f) => {
    const c = seen.get(f) ?? 0;
    seen.set(f, c + 1);
    return c === 0 ? f : `${f}_${c + 1}`;
  });

  const rows: DataRow[] = [];
  for (let r = 1; r < parsed.data.length; r++) {
    const raw = parsed.data[r]!;
    if (raw.length === 0) continue;
    const row: DataRow = {};
    for (let c = 0; c < uniqueFields.length; c++) {
      row[uniqueFields[c]!] = coerceCell(raw[c]);
    }
    rows.push(row);
    if (rows.length >= HARD_ROW_LIMIT) {
      warnings.push(`已达到行数上限 ${HARD_ROW_LIMIT}，后续行未载入。`);
      break;
    }
  }

  const widthMismatch = parsed.data.slice(1).filter((r) => r.length !== uniqueFields.length).length;
  if (widthMismatch > 0) {
    warnings.push(`有 ${widthMismatch} 行的列数与表头不一致，缺失部分已按空值处理。`);
  }

  const meta: DatasetMeta = {
    fileName,
    fileSize,
    fileType: delimiter === '\t' ? 'TSV' : 'CSV',
    rows: rows.length,
    columns: uniqueFields.length,
    emptyRows: 0,
    duplicateRows: 0,
    parsedAt: Date.now(),
    parser: delimiter === '\t' ? 'tsv' : 'csv',
    warnings,
  };

  return { meta, table: { fields: uniqueFields, rows } };
}

/** Flatten nested JSON objects into dotted keys, arrays into JSON strings. */
export function flattenObject(obj: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      flattenObject(v as Record<string, unknown>, key, out);
    } else if (Array.isArray(v)) {
      // Keep arrays readable but lossless: primitives join, objects stringify.
      const allPrimitive = v.every((x) => x === null || typeof x !== 'object');
      out[key] = allPrimitive ? v.map((x) => (x === null ? '' : String(x))).join(' | ') : JSON.stringify(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

export function tableFromRecords(records: Array<Record<string, unknown>>): RawTable {
  const fields: string[] = [];
  const fieldSet = new Set<string>();
  const flat = records.map((r) => flattenObject(r));
  for (const r of flat) {
    for (const k of Object.keys(r)) {
      if (!fieldSet.has(k)) {
        fieldSet.add(k);
        fields.push(k);
      }
    }
  }
  const rows: DataRow[] = flat.map((r) => {
    const row: DataRow = {};
    for (const f of fields) row[f] = coerceCell(r[f]);
    return row;
  });
  return { fields, rows };
}

export function parseJson(text: string, fileName: string, fileSize: number): { meta: DatasetMeta; table: RawTable } {
  const clean = stripBom(text);
  let data: unknown;
  try {
    data = JSON.parse(clean);
  } catch (e) {
    throw new ParseError('JSON 解析失败。', e instanceof Error ? e.message : '文件不是合法的 JSON。');
  }

  let records: Array<Record<string, unknown>> | null = null;
  const warnings: string[] = [];

  if (Array.isArray(data)) {
    if (data.length === 0) throw new ParseError('JSON 数组为空。', '至少需要一条记录才能生成数据宇宙。');
    if (data.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      records = data as Array<Record<string, unknown>>;
    } else {
      records = data.map((x, i) => ({ index: i, value: x as unknown }));
      warnings.push('JSON 数组包含非对象元素，已包装为 index/value 两列。');
    }
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Common envelope shapes: { data: [...] } / { rows: [...] } / { items: [...] }
    const arrayKey = Object.keys(obj).find(
      (k) => Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0 && typeof (obj[k] as unknown[])[0] === 'object',
    );
    if (arrayKey) {
      records = obj[arrayKey] as Array<Record<string, unknown>>;
      warnings.push(`已从对象字段「${arrayKey}」中提取 ${records.length} 条记录。`);
    } else {
      records = [obj];
      warnings.push('JSON 是单个对象，已作为 1 行数据处理（嵌套字段已展开为点号路径）。');
    }
  }

  if (!records) throw new ParseError('无法识别的 JSON 结构。', '请提供对象数组，或包含对象数组字段的对象。');
  if (records.length > HARD_ROW_LIMIT) {
    warnings.push(`已达到行数上限 ${HARD_ROW_LIMIT}，后续记录未载入。`);
    records = records.slice(0, HARD_ROW_LIMIT);
  }

  const table = tableFromRecords(records);
  if (table.fields.length === 0) throw new ParseError('JSON 中没有可用字段。');

  const meta: DatasetMeta = {
    fileName,
    fileSize,
    fileType: 'JSON',
    rows: table.rows.length,
    columns: table.fields.length,
    emptyRows: 0,
    duplicateRows: 0,
    parsedAt: Date.now(),
    parser: 'json',
    warnings,
  };
  return { meta, table };
}

export async function parseWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  fileSize: number,
): Promise<{ meta: DatasetMeta; table: RawTable }> {
  // Lazily import SheetJS so it stays out of the initial bundle.
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ParseError('工作簿中没有工作表。');
  const sheet = wb.Sheets[sheetName]!;
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  if (json.length === 0) throw new ParseError(`工作表「${sheetName}」没有数据行。`);

  const table = tableFromRecords(json.slice(0, HARD_ROW_LIMIT));
  const warnings: string[] = [];
  if (wb.SheetNames.length > 1) {
    warnings.push(`工作簿包含 ${wb.SheetNames.length} 个工作表，当前仅载入「${sheetName}」。`);
  }
  if (json.length > HARD_ROW_LIMIT) warnings.push(`已达到行数上限 ${HARD_ROW_LIMIT}，后续行未载入。`);

  const meta: DatasetMeta = {
    fileName,
    fileSize,
    fileType: 'XLSX',
    rows: table.rows.length,
    columns: table.fields.length,
    emptyRows: 0,
    duplicateRows: 0,
    parsedAt: Date.now(),
    parser: 'xlsx',
    warnings,
  };
  return { meta, table };
}

export interface ParseFileResult {
  dataset: ReturnType<typeof analyzeDataset>;
  rawText?: string;
}

/**
 * Entry point used by the import UI. Chooses the parser from the file type,
 * then analyses every column.
 */
export async function parseFile(file: File, maxBytes = DEFAULT_MAX_FILE_BYTES): Promise<ParseFileResult> {
  if (file.size > maxBytes) {
    throw new ParseError(
      `文件过大（${(file.size / 1048576).toFixed(1)} MB），超过当前上限 ${(maxBytes / 1048576).toFixed(0)} MB。`,
      '请先在 Excel / Python 中抽样或聚合后再上传。当前限制是为了避免浏览器内存溢出。',
    );
  }
  const name = file.name;
  const lower = name.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) {
    const buffer = await file.arrayBuffer();
    const { meta, table } = await parseWorkbook(buffer, name, file.size);
    const dataset = analyzeDataset(meta, table.fields, table.rows);
    return { dataset };
  }

  const text = await readTextSmart(file);

  if (lower.endsWith('.json')) {
    const { meta, table } = parseJson(text, name, file.size);
    return { dataset: analyzeDataset(meta, table.fields, table.rows), rawText: text };
  }

  const forced = lower.endsWith('.tsv') ? '\t' : undefined;
  const { meta, table } = parseDelimited(text, name, file.size, forced);
  return { dataset: analyzeDataset(meta, table.fields, table.rows), rawText: text };
}

/**
 * Read a text file, auto-detecting UTF-8 / GBK-ish payloads.
 * Browsers cannot decode GBK without a lookup table, so we fall back to
 * UTF-8 with replacement characters and warn the caller via the meta warnings.
 */
export async function readTextSmart(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacementCount > 0 && typeof TextDecoder !== 'undefined') {
    try {
      const gbk = new TextDecoder('gbk', { fatal: false }).decode(buffer);
      const gbkReplacement = (gbk.match(/\uFFFD/g) ?? []).length;
      if (gbkReplacement < replacementCount) return gbk;
    } catch {
      // 'gbk' label unsupported in this browser: keep the UTF-8 result.
    }
  }
  return utf8;
}

/** Compute a stable content hash for duplicate detection of imports. */
export function hashRows(rows: DataRow[], fields: string[]): string {
  let h1 = 0x811c9dc5;
  const push = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
  };
  for (const row of rows.slice(0, 500)) {
    for (const f of fields) push(`${f}=${String(row[f])};`);
  }
  push(String(rows.length));
  return h1.toString(16);
}

/** Suggest the best-fitting view modes from the analysed dataset. */
export function recommendModes(dataset: {
  columns: Array<{ type: FieldType }>;
  geo?: unknown;
  relations?: unknown;
}): string[] {
  const types = dataset.columns.map((c) => c.type);
  const out: string[] = ['galaxy'];
  if (dataset.relations) out.push('network');
  else if (types.includes('category') || types.includes('string')) out.push('network');
  if (types.some((t) => t === 'date' || t === 'datetime')) out.push('timeline');
  if (dataset.geo) out.push('map');
  if (types.some((t) => t === 'integer' || t === 'float')) {
    out.push('matrix');
    out.push('distribution');
  }
  return out;
}

/** Used by the filter engine and maps to test "is this numeric-ish". */
export function asNumber(v: CellValue): number | null {
  return isBlank(v) ? null : toNumber(v);
}
