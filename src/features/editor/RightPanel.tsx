import { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Info,
  Palette as PaletteIcon,
  Sliders,
  Type as TypeIcon,
} from 'lucide-react';
import type { ColumnStats, LayoutKind, PaletteId, VisualConfig } from '@/types';
import { PALETTE_LIST, PALETTES } from '@/utils/palettes';
import { cn } from '@/utils/cn';
import { Field, Select, Slider, TextInput, Toggle } from '@/components/ui';
import { useApp } from '@/stores/app';
import { mappingSlotsFor } from './autoMapping';

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--panel)]"
        aria-expanded={open}
      >
        <span className="text-2">{icon}</span>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-2">{title}</span>
        <ChevronDown size={13} className={cn('text-2 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/** Right column: all visual parameters, grouped and collapsible. */
export function RightPanel({ columns }: { columns: ColumnStats[] }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const config = useApp((s) => s.config);
  const patchConfig = useApp((s) => s.patchConfig);
  const patchMapping = useApp((s) => s.patchMapping);
  const resetConfig = useApp((s) => s.resetConfig);

  const slots = useMemo(() => mappingSlotsFor(config.mode), [config.mode]);

  const optionsFor = (fieldKey: keyof VisualConfig['mapping']) => {
    const numeric = columns.filter((c) => c.type === 'integer' || c.type === 'float');
    const cats = columns.filter((c) => c.type === 'category' || c.type === 'string' || c.type === 'boolean');
    const times = columns.filter((c) => c.type === 'date' || c.type === 'datetime');
    const geoLat = columns.filter((c) => c.type === 'latitude' || c.type === 'integer' || c.type === 'float');
    const geoLon = columns.filter((c) => c.type === 'longitude' || c.type === 'integer' || c.type === 'float');

    switch (fieldKey) {
      case 'sizeField':
      case 'weightField':
      case 'valueField':
      case 'matrixValueField':
        return numeric;
      case 'timeField':
        return times;
      case 'latField':
        return geoLat;
      case 'lonField':
        return geoLon;
      case 'distributionField':
        return columns.filter((c) => c.type === 'integer' || c.type === 'float' || c.type === 'category');
      default:
        return cats.length > 0 ? cats : columns;
    }
  };

  const slotLabel: Record<string, string> = {
    colorField: t('editor.colorField'),
    sizeField: t('editor.sizeField'),
    weightField: t('editor.weightField'),
    labelField: t('editor.labelField'),
    timeField: t('editor.timeField'),
    valueField: t('editor.valueField'),
    edgeFromField: t('editor.edgeFrom'),
    edgeToField: t('editor.edgeTo'),
    latField: t('editor.latField'),
    lonField: t('editor.lonField'),
    matrixRowField: t('editor.matrixRow'),
    matrixColField: t('editor.matrixCol'),
    matrixValueField: t('editor.matrixValue'),
    distributionField: t('editor.distKind'),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="scroll-area flex-1">
        {/* ---------- title ---------- */}
        <Section title={locale === 'zh' ? '标题' : 'Title'} icon={<TypeIcon size={12} />}>
          <div className="space-y-2">
            <Field label={t('editor.title')}>
              <TextInput
                value={config.title}
                onChange={(v) => patchConfig({ title: v })}
                placeholder={locale === 'zh' ? '为你的数据宇宙取个名字' : 'Name your universe'}
              />
            </Field>
            <Field label={t('editor.subtitle')}>
              <TextInput
                value={config.subtitle}
                onChange={(v) => patchConfig({ subtitle: v })}
                placeholder={locale === 'zh' ? '一句说明（可选）' : 'A short caption (optional)'}
              />
            </Field>
          </div>
        </Section>

        {/* ---------- mapping ---------- */}
        <Section title={t('editor.mapping')} icon={<BarChart3 size={12} />}>
          <div className="space-y-2">
            {slots.map((key) => {
              const opts = optionsFor(key);
              if (opts.length === 0) return null;
              return (
                <Field key={key} label={slotLabel[key] ?? String(key)}>
                  <Select
                    value={config.mapping[key] ?? null}
                    onChange={(v) => patchMapping({ [key]: v || null })}
                    placeholder={t('editor.none')}
                    options={opts.map((c) => ({ value: c.field, label: `${c.field}` }))}
                  />
                </Field>
              );
            })}

            {config.mode === 'matrix' && (
              <Field label={t('editor.matrixKind')}>
                <Select
                  value={config.matrixKind}
                  onChange={(v) => patchConfig({ matrixKind: v as VisualConfig['matrixKind'] })}
                  options={[
                    { value: 'heatmap', label: t('matrix.heatmap') },
                    { value: 'correlation', label: t('matrix.correlation') },
                  ]}
                />
              </Field>
            )}

            {config.mode === 'matrix' && config.matrixKind === 'correlation' && (
              <Field label={t('editor.correlation')}>
                <Select
                  value={config.correlationMethod}
                  onChange={(v) => patchConfig({ correlationMethod: v as 'pearson' | 'spearman' })}
                  options={[
                    { value: 'pearson', label: 'Pearson' },
                    { value: 'spearman', label: 'Spearman' },
                  ]}
                />
              </Field>
            )}

            {config.mode === 'distribution' && (
              <Field label={t('editor.distKind')}>
                <Select
                  value={config.distributionKind}
                  onChange={(v) => patchConfig({ distributionKind: v as VisualConfig['distributionKind'] })}
                  options={[
                    { value: 'histogram', label: t('dist.histogram') },
                    { value: 'box', label: t('dist.box') },
                    { value: 'scatter', label: t('dist.scatter') },
                    { value: 'density', label: t('dist.density') },
                    { value: 'share', label: t('dist.share') },
                  ]}
                />
              </Field>
            )}

            {config.mode === 'distribution' && config.distributionKind === 'scatter' && (
              <Field label={t('editor.matrixValue')}>
                <Select
                  value={config.mapping.sizeField}
                  onChange={(v) => patchMapping({ sizeField: v || null })}
                  placeholder={t('editor.none')}
                  options={columns
                    .filter((c) => c.type === 'integer' || c.type === 'float')
                    .map((c) => ({ value: c.field, label: c.field }))}
                />
              </Field>
            )}
          </div>
        </Section>

        {/* ---------- palette ---------- */}
        <Section title={t('editor.palette')} icon={<PaletteIcon size={12} />}>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE_LIST.map((p: (typeof PALETTE_LIST)[number]) => (
              <button
                key={p.id}
                type="button"
                onClick={() => patchConfig({ palette: p.id as PaletteId })}
                className={cn(
                  'group relative overflow-hidden rounded-lg p-1.5 text-left transition-all',
                  config.palette === p.id ? 'ring-1 ring-[var(--accent)]' : 'hover:ring-1 hover:ring-[var(--border-strong)]',
                )}
                style={{ background: 'var(--panel)' }}
                aria-pressed={config.palette === p.id}
              >
                <div className="flex gap-0.5 overflow-hidden rounded">
                  {p.colors.slice(0, 6).map((c, i) => (
                    <span key={i} className="h-4 flex-1" style={{ background: c }} />
                  ))}
                </div>
                <span className="mt-1 block truncate text-[10px] text-1">{p.name[locale]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-2">
            <Info size={10} className="mt-0.5 shrink-0" />
            {locale === 'zh'
              ? `当前主色 ${PALETTES[config.palette]?.accent ?? '#8b6cff'}`
              : `Accent ${PALETTES[config.palette]?.accent ?? '#8b6cff'}`}
          </p>
        </Section>

        {/* ---------- layout & style ---------- */}
        <Section title={t('editor.style')} icon={<Sliders size={12} />}>
          <div className="space-y-3">
            {(config.mode === 'galaxy' || config.mode === 'network') && config.mode === 'galaxy' && (
              <Field label={t('editor.layout')}>
                <Select
                  value={config.layout}
                  onChange={(v) => patchConfig({ layout: v as LayoutKind })}
                  options={[
                    { value: 'spiral', label: t('layout.spiral') },
                    { value: 'radial', label: t('layout.radial') },
                    { value: 'cluster', label: t('layout.cluster') },
                    { value: 'grid', label: t('layout.grid') },
                    { value: 'force', label: t('layout.force') },
                  ]}
                />
              </Field>
            )}

            <Slider
              label={t('editor.opacity')}
              value={config.opacity}
              min={0.2}
              max={1}
              step={0.05}
              onChange={(v) => patchConfig({ opacity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            <Slider
              label={t('editor.size')}
              value={config.sizeScale}
              min={0.4}
              max={3}
              step={0.1}
              onChange={(v) => patchConfig({ sizeScale: v })}
              format={(v) => `${v.toFixed(1)}×`}
            />

            {(config.mode === 'galaxy') && (
              <Slider
                label={t('editor.starfield')}
                value={config.starfield}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => patchConfig({ starfield: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            )}

            <div className="space-y-1 pt-1">
              <Toggle checked={config.showLabels} onChange={(v) => patchConfig({ showLabels: v })} label={t('editor.labels')} />
              {(config.mode === 'galaxy') && (
                <Toggle checked={config.showLinks} onChange={(v) => patchConfig({ showLinks: v })} label={t('editor.links')} />
              )}
              <Toggle checked={config.animate} onChange={(v) => patchConfig({ animate: v })} label={t('editor.animate')} />
            </div>
          </div>
        </Section>

        {/* ---------- reset ---------- */}
        <div className="p-3">
          <button
            type="button"
            onClick={resetConfig}
            className="w-full rounded-lg px-2 py-2 text-[11px] font-medium text-2 transition-colors hover:bg-[var(--panel)] hover:text-1"
          >
            {t('editor.reset')}
          </button>
        </div>
      </div>
    </div>
  );
}
