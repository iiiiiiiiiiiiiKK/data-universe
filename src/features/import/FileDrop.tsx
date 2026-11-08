import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, FileText, Loader2, Upload, X } from 'lucide-react';
import type { Dataset } from '@/types';
import {
  DEFAULT_MAX_FILE_BYTES,
  ParseError,
  parseFile,
} from '@/features/data-engine/parse';
import { formatBytes, formatNumber } from '@/utils/cn';
import { Button, Progress } from '@/components/ui';
import { useApp } from '@/stores/app';

const ACCEPT = '.csv,.tsv,.json,.xlsx,.xls,.xlsm';

interface Props {
  /** Called with the analysed dataset once parsing succeeds. */
  onLoaded: (dataset: Dataset, rawText: string | null) => void;
  compact?: boolean;
}

export function FileDrop({ onLoaded, compact }: Props) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const pushToast = useApp((s) => s.pushToast);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      setBusy(true);
      setProgress(0.08);

      // Fake-but-honest progress: real work is one async parse, so we advance in
      // coarse steps and finish at 100% only when parsing actually completes.
      const timer = window.setInterval(() => setProgress((p) => Math.min(0.85, p + 0.09)), 180);

      try {
        const result = await parseFile(file, DEFAULT_MAX_FILE_BYTES);
        window.clearInterval(timer);
        setProgress(1);
        if (result.dataset.rows.length === 0) {
          throw new ParseError(
            locale === 'zh' ? '文件里没有可用的数据行。' : 'The file contains no usable data rows.',
          );
        }
        pushToast(
          locale === 'zh'
            ? `已解析 ${formatNumber(result.dataset.rows.length, 0)} 行 · ${result.dataset.fields.length} 个字段`
            : `Parsed ${formatNumber(result.dataset.rows.length, 0)} rows · ${result.dataset.fields.length} fields`,
          'success',
        );
        onLoaded(result.dataset, result.rawText ?? null);
      } catch (e) {
        window.clearInterval(timer);
        setProgress(0);
        const pe = e as ParseError;
        setError({
          message: pe.message || (locale === 'zh' ? '解析失败' : 'Parse failed'),
          hint: pe.hint,
        });
      } finally {
        setBusy(false);
      }
    },
    [locale, onLoaded, pushToast],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const isCompact = compact ?? false;

  return (
    <div className={isCompact ? '' : 'w-full'}>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('import.drop')}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`group relative overflow-hidden rounded-2xl text-center transition-all ${
          isCompact ? 'px-4 py-6' : 'px-6 py-10 sm:px-10 sm:py-14'
        } ${busy ? 'cursor-progress' : 'cursor-pointer'}`}
        style={{
          background: dragging ? 'var(--accent-soft)' : 'var(--panel)',
          border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-xl transition-transform group-hover:-translate-y-0.5 sm:h-14 sm:w-14"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            {busy ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
          </div>

          <div>
            <p className="text-sm font-medium text-0 sm:text-[15px]">
              {busy ? t('import.parsing') : t('import.drop')}
            </p>
            <p className="mt-1 text-[11px] text-2 sm:text-xs">
              {t('import.supportedTypes')} · {t('hero.sizeLimit', { size: formatBytes(DEFAULT_MAX_FILE_BYTES) })}
            </p>
          </div>

          {!busy && (
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              {t('import.choose')}
            </Button>
          )}

          {fileName && (
            <div className="flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] text-2" style={{ background: 'var(--panel-strong)' }}>
              {fileName.endsWith('.json') ? <FileText size={11} /> : <FileSpreadsheet size={11} />}
              <span className="max-w-[220px] truncate">{fileName}</span>
              {!busy && (
                <button
                  type="button"
                  aria-label={t('import.remove')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName(null);
                    setError(null);
                    setProgress(0);
                  }}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <X size={10} />
                </button>
              )}
              {busy && <Loader2 size={10} className="animate-spin" />}
            </div>
          )}

          {busy && (
            <div className="w-full max-w-[260px] pt-1">
              <Progress value={progress} />
            </div>
          )}

          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t('import.privacy')}
          </p>
        </div>
      </div>

      {error && (
        <div
          className="mt-3 flex items-start gap-2.5 rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)' }}
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-red-300">{error.message}</p>
            {error.hint && <p className="mt-0.5 text-[11px] leading-relaxed text-red-200/70">{error.hint}</p>}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-1.5 text-[11px] underline underline-offset-2 text-red-300/90 hover:text-red-200"
            >
              {t('import.change')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
