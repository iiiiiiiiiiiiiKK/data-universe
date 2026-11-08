import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronDown,
  Hash,
  MapPin,
  Network,
  PieChart,
  Sparkles,
  Table2,
  Type,
  CheckCircle2,
} from 'lucide-react';
import type { ColumnStats, Dataset, FieldType, ViewMode } from '@/types';
import { formatBytes, formatNumber, formatPercent, truncate } from '@/utils/cn';
import { Button, EmptyState, Segmented, StatPill } from '@/components/ui';
import { useApp } from '@/stores/app';
import { recommendModes } from '@/features/data-engine/parse';

const TYPE_ICON: Record<FieldType, typeof Type> = {
  string: Type,
  integer: Hash,
  float: Hash,
  date: Calendar,
  datetime: Calendar,
  boolean: CheckCircle2,
  category: PieChart,
  latitude: MapPin,
  longitude: MapPin,
  unknown: AlertTriangle,
};

const MODE_ICON: Record<string, typeof Sparkles> = {
  galaxy: Sparkles,
  network: Network,
  timeline: Calendar,
  map: MapPin,
  matrix: Table2,
  distribution: BarChart3,
};

function typeColor(type: FieldType): string {
  switch (type) {
    case 'integer':
    case 'float':
      return '#6ce6c4';
    case 'date':
    case 'datetime':
      return '#38bdf8';
    case 'category':
      return '#c084fc';
    case 'boolean':
      return '#facc15';
    case 'latitude':
    case 'longitude':
      return '#fb923c';
    default:
      return '#8d99b8';
  }
}

/** Tiny inline sparkline for numeric columns. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ColumnRow({ col, rows }: { col: ColumnStats; rows: Dataset['rows'] }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[col.type] ?? Type;
  const color = typeColor(col.type);

  const sparkValues = useMemo(() => {
    if (!col.numeric) return [];
    const field = col.field;
    const out: number[] = [];
    const stride = Math.max(1, Math.floor(rows.length / 40));
    for (let i = 0; i < rows.length; i += stride) {
      const v = rows[i]![field];
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  }, [col, rows]);

  const missingPct = col.missing / Math.max(1, col.total);

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--panel)] sm:px-4"
        aria-expanded={open}
      >
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{ background: `${color}1f`, color }}
        >
          <Icon size={13} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-0">{col.field}</span>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
              style={{ background: `${color}1a`, color }}
            >
              {t(`type.${col.type}`)}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-2">
            <span>
              {t('understand.valid')} {formatNumber(col.valid, 0)}
            </span>
            {col.missing > 0 && <span className="text-amber-400/80">{t('understand.missing')} {formatNumber(col.missing, 0)}</span>}
            <span>{t('understand.distinct')} {formatNumber(col.distinct, 0)}</span>
            {col.numeric && <span>{t('understand.outliers')} {col.numeric.outlierCount}</span>}
          </span>
        </span>

        <span className="hidden w-24 shrink-0 text-right sm:block" style={{ color }}>
          {col.numeric ? <Sparkline values={sparkValues} /> : null}
        </span>

        <ChevronDown
          size={14}
          className="shrink-0 text-2 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div className="animate-fade-up px-3 pb-3.5 sm:px-4">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <StatPill label={t('understand.valid')} value={formatNumber(col.valid, 0)} />
            <StatPill label={t('understand.missing')} value={`${formatNumber(col.missing, 0)} (${formatPercent(missingPct)})`} />
            <StatPill label={t('understand.distinct')} value={formatNumber(col.distinct, 0)} />
            <StatPill label={t('understand.confidence')} value={formatPercent(col.confidence, 0)} accent />
          </div>

          {col.numeric && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
              <StatPill label="min" value={formatNumber(col.numeric.min)} />
              <StatPill label="max" value={formatNumber(col.numeric.max)} />
              <StatPill label="mean" value={formatNumber(col.numeric.mean)} />
              <StatPill label="median" value={formatNumber(col.numeric.median)} />
              <StatPill label="sum" value={formatNumber(col.numeric.sum)} />
              <StatPill label="std dev" value={formatNumber(col.numeric.stdDev)} />
            </div>
          )}

          {col.date && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <StatPill label={locale === 'zh' ? '最早' : 'Earliest'} value={col.date.minLabel} />
              <StatPill label={locale === 'zh' ? '最晚' : 'Latest'} value={col.date.maxLabel} />
              <StatPill
                label={locale === 'zh' ? '跨度' : 'Span'}
                value={`${Math.round(col.date.span / 86400000)} ${locale === 'zh' ? '天' : 'days'}`}
              />
            </div>
          )}

          {col.category && col.category.top.length > 0 && !col.numeric && (
            <div className="mt-2.5">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-2">
                {locale === 'zh' ? '高频取值' : 'Top values'}
              </div>
              <div className="space-y-1">
                {col.category.top.slice(0, 5).map((item) => {
                  const pct = item.count / Math.max(1, col.valid);
                  return (
                    <div key={item.value} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-[11px] text-1">{truncate(item.value, 20)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.max(2, pct * 100)}%`, background: color }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-2">{formatPercent(pct, 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {col.samples.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-2">{t('understand.samples')}</span>
              {col.samples.map((s, i) => (
                <code
                  key={i}
                  className="max-w-[190px] truncate rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ background: 'var(--panel)', color: 'var(--text-1)' }}
                >
                  {String(s)}
                </code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UnderstandPanel({ dataset, onGenerate }: { dataset: Dataset; onGenerate: (mode: ViewMode) => void }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [filter, setFilter] = useState<'all' | 'measure' | 'dimension' | 'time' | 'geo'>('all');

  const recommended = useMemo(() => recommendModes(dataset) as ViewMode[], [dataset]);

  const filtered = useMemo(() => {
    if (filter === 'all') return dataset.columns;
    return dataset.columns.filter((c) => c.role === filter);
  }, [dataset.columns, filter]);

  const totalMissing = dataset.columns.reduce((a, c) => a + c.missing, 0);
  const totalCells = dataset.meta.rows * Math.max(1, dataset.meta.columns);
  const outlierTotal = dataset.columns.reduce((a, c) => a + (c.numeric?.outlierCount ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-3 pt-4 sm:px-5 sm:pt-6 lg:px-8">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
            {t('understand.title')}
          </p>
          <h1 className="mt-1 truncate font-display text-xl font-semibold tracking-tight text-0 sm:text-2xl">
            {dataset.meta.fileName}
          </h1>
          <p className="mt-1 text-[11px] text-2 sm:text-xs">
            {formatBytes(dataset.meta.fileSize)} · {formatNumber(dataset.meta.rows, 0)} {t('import.rows')} ·{' '}
            {dataset.meta.columns} {t('import.columns')} · {dataset.meta.fileType}
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => onGenerate(recommended[0] ?? 'galaxy')} className="shrink-0">
          <Sparkles size={15} />
          {locale === 'zh' ? '生成我的数据宇宙' : 'Generate my universe'}
          <ArrowRight size={14} />
        </Button>
      </div>

      {/* Overview stats */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatPill label={locale === 'zh' ? '行数' : 'Rows'} value={formatNumber(dataset.meta.rows, 0)} accent />
        <StatPill label={locale === 'zh' ? '字段' : 'Fields'} value={String(dataset.meta.columns)} />
        <StatPill
          label={locale === 'zh' ? '缺失单元格' : 'Missing cells'}
          value={`${formatNumber(totalMissing, 0)} (${formatPercent(totalMissing / Math.max(1, totalCells), 1)})`}
        />
        <StatPill label={locale === 'zh' ? '重复行' : 'Duplicate rows'} value={formatNumber(dataset.meta.duplicateRows, 0)} />
        <StatPill label={locale === 'zh' ? '离群值' : 'Outliers'} value={formatNumber(outlierTotal, 0)} />
        <StatPill
          label={locale === 'zh' ? '地理字段' : 'Geo fields'}
          value={dataset.geo ? `${dataset.geo.latField}/${dataset.geo.lonField}` : '—'}
        />
      </div>

      {/* Recommended modes */}
      <div className="mb-4">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold text-0">{t('understand.recommend')}</h2>
          <span className="text-[10px] text-2">
            {locale === 'zh' ? '基于规则推荐，非 AI 生成' : 'Rule-based, not AI-generated'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {recommended.map((mode, i) => {
            const Icon = MODE_ICON[mode] ?? Sparkles;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onGenerate(mode)}
                className="group flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all hover:-translate-y-0.5"
                style={{
                  background: i === 0 ? 'var(--accent-soft)' : 'var(--panel)',
                  border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <Icon size={14} style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-2)' }} />
                <span className="text-[12px] font-medium" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-1)' }}>
                  {t(`mode.${mode}`)}
                </span>
                {i === 0 && (
                  <span className="rounded px-1 py-0.5 text-[9px] uppercase" style={{ background: 'var(--accent)', color: '#fff' }}>
                    {locale === 'zh' ? '推荐' : 'Best'}
                  </span>
                )}
                <ArrowRight size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Warnings */}
      {dataset.meta.warnings.length > 0 && (
        <div
          className="mb-4 rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.24)' }}
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-[12px] font-medium text-amber-300">
              {locale === 'zh' ? '数据质量提示' : 'Data quality notes'}
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-4">
            {dataset.meta.warnings.slice(0, 8).map((w, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-amber-200/75">
                · {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fields */}
      <div className="overflow-hidden rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <h2 className="mr-auto text-[13px] font-semibold text-0">{t('understand.fields')}</h2>
          <Segmented
            value={filter}
            onChange={setFilter}
            size="sm"
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'measure', label: t('role.measure') },
              { value: 'dimension', label: t('role.dimension') },
              { value: 'time', label: t('role.time') },
              { value: 'geo', label: t('role.geo') },
            ]}
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState title={locale === 'zh' ? '这个分类下没有字段' : 'No fields in this category'} />
        ) : (
          <div>
            {filtered.map((col) => (
              <ColumnRow key={col.field} col={col} rows={dataset.rows} />
            ))}
          </div>
        )}
      </div>

      <div className="h-12" />
    </div>
  );
}
