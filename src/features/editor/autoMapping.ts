import type { ColumnStats, Dataset, FieldMapping, ViewMode, VisualConfig } from '@/types';
import { defaultConfig, defaultMapping } from '@/utils/layout';

/**
 * Automatic, rule-based field mapping.
 *
 * This is deliberately *not* presented as AI. It is a deterministic heuristic
 * that picks sensible defaults from the detected column types so a first-time
 * user sees a meaningful visualization immediately.
 */
export function pickFields(columns: ColumnStats[]) {
  const measures = columns.filter((c) => c.type === 'integer' || c.type === 'float');
  const dimensions = columns.filter((c) => c.type === 'category' || c.type === 'string' || c.type === 'boolean');
  const times = columns.filter((c) => c.type === 'date' || c.type === 'datetime');

  // Prefer a categorical field with a readable cardinality for colour.
  const colorCandidate =
    dimensions
      .filter((c) => (c.category?.uniqueCount ?? 0) >= 2 && (c.category?.uniqueCount ?? 0) <= 40)
      .sort((a, b) => (b.category?.uniqueCount ?? 0) - (a.category?.uniqueCount ?? 0))[0] ??
    dimensions.find((c) => (c.category?.uniqueCount ?? 99) <= 12) ??
    dimensions[0] ??
    null;

  // Prefer a string-ish field for labels (names read better than codes).
  const labelCandidate =
    columns
      .filter((c) => c.type === 'string' || c.type === 'category')
      .filter((c) => (c.category?.uniqueCount ?? 0) > 1)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;

  // Size: prefer a wide-range measure (high relative spread reads better).
  const sizeCandidate =
    measures
      .slice()
      .sort((a, b) => {
        const rangeA = a.numeric ? (a.numeric.max - a.numeric.min) / Math.max(1e-9, Math.abs(a.numeric.mean)) : 0;
        const rangeB = b.numeric ? (b.numeric.max - b.numeric.min) / Math.max(1e-9, Math.abs(b.numeric.mean)) : 0;
        return rangeB - rangeA;
      })[0] ?? null;

  const weightCandidate = measures.find((c) => c.field !== sizeCandidate?.field) ?? null;
  const timeCandidate = times[0] ?? null;
  const geoLat = columns.find((c) => c.type === 'latitude') ?? null;
  const geoLon = columns.find((c) => c.type === 'longitude') ?? null;

  return {
    color: colorCandidate?.field ?? null,
    label: labelCandidate?.field ?? null,
    size: sizeCandidate?.field ?? null,
    weight: weightCandidate?.field ?? null,
    time: timeCandidate?.field ?? null,
    value: measures.find((c) => c.field !== timeCandidate?.field)?.field ?? null,
    lat: geoLat?.field ?? null,
    lon: geoLon?.field ?? null,
    measures,
    dimensions,
    times,
  };
}

/** Fill in every mapping slot with the best available default. */
export function autoMapping(dataset: Dataset, mode: ViewMode): FieldMapping {
  const picks = pickFields(dataset.columns);
  const m = defaultMapping();

  m.colorField = picks.color;
  m.labelField = picks.label;
  m.sizeField = picks.size;
  m.weightField = picks.weight;
  m.timeField = picks.time;
  m.valueField = picks.value;

  // Network: prefer a detected relation, else name-like pairs.
  if (dataset.relations && dataset.relations.length > 0) {
    m.edgeFromField = dataset.relations[0]!.from;
    m.edgeToField = dataset.relations[0]!.to;
  } else {
    const dims = picks.dimensions;
    if (dims.length >= 2) {
      m.edgeFromField = dims[0]!.field;
      m.edgeToField = dims[1]!.field;
    }
  }

  // Map: use detected geo columns when present.
  if (dataset.geo) {
    m.latField = dataset.geo.latField;
    m.lonField = dataset.geo.lonField;
  } else {
    m.latField = picks.lat;
    m.lonField = picks.lon;
  }

  // Matrix: two categorical fields with reasonable cardinality + one measure.
  const matrixDims = picks.dimensions
    .filter((c) => {
      const n = c.category?.uniqueCount ?? 0;
      return n >= 2 && n <= 30;
    })
    .slice(0, 2);
  m.matrixRowField = matrixDims[0]?.field ?? picks.color;
  m.matrixColField = matrixDims[1]?.field ?? picks.dimensions[1]?.field ?? null;
  m.matrixValueField = picks.measures[0]?.field ?? null;

  // Distribution: the primary measure (or the colour field for shares).
  m.distributionField = picks.measures[0]?.field ?? picks.color;

  if (mode === 'timeline' && !m.valueField) m.valueField = picks.measures[0]?.field ?? null;

  return m;
}

/** Choose the mode that best fits the dataset when we auto-generate. */
export function autoMode(dataset: Dataset): ViewMode {
  const hasTime = dataset.columns.some((c) => c.type === 'date' || c.type === 'datetime');
  const hasGeo = Boolean(dataset.geo);
  const numericCount = dataset.columns.filter((c) => c.type === 'integer' || c.type === 'float').length;

  if (hasGeo && dataset.rows.length <= 5000) return 'map';
  if (hasTime && numericCount >= 1) return 'timeline';
  if (numericCount >= 2 && dataset.rows.length <= 20000) return 'galaxy';
  if (numericCount >= 1) return 'distribution';
  return 'network';
}

/** Build a full config for a dataset + mode with sensible defaults. */
export function buildConfig(dataset: Dataset, mode: ViewMode, base?: Partial<VisualConfig>): VisualConfig {
  const config = { ...defaultConfig(mode), ...base };
  config.mode = mode;
  config.mapping = { ...autoMapping(dataset, mode), ...(base?.mapping ?? {}) };
  // Give a colour field some visual protection: layouts cluster by category.
  if (mode === 'galaxy' && !base?.layout) {
    config.layout = dataset.rows.length > 4000 ? 'radial' : 'spiral';
  }
  return config;
}

/** Which mapping slots matter for a given mode — used by the settings panel. */
export function mappingSlotsFor(mode: ViewMode): Array<keyof FieldMapping> {
  switch (mode) {
    case 'galaxy':
      return ['colorField', 'sizeField', 'weightField', 'labelField'];
    case 'network':
      return ['edgeFromField', 'edgeToField', 'labelField', 'colorField'];
    case 'timeline':
      return ['timeField', 'valueField', 'colorField', 'labelField'];
    case 'map':
      return ['latField', 'lonField', 'sizeField', 'colorField', 'labelField'];
    case 'matrix':
      return ['matrixRowField', 'matrixColField', 'matrixValueField'];
    case 'distribution':
      return ['distributionField', 'sizeField', 'labelField', 'colorField'];
    default:
      return ['colorField'];
  }
}
