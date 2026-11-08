import Dexie, { type Table } from 'dexie';
import type { DataFilter, Dataset, UniverseRecord, VisualConfig } from '@/types';

export interface UniverseRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceFileName: string;
  rowCount: number;
  columnCount: number;
  mode: string;
  config: VisualConfig;
  filters: DataFilter[];
  thumbnail?: string;
  // Payload split so listing the library never loads megabytes of rows.
  meta: Dataset['meta'];
  fields: string[];
  columns: Dataset['columns'];
  geo?: Dataset['geo'];
  relations?: Dataset['relations'];
}

export interface RowsTable {
  universeId: string;
  chunk: number;
  rows: unknown[];
}

export class UniverseDB extends Dexie {
  universes!: Table<UniverseRow, string>;
  rows!: Table<RowsTable, [string, number]>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('data-universe');
    this.version(1).stores({
      universes: 'id, updatedAt, createdAt, name',
      rows: '[universeId+chunk], universeId',
      settings: 'key',
    });
  }
}

let dbInstance: UniverseDB | null = null;

export function getDB(): UniverseDB {
  if (!dbInstance) dbInstance = new UniverseDB();
  return dbInstance;
}

export const ROWS_PER_CHUNK = 2000;

export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  supported: boolean;
}

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0, supported: true };
    }
  } catch {
    /* ignore */
  }
  return { usage: 0, quota: 0, supported: false };
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

/** Persist a whole dataset + config as one universe. */
export async function saveUniverse(
  record: Omit<UniverseRow, 'meta' | 'fields' | 'columns' | 'geo' | 'relations'>,
  dataset: Dataset,
): Promise<void> {
  const db = getDB();
  const chunks: RowsTable[] = [];
  for (let i = 0; i < dataset.rows.length; i += ROWS_PER_CHUNK) {
    chunks.push({
      universeId: record.id,
      chunk: Math.floor(i / ROWS_PER_CHUNK),
      rows: dataset.rows.slice(i, i + ROWS_PER_CHUNK),
    });
  }
  try {
    await db.transaction('rw', db.universes, db.rows, async () => {
      await db.rows.where('universeId').equals(record.id).delete();
      await db.universes.put({
        ...record,
        mode: record.mode,
        meta: dataset.meta,
        fields: dataset.fields,
        columns: dataset.columns,
        geo: dataset.geo,
        relations: dataset.relations,
      });
      if (chunks.length > 0) await db.rows.bulkPut(chunks);
    });
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    if (name === 'QuotaExceededError' || /quota/i.test(String((e as Error)?.message))) {
      throw new QuotaError(
        '浏览器本地存储空间不足，作品未能保存。请删除一些旧作品，或先导出 JSON 备份后再清理。',
      );
    }
    throw e;
  }
}

export async function loadUniverse(id: string): Promise<{ record: UniverseRow; dataset: Dataset } | null> {
  const db = getDB();
  const record = await db.universes.get(id);
  if (!record) return null;
  const chunks = await db.rows.where('universeId').equals(id).toArray();
  chunks.sort((a, b) => a.chunk - b.chunk);
  const rows = chunks.flatMap((c) => c.rows as Dataset['rows']);
  return {
    record,
    dataset: {
      meta: record.meta,
      fields: record.fields,
      columns: record.columns,
      geo: record.geo,
      relations: record.relations,
      rows,
    },
  };
}

export async function listUniverses(): Promise<UniverseRecord[]> {
  const db = getDB();
  const all = await db.universes.orderBy('updatedAt').reverse().toArray();
  return all.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sourceFileName: r.sourceFileName,
    rowCount: r.rowCount,
    columnCount: r.columnCount,
    mode: r.mode as UniverseRecord['mode'],
    config: r.config,
    filters: r.filters,
    thumbnail: r.thumbnail,
    hasData: true,
  }));
}

export async function deleteUniverse(id: string): Promise<void> {
  const db = getDB();
  await db.transaction('rw', db.universes, db.rows, async () => {
    await db.rows.where('universeId').equals(id).delete();
    await db.universes.delete(id);
  });
}

export async function renameUniverse(id: string, name: string): Promise<void> {
  const db = getDB();
  await db.universes.update(id, { name, updatedAt: Date.now() });
}

export async function duplicateUniverse(id: string, newId: string, newName: string): Promise<boolean> {
  const loaded = await loadUniverse(id);
  if (!loaded) return false;
  await saveUniverse(
    {
      id: newId,
      name: newName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceFileName: loaded.record.sourceFileName,
      rowCount: loaded.record.rowCount,
      columnCount: loaded.record.columnCount,
      mode: loaded.record.mode,
      config: loaded.record.config,
      filters: loaded.record.filters,
      thumbnail: loaded.record.thumbnail,
    },
    loaded.dataset,
  );
  return true;
}

export async function updateConfig(id: string, config: VisualConfig, filters: DataFilter[], thumbnail?: string): Promise<void> {
  const db = getDB();
  await db.universes.update(id, {
    config,
    filters,
    mode: config.mode,
    updatedAt: Date.now(),
    ...(thumbnail ? { thumbnail } : {}),
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await getDB().settings.get(key);
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await getDB().settings.put({ key, value });
  } catch {
    /* non-fatal */
  }
}
