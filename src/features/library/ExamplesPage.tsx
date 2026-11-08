import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Database, Download, Layers, Sparkles } from 'lucide-react';
import type { DataRow, Dataset, DemoDatasetInfo } from '@/types';
import { analyzeDataset } from '@/features/data-engine/analyze';
import { DEMO_DATASETS } from '@/features/import/demos';
import { formatNumber, truncate } from '@/utils/cn';
import { Button } from '@/components/ui';
import { useApp } from '@/stores/app';

/** Demo data lab: inspect fields and preview before generating a universe. */
export function ExamplesPage({ onDemo }: { onDemo: (id: string) => void }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [selected, setSelected] = useState<DemoDatasetInfo>(DEMO_DATASETS[0]!);
  const [preview, setPreview] = useState<{ dataset: Dataset; rows: DataRow[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const build = useCallback((info: DemoDatasetInfo) => {
    setLoading(true);
    // Defer so the loading state paints before the synchronous generator runs.
    window.setTimeout(() => {
      const { fields, rows } = info.build();
      const dataset = analyzeDataset(
        {
          fileName: `${info.id}.csv`,
          fileSize: rows.length * 120,
          fileType: 'CSV',
          rows: rows.length,
          columns: fields.length,
          emptyRows: 0,
          duplicateRows: 0,
          parsedAt: Date.now(),
          parser: 'demo',
          warnings: [`这是演示数据集（Demo Dataset），不是实时数据。${info.license}`],
        },
        fields,
        rows,
      );
      setPreview({ dataset, rows: rows.slice(0, 8) });
      setLoading(false);
    }, 20);
  }, []);

  useEffect(() => {
    build(selected);
  }, [selected, build]);

  const previewFields = useMemo(() => preview?.dataset.fields.slice(0, 7) ?? [], [preview]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-3 pt-4 sm:px-5 sm:pt-6 lg:px-8">
      <div className="mb-4">
        <h1 className="font-display text-xl font-semibold tracking-tight text-0 sm:text-2xl">{t('examples.title')}</h1>
        <p className="mt-1 text-[11px] text-2 sm:text-xs">{t('examples.subtitle')}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        {/* dataset list */}
        <div className="space-y-1.5">
          {DEMO_DATASETS.map((d) => {
            const active = d.id === selected.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d)}
                className="w-full rounded-xl px-3 py-2.5 text-left transition-all"
                style={{
                  background: active ? 'var(--accent-soft)' : 'var(--panel)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Database size={13} className={active ? 'accent-text' : 'text-2'} />
                  <span className={`text-[12.5px] font-medium ${active ? 'accent-text' : 'text-1'}`}>{d.name[locale]}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-2">{d.description[locale]}</p>
              </button>
            );
          })}
        </div>

        {/* detail */}
        <div className="rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-3.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-0">{selected.name[locale]}</h2>
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                  style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}
                >
                  {t('examples.demo')}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-1">{selected.description[locale]}</p>
              <p className="mt-1.5 text-[10px] text-2">
                {selected.license} · {selected.source}
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => onDemo(selected.id)} className="shrink-0">
              <Sparkles size={12} />
              {t('examples.use')}
              <ArrowRight size={11} />
            </Button>
          </div>

          {/* field docs */}
          <div className="border-b border-line p-3.5">
            <p className="panel-title mb-2">{t('examples.fields')}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {selected.fieldsDoc.map((f) => (
                <div key={f.field} className="flex items-baseline gap-2 rounded-lg px-2 py-1" style={{ background: 'var(--panel-strong)' }}>
                  <code className="shrink-0 font-mono text-[10.5px] text-1">{f.field}</code>
                  <span className="shrink-0 rounded px-1 text-[9px]" style={{ background: 'var(--border)', color: 'var(--text-2)' }}>
                    {f.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-2">{f.desc[locale]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* preview */}
          <div className="p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="panel-title">{t('examples.preview')}</p>
              {preview && (
                <span className="text-[10px] text-2">
                  {formatNumber(preview.dataset.meta.rows, 0)} {t('common.rows')} · {preview.dataset.meta.columns}{' '}
                  {t('import.columns')}
                </span>
              )}
            </div>

            {loading || !preview ? (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-6 rounded" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-[10.5px]">
                  <thead>
                    <tr style={{ background: 'var(--panel-strong)' }}>
                      {previewFields.map((f) => (
                        <th key={f} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-2">
                          {f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-t border-line">
                        {previewFields.map((f) => (
                          <td key={f} className="max-w-[190px] truncate px-2 py-1.5 font-mono text-1">
                            {row[f] === null ? <span className="italic text-2">null</span> : truncate(String(row[f]), 24)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-2">{t('examples.recommend')}:</span>
              {selected.recommended.map((m) => (
                <span key={m} className="rounded px-1.5 py-0.5 text-[9.5px]" style={{ background: 'var(--panel-strong)', color: 'var(--text-1)' }}>
                  <Layers size={8} className="mr-1 inline" />
                  {t(`mode.${m}`)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-2">
        <Download size={10} />
        {locale === 'zh'
          ? '示例数据由程序以固定随机种子生成，结构贴近真实场景，数值不代表任何真实实体。'
          : 'Demo datasets are generated with fixed seeds. Structure mirrors real scenarios; values describe no real entity.'}
      </p>

      <div className="h-10" />
    </div>
  );
}
