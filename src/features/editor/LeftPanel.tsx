import type { ColumnStats, DataFilter, FieldMapping, ViewMode } from '@/types';
import { useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Check,
  Filter,
  Hash,
  Layers,
  MapPin,
  Network,
  PieChart,
  Plus,
  Sparkles,
  Table2,
  Type as TypeIcon,
  X,
} from 'lucide-react';
import { cn, formatNumber, truncate, uid } from '@/utils/cn';
import { Button, Field, Select, TextInput } from '@/components/ui';
import { useApp } from '@/stores/app';
import { applyFilters } from '@/utils/layout';

const MODE_META: Record<ViewMode, { icon: typeof Sparkles; key: string }> = {
  galaxy: { icon: Sparkles, key: 'mode.galaxy' },
  network: { icon: Network, key: 'mode.network' },
  timeline: { icon: Calendar, key: 'mode.timeline' },
  map: { icon: MapPin, key: 'mode.map' },
  matrix: { icon: Table2, key: 'mode.matrix' },
  distribution: { icon: BarChart3, key: 'mode.distribution' },
};

function typeIcon(type: ColumnStats['type']) {
  if (type === 'integer' || type === 'float') return Hash;
  if (type === 'date' || type === 'datetime') return Calendar;
  if (type === 'category') return PieChart;
  if (type === 'latitude' || type === 'longitude') return MapPin;
  return TypeIcon;
}

/** Left column of the workspace: layers, fields, and filters. */
export function LeftPanel({
  columns,
  rows,
  mapping,
  availableModes,
}: {
  columns: ColumnStats[];
  rows: unknown[];
  mapping: FieldMapping;
  availableModes: ViewMode[];
}) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const config = useApp((s) => s.config);
  const patchConfig = useApp((s) => s.patchConfig);
  const filters = useApp((s) => s.filters);
  const addFilter = useApp((s) => s.addFilter);
  const updateFilter = useApp((s) => s.updateFilter);
  const removeFilter = useApp((s) => s.removeFilter);
  const clearFilters = useApp((s) => s.clearFilters);
  const search = useApp((s) => s.search);
  const setSearch = useApp((s) => s.setSearch);

  const [tab, setTab] = useState<'layers' | 'fields' | 'filters'>('layers');
  const [addingFilter, setAddingFilter] = useState(false);
  const [newField, setNewField] = useState<string>('');

  const filteredCount = useMemo(() => {
    if (filters.length === 0) return rows.length;
    return applyFilters(rows as never[], filters).length;
  }, [rows, filters]);

  const mappingEntries = useMemo(() => {
    const used: Array<[string, string]> = [];
    const push = (label: string, field: string | null) => {
      if (field) used.push([label, field]);
    };
    push(t('editor.colorField'), mapping.colorField);
    push(t('editor.sizeField'), mapping.sizeField);
    push(t('editor.weightField'), mapping.weightField);
    push(t('editor.labelField'), mapping.labelField);
    push(t('editor.timeField'), mapping.timeField);
    push(t('editor.valueField'), mapping.valueField);
    push(t('editor.latField'), mapping.latField);
    push(t('editor.lonField'), mapping.lonField);
    push(t('editor.matrixRow'), mapping.matrixRowField);
    push(t('editor.matrixCol'), mapping.matrixColField);
    return used;
  }, [mapping, t]);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line p-1.5">
        {(
          [
            ['layers', t('editor.data'), Layers],
            ['fields', t('understand.fields'), Table2],
            ['filters', t('editor.filters'), Filter],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
              tab === key ? 'bg-[var(--panel-strong)] text-0' : 'text-2 hover:text-1',
            )}
          >
            <Icon size={12} />
            <span className="truncate">{label}</span>
            {key === 'filters' && filters.length > 0 && (
              <span
                className="rounded-full px-1 text-[9px] font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {filters.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="scroll-area flex-1">
        {/* ---------------- layers ---------------- */}
        {tab === 'layers' && (
          <div className="p-2.5">
            <p className="panel-title mb-2">{t('editor.mode')}</p>
            <div className="grid gap-1">
              {availableModes.map((mode) => {
                const meta = MODE_META[mode];
                const Icon = meta.icon;
                const active = config.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patchConfig({ mode })}
                    className={cn(
                      'flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                      active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--panel)]',
                    )}
                  >
                    <Icon size={14} className={cn('mt-0.5 shrink-0', active ? 'accent-text' : 'text-2')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[12px] font-medium', active ? 'accent-text' : 'text-1')}>
                        {t(meta.key)}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-2">
                        {t(`${meta.key}.desc`)}
                      </span>
                    </span>
                    {active && <Check size={12} className="mt-0.5 shrink-0 accent-text" />}
                  </button>
                );
              })}
            </div>

            <div className="my-3 divider" />

            <p className="panel-title mb-2">{t('editor.mapping')}</p>
            {mappingEntries.length === 0 ? (
              <p className="px-1 text-[11px] text-2">{locale === 'zh' ? '尚未设置字段映射' : 'No fields mapped yet'}</p>
            ) : (
              <div className="space-y-1">
                {mappingEntries.map(([label, field], i) => (
                  <div
                    key={`${label}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                    style={{ background: 'var(--panel)' }}
                  >
                    <span className="shrink-0 text-[10px] text-2">{label}</span>
                    <span className="truncate font-mono text-[10px] text-1">{field}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="my-3 divider" />

            <p className="panel-title mb-2">{t('editor.search')}</p>
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder={locale === 'zh' ? '在数据中搜索…' : 'Search across rows…'}
            />
            <p className="mt-1.5 text-[10px] text-2">
              {locale === 'zh'
                ? `筛选后 ${formatNumber(filteredCount, 0)} / ${formatNumber(rows.length, 0)} 行`
                : `${formatNumber(filteredCount, 0)} / ${formatNumber(rows.length, 0)} rows after filters`}
            </p>

            <div className="my-3 divider" />
          </div>
        )}

        {/* ---------------- fields ---------------- */}
        {tab === 'fields' && (
          <div className="p-1">
            {columns.map((col) => {
              const Icon = typeIcon(col.type);
              return (
                <div key={col.field} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--panel)]">
                  <Icon size={12} className="mt-1 shrink-0 text-2" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-medium text-1">{col.field}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9.5px] text-2">
                      <span>{t(`type.${col.type}`)}</span>
                      <span>{formatNumber(col.valid, 0)} ok</span>
                      {col.missing > 0 && <span className="text-amber-400/75">{formatNumber(col.missing, 0)} null</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---------------- filters ---------------- */}
        {tab === 'filters' && (
          <div className="p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="panel-title">{t('editor.filters')}</p>
              {filters.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[10px] text-2 underline underline-offset-2 hover:text-1"
                >
                  {t('editor.clearFilters')}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {filters.map((f) => {
                const col = columns.find((c) => c.field === f.field);
                return (
                  <div
                    key={f.id}
                    className="rounded-lg p-2"
                    style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-medium text-1">{f.field}</div>
                        <div className="text-[9.5px] text-2">{t(`filter.${f.kind}`)}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateFilter(f.id, { enabled: !f.enabled })}
                          className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                          style={{
                            background: f.enabled ? 'var(--accent-soft)' : 'var(--panel-strong)',
                            color: f.enabled ? 'var(--accent)' : 'var(--text-2)',
                          }}
                        >
                          {f.enabled ? 'ON' : 'OFF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFilter(f.id)}
                          aria-label="remove filter"
                          className="text-2 hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>

                    {f.kind === 'text' && (
                      <TextInput
                        value={f.query ?? ''}
                        onChange={(v) => updateFilter(f.id, { query: v })}
                        placeholder={locale === 'zh' ? '包含文本…' : 'contains…'}
                      />
                    )}

                    {(f.kind === 'numberRange' || f.kind === 'dateRange') && (
                      <div className="flex items-center gap-1.5">
                        <TextInput
                          value={f.min !== undefined ? String(f.min) : ''}
                          onChange={(v) => updateFilter(f.id, { min: v === '' ? undefined : Number(v) || 0 })}
                          placeholder={f.kind === 'dateRange' ? 'YYYY-MM-DD' : 'min'}
                          type={f.kind === 'numberRange' ? 'number' : 'text'}
                        />
                        <span className="text-[10px] text-2">—</span>
                        <TextInput
                          value={f.max !== undefined ? String(f.max) : ''}
                          onChange={(v) => updateFilter(f.id, { max: v === '' ? undefined : Number(v) || 0 })}
                          placeholder={f.kind === 'dateRange' ? 'YYYY-MM-DD' : 'max'}
                          type={f.kind === 'numberRange' ? 'number' : 'text'}
                        />
                      </div>
                    )}

                    {f.kind === 'category' && col?.category && (
                      <div className="max-h-36 space-y-0.5 overflow-y-auto pr-1">
                        {col.category.distribution.slice(0, 24).map((item) => {
                          const checked = (f.values ?? []).includes(item.value);
                          return (
                            <label
                              key={item.value}
                              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--panel-strong)]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const cur = f.values ?? [];
                                  updateFilter(f.id, {
                                    values: checked ? cur.filter((v) => v !== item.value) : [...cur, item.value],
                                  });
                                }}
                                className="h-3 w-3 accent-[var(--accent)]"
                              />
                              <span className="min-w-0 flex-1 truncate text-[10.5px] text-1">
                                {truncate(item.value, 22)}
                              </span>
                              <span className="font-mono text-[9px] text-2">{item.count}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {f.kind === 'nullCheck' && (
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={f.onlyMissing ?? false}
                          onChange={(e) => updateFilter(f.id, { onlyMissing: e.target.checked })}
                          className="h-3 w-3 accent-[var(--accent)]"
                        />
                        <span className="text-[10.5px] text-1">{t('filter.onlyMissing')}</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {addingFilter ? (
              <div className="mt-2.5 rounded-lg p-2" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                <Field label={t('understand.field')}>
                  <Select
                    value={newField || null}
                    onChange={setNewField}
                    placeholder={t('common.select')}
                    options={columns.map((c) => ({ value: c.field, label: `${c.field} · ${t(`type.${c.type}`)}` }))}
                  />
                </Field>
                <div className="mt-2">
                  <AddFilterKind
                    column={columns.find((c) => c.field === newField)}
                    onAdd={(f) => {
                      addFilter(f);
                      setAddingFilter(false);
                      setNewField('');
                    }}
                    onCancel={() => {
                      setAddingFilter(false);
                      setNewField('');
                    }}
                  />
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                full
                className="mt-2.5"
                onClick={() => setAddingFilter(true)}
              >
                <Plus size={12} />
                {t('editor.addFilter')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddFilterKind({
  column,
  onAdd,
  onCancel,
}: {
  column?: ColumnStats;
  onAdd: (f: DataFilter) => void;
  onCancel: () => void;
}) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [kind, setKind] = useState<DataFilter['kind'] | null>(null);

  if (!column) {
    return <p className="text-[10.5px] text-2">{locale === 'zh' ? '先选择一个字段' : 'Choose a field first'}</p>;
  }

  const numericKinds: Array<{ value: DataFilter['kind']; label: string }> = [
    { value: 'text', label: t('filter.text') },
    { value: 'numberRange', label: t('filter.numberRange') },
    { value: 'dateRange', label: t('filter.dateRange') },
    { value: 'category', label: t('filter.category') },
    { value: 'nullCheck', label: t('filter.nullCheck') },
  ];

  const suggested =
    column.type === 'integer' || column.type === 'float'
      ? ['numberRange', 'nullCheck', 'text']
      : column.type === 'date' || column.type === 'datetime'
        ? ['dateRange', 'nullCheck', 'text']
        : ['category', 'text', 'nullCheck'];

  const options = numericKinds.filter((k) => suggested.includes(k.value));

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {options.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className="rounded px-2 py-1 text-[10px] font-medium transition-colors"
            style={{
              background: kind === k.value ? 'var(--accent-soft)' : 'var(--panel-strong)',
              color: kind === k.value ? 'var(--accent)' : 'var(--text-2)',
              border: `1px solid ${kind === k.value ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" full onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          full
          disabled={!kind}
          onClick={() => {
            if (!kind) return;
            const base: DataFilter = { id: uid('f'), field: column.field, kind, enabled: true };
            if (kind === 'numberRange' && column.numeric) {
              base.min = column.numeric.min;
              base.max = column.numeric.max;
            }
            if (kind === 'dateRange' && column.date) {
              base.min = column.date.minTime;
              base.max = column.date.maxTime;
            }
            if (kind === 'category') base.values = [];
            if (kind === 'nullCheck') base.onlyMissing = true;
            onAdd(base);
          }}
        >
          <Check size={11} />
          {t('common.confirm')}
        </Button>
      </div>
    </div>
  );
}

