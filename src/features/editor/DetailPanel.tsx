import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { DataRow, Dataset } from '@/types';
import { cn, formatNumber } from '@/utils/cn';
import { Button, IconButton } from '@/components/ui';
import { useApp } from '@/stores/app';

/**
 * Record detail drawer. Shows the raw record exactly as parsed (no
 * interpretation) plus the values of related rows when a relation exists.
 */
export function DetailPanel({
  dataset,
  rowIndex,
  onClose,
  onSelect,
}: {
  dataset: Dataset;
  rowIndex: number;
  onClose: () => void;
  onSelect?: (row: number) => void;
}) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const config = useApp((s) => s.config);
  const [copied, setCopied] = useState(false);

  const row: DataRow | undefined = dataset.rows[rowIndex];

  const related = useMemo(() => {
    if (!dataset.relations || dataset.relations.length === 0 || !row) return [];
    const rel = dataset.relations[0]!;
    const key = row[rel.from];
    if (key === null || key === undefined) return [];
    const out: Array<{ index: number; row: DataRow; field: string }> = [];
    for (let i = 0; i < dataset.rows.length && out.length < 6; i++) {
      if (i === rowIndex) continue;
      const other = dataset.rows[i]!;
      if (String(other[rel.to]) === String(key) || String(other[rel.from]) === String(key)) {
        out.push({ index: i, row: other, field: rel.from });
      }
    }
    return out;
  }, [dataset, row, rowIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!row) return null;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const highlighted = new Set(
    [
      config.mapping.colorField,
      config.mapping.sizeField,
      config.mapping.weightField,
      config.mapping.labelField,
      config.mapping.timeField,
      config.mapping.valueField,
      config.mapping.latField,
      config.mapping.lonField,
    ].filter(Boolean) as string[],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="panel-title">{t('detail.title')}</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-0">
            {config.mapping.labelField
              ? String(row[config.mapping.labelField] ?? `#${rowIndex + 1}`)
              : `#${rowIndex + 1}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={copied ? t('detail.copied') : t('detail.copy')} onClick={copyJson} active={copied}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconButton>
          <IconButton label={t('detail.close')} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <div className="scroll-area flex-1 px-4 py-3">
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-2">
          {t('detail.fields')} · {dataset.fields.length}
        </p>
        <div className="space-y-1">
          {dataset.fields.map((field) => {
            const col = dataset.columns.find((c) => c.field === field);
            const value = row[field];
            const isNull = value === null || value === undefined || value === '';
            return (
              <div
                key={field}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-lg px-2.5 py-1.5',
                  highlighted.has(field) && 'ring-1 ring-inset',
                )}
                style={{
                  background: highlighted.has(field) ? 'var(--accent-soft)' : 'var(--panel)',
                  ...(highlighted.has(field) ? { ['--tw-ring-color' as string]: 'var(--accent)' } : {}),
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] text-2">{field}</div>
                  {col && <div className="text-[9px] text-2 opacity-70">{t(`type.${col.type}`)}</div>}
                </div>
                <div
                  className={cn(
                    'max-w-[62%] break-words text-right font-mono text-[11.5px]',
                    isNull ? 'text-2 italic' : 'text-0',
                  )}
                >
                  {isNull ? t('common.missing') : String(value)}
                </div>
              </div>
            );
          })}
        </div>

        {related.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-[10px] uppercase tracking-[0.14em] text-2">
              {t('detail.related')} · {related.length}
            </p>
            <div className="space-y-1">
              {related.map((r) => (
                <button
                  key={r.index}
                  type="button"
                  onClick={() => onSelect?.(r.index)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--panel-strong)]"
                  style={{ background: 'var(--panel)' }}
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-1">
                    {config.mapping.labelField ? String(r.row[config.mapping.labelField] ?? `#${r.index + 1}`) : `#${r.index + 1}`}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-2">
                    {String(r.row[r.field] ?? '')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 rounded-lg px-2.5 py-2" style={{ background: 'var(--panel)' }}>
          <div className="flex items-center justify-between text-[10px] text-2">
            <span>{locale === 'zh' ? '数据行号' : 'Row index'}</span>
            <span className="font-mono text-1">
              {rowIndex + 1} / {formatNumber(dataset.rows.length, 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line px-4 py-2.5 safe-bottom">
        <Button variant="ghost" size="sm" full onClick={onClose}>
          {t('detail.close')}
        </Button>
      </div>
    </div>
  );
}
