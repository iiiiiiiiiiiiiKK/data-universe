/**
 * Core domain types for Data Universe.
 *
 * Everything here is plain data so it can be cloned across the
 * main thread / Web Worker boundary without loss.
 */

/** A single cell value after parsing. `null` means "missing". */
export type CellValue = string | number | boolean | null;

/** One parsed record, keyed by field name. */
export type DataRow = Record<string, CellValue>;

/** Detected semantic type of a field. */
export type FieldType =
  | 'string'
  | 'integer'
  | 'float'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'category'
  | 'latitude'
  | 'longitude'
  | 'unknown';

export type ColumnRole = 'dimension' | 'measure' | 'time' | 'geo' | 'identifier';

export interface NumberStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  sum: number;
  stdDev: number;
  q1: number;
  q3: number;
  /** Lower/upper fence of the IQR method (1.5 * IQR by default). */
  iqrLower: number;
  iqrUpper: number;
  outlierCount: number;
}

export interface CategoryStats {
  uniqueCount: number;
  /** Most frequent values, descending. */
  top: Array<{ value: string; count: number }>;
  /** Up to 40 buckets used for distribution rendering. */
  distribution: Array<{ value: string; count: number }>;
}

export interface DateStats {
  minTime: number;
  maxTime: number;
  /** Milliseconds. */
  span: number;
  minLabel: string;
  maxLabel: string;
  granularity: 'day' | 'month' | 'year' | 'second';
}

export interface ColumnStats {
  field: string;
  type: FieldType;
  role: ColumnRole;
  total: number;
  valid: number;
  missing: number;
  distinct: number;
  /** A few representative non-null values. */
  samples: CellValue[];
  numeric?: NumberStats;
  category?: CategoryStats;
  date?: DateStats;
  /** Share of values that could be coerced to the detected type, 0..1. */
  confidence: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  row: number;
}

export interface DatasetMeta {
  fileName: string;
  fileSize: number;
  fileType: string;
  rows: number;
  columns: number;
  /** Rows dropped or flagged for containing no data at all. */
  emptyRows: number;
  /** Fully duplicated rows (all fields equal). */
  duplicateRows: number;
  parsedAt: number;
  /** Which parser produced the dataset. */
  parser: 'csv' | 'tsv' | 'json' | 'xlsx' | 'demo';
  /** Non-fatal warnings produced during parsing/analysis. */
  warnings: string[];
}

export interface Dataset {
  meta: DatasetMeta;
  fields: string[];
  rows: DataRow[];
  columns: ColumnStats[];
  /** Detected lat/lon field pair, if any. */
  geo?: {
    latField: string;
    lonField: string;
    points: GeoPoint[];
    /** Bounding box of the valid points. */
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  };
  /** Suggested fields for building a relationship network (id-like or FK-like). */
  relations?: Array<{ from: string; to: string; score: number; reason: string }>;
}

/** The six visual universes. */
export type ViewMode = 'galaxy' | 'network' | 'timeline' | 'map' | 'matrix' | 'distribution';

export type ThemeMode = 'dark' | 'light';

export type PaletteId =
  | 'nebula'
  | 'aurora'
  | 'solar'
  | 'ice'
  | 'magma'
  | 'spectrum'
  | 'mono';

export interface FieldMapping {
  /** Field whose values become star/node colour / category. */
  colorField: string | null;
  /** Numeric field mapped to size. */
  sizeField: string | null;
  /** Numeric field mapped to brightness / weight. */
  weightField: string | null;
  /** Field used for labels. */
  labelField: string | null;
  /** Time field for the timeline mode. */
  timeField: string | null;
  /** Numeric field for the timeline value axis. */
  valueField: string | null;
  /** Source field of network edges (parent key). */
  edgeFromField: string | null;
  /** Target field of network edges (child key). */
  edgeToField: string | null;
  /** Latitude field for map mode. */
  latField: string | null;
  /** Longitude field for map mode. */
  lonField: string | null;
  /** Categorical field used for matrix rows. */
  matrixRowField: string | null;
  /** Categorical field used for matrix columns. */
  matrixColField: string | null;
  /** Numeric field aggregated inside the matrix. */
  matrixValueField: string | null;
  /** Field used for distribution x axis. */
  distributionField: string | null;
}

export type LayoutKind = 'spiral' | 'radial' | 'cluster' | 'grid' | 'force';

export interface VisualConfig {
  mode: ViewMode;
  mapping: FieldMapping;
  palette: PaletteId;
  /** Layout algorithm for galaxy/network. */
  layout: LayoutKind;
  /** Base node opacity 0..1. */
  opacity: number;
  /** Global size multiplier 0.4..3. */
  sizeScale: number;
  /** Show labels when zoomed in. */
  showLabels: boolean;
  /** Show connecting lines between related nodes. */
  showLinks: boolean;
  /** Background starfield density 0..1. */
  starfield: number;
  /** Rotation/animation of the galaxy. */
  animate: boolean;
  title: string;
  subtitle: string;
  /** Distribution sub-type. */
  distributionKind: 'histogram' | 'box' | 'scatter' | 'density' | 'share';
  /** Matrix sub-type. */
  matrixKind: 'heatmap' | 'correlation';
  /** Correlation method used when matrixKind === 'correlation'. */
  correlationMethod: 'pearson' | 'spearman';
}

export type FilterKind = 'text' | 'numberRange' | 'dateRange' | 'category' | 'nullCheck';

export interface DataFilter {
  id: string;
  field: string;
  kind: FilterKind;
  /** text */
  query?: string;
  /** number/date range */
  min?: number;
  max?: number;
  /** category */
  values?: string[];
  /** null check: true keeps only missing values */
  onlyMissing?: boolean;
  enabled: boolean;
}

export interface UniverseRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceFileName: string;
  rowCount: number;
  columnCount: number;
  mode: ViewMode;
  config: VisualConfig;
  filters: DataFilter[];
  thumbnail?: string;
  /** Stored separately to avoid huge single records. */
  hasData: boolean;
}

export interface UniversePayload {
  meta: DatasetMeta;
  fields: string[];
  rows: DataRow[];
  columns: ColumnStats[];
  geo?: Dataset['geo'];
  relations?: Dataset['relations'];
}

export interface ParsedFile {
  dataset: Dataset;
  /** Raw bytes kept only to allow "re-parse" without re-selecting. */
  rawText?: string;
}

export interface DemoDatasetInfo {
  id: string;
  name: { zh: string; en: string };
  description: { zh: string; en: string };
  fieldsDoc: Array<{ field: string; type: string; desc: { zh: string; en: string } }>;
  recommended: ViewMode[];
  license: string;
  source: string;
  /** Demo data generator, executed lazily. */
  build: () => { fields: string[]; rows: DataRow[] };
}
