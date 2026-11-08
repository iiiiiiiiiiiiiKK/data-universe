import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, Download, FileJson, FileText, Image as ImageIcon, Loader2, ShieldAlert } from 'lucide-react';
import type { DataFilter, Dataset, VisualConfig } from '@/types';
import { Modal } from '@/components/ui';
import { useApp } from '@/stores/app';
import { downloadBlob, formatNumber } from '@/utils/cn';
import { buildStandaloneHtml, canvasToPngBlob, toExportJson } from './exporter';
import { GalaxyCanvas } from '@/features/galaxy/GalaxyCanvas';
import { NetworkCanvas } from '@/features/network/NetworkCanvas';
import { TimelineCanvas } from '@/features/timeline/TimelineCanvas';
import { MapCanvas } from '@/features/map/MapCanvas';
import { MatrixCanvas } from '@/features/matrix/MatrixCanvas';
import { DistributionCanvas } from '@/features/distribution/DistributionCanvas';

const EXPORT_W = 1600;
const EXPORT_H = 1000;

/** Renders the active view at export resolution, off-screen. */
function OffscreenView({ config, rows }: { config: VisualConfig; rows: Dataset['rows'] }) {
  const common = { rows, config, exporting: true, width: EXPORT_W, height: EXPORT_H };
  switch (config.mode) {
    case 'network':
      return <NetworkCanvas {...common} />;
    case 'timeline':
      return <TimelineCanvas {...common} />;
    case 'map':
      return <MapCanvas {...common} />;
    case 'matrix':
      return <MatrixCanvas {...common} />;
    case 'distribution':
      return <DistributionCanvas {...common} />;
    default:
      return <GalaxyCanvas {...common} />;
  }
}

export function ExportDialog({
  open,
  onClose,
  dataset,
  rows,
  config,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  dataset: Dataset;
  rows: Dataset['rows'];
  config: VisualConfig;
  filters: DataFilter[];
}) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const pushToast = useApp((s) => s.pushToast);
  const stageRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  // Give the offscreen canvases a frame (or two for the map basemap) to paint.
  useEffect(() => {
    if (!open) return;
    setReady(false);
    const id = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(id);
  }, [open, config.mode]);

  const title = useMemo(() => {
    if (config.title.trim()) return config.title.trim();
    const base = dataset.meta.fileName.replace(/\.[^.]+$/, '');
    return `${base} · ${t(`mode.${config.mode}`)}`;
  }, [config.title, dataset.meta.fileName, config.mode, t]);

  const getCanvas = useCallback(() => {
    const root = stageRef.current;
    if (!root) return null;
    return root.querySelector('canvas');
  }, []);

  const doPng = async () => {
    const canvas = getCanvas();
    if (!canvas) {
      pushToast(locale === 'zh' ? '画布尚未就绪' : 'Canvas not ready yet', 'error');
      return;
    }
    setBusy('png');
    try {
      const blob = await canvasToPngBlob(canvas, 1.5);
      downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, '_')}.png`);
      pushToast(t('export.done'), 'success');
    } catch {
      pushToast(locale === 'zh' ? 'PNG 导出失败' : 'PNG export failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const doSvg = async () => {
    const canvas = getCanvas();
    if (!canvas) {
      pushToast(locale === 'zh' ? '画布尚未就绪' : 'Canvas not ready yet', 'error');
      return;
    }
    setBusy('svg');
    try {
      // Canvas visuals are raster-only; wrap the raster in a real SVG document
      // so the output is a valid, scalable-container vector file.
      const blob = await canvasToPngBlob(canvas, 1.5);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${EXPORT_W}" height="${EXPORT_H}" viewBox="0 0 ${EXPORT_W} ${EXPORT_H}">
  <title>${title.replace(/[<>&]/g, '')}</title>
  <rect width="100%" height="100%" fill="#04060f"/>
  <image x="0" y="0" width="${EXPORT_W}" height="${EXPORT_H}" xlink:href="${dataUrl}"/>
  <text x="24" y="${EXPORT_H - 20}" font-family="Inter, sans-serif" font-size="16" fill="#8d99b8">${title.replace(/[<>&]/g, '')}</text>
</svg>`;
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${title.replace(/[\\/:*?"<>|]/g, '_')}.svg`);
      pushToast(t('export.done'), 'success');
    } catch {
      pushToast(locale === 'zh' ? 'SVG 导出失败' : 'SVG export failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const doHtml = async () => {
    const canvas = getCanvas();
    if (!canvas) {
      pushToast(locale === 'zh' ? '画布尚未就绪' : 'Canvas not ready yet', 'error');
      return;
    }
    setBusy('html');
    try {
      const blob = await canvasToPngBlob(canvas, 1.5);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      const html = buildStandaloneHtml({
        title,
        subtitle: config.subtitle,
        dataUrl,
        dataset: { ...dataset, rows },
        config,
        locale,
      });
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${title.replace(/[\\/:*?"<>|]/g, '_')}.html`);
      pushToast(t('export.done'), 'success');
    } catch {
      pushToast(locale === 'zh' ? 'HTML 导出失败' : 'HTML export failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const doJson = () => {
    setBusy('json');
    try {
      const payload = toExportJson({ ...dataset, rows }, config, filters);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, '_')}.json`);
      pushToast(t('export.done'), 'success');
    } finally {
      setBusy(null);
    }
  };

  const copyConfig = async () => {
    try {
      const payload = toExportJson({ ...dataset, rows }, config, filters);
      await navigator.clipboard.writeText(JSON.stringify(payload));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      pushToast(t('export.shareConfig'), 'success');
    } catch {
      pushToast(locale === 'zh' ? '剪贴板不可用' : 'Clipboard unavailable', 'error');
    }
  };

  const items = [
    {
      key: 'png',
      icon: <ImageIcon size={16} />,
      title: t('export.png'),
      desc: t('export.pngDesc'),
      onClick: doPng,
    },
    {
      key: 'svg',
      icon: <Code2 size={16} />,
      title: t('export.svg'),
      desc: t('export.svgDesc'),
      onClick: doSvg,
    },
    {
      key: 'html',
      icon: <FileText size={16} />,
      title: t('export.html'),
      desc: t('export.htmlDesc'),
      onClick: doHtml,
    },
    {
      key: 'json',
      icon: <FileJson size={16} />,
      title: t('export.json'),
      desc: t('export.jsonDesc'),
      onClick: doJson,
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('export.title')} width="max-w-xl">
      <div className="grid gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            disabled={busy !== null}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--panel-strong)] disabled:opacity-60"
            style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {busy === item.key ? <Loader2 size={16} className="animate-spin" /> : item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-0">{item.title}</span>
              <span className="mt-0.5 block text-[11px] text-2">{item.desc}</span>
            </span>
            <Download size={14} className="shrink-0 text-2" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={copyConfig}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-medium transition-colors"
        style={{ background: 'var(--panel)', border: '1px dashed var(--border-strong)', color: 'var(--text-1)' }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? t('detail.copied') : t('export.copyConfig')}
      </button>

      <div
        className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
        style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.24)' }}
      >
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <p className="text-[11px] leading-relaxed text-amber-200/80">{t('export.warning')}</p>
      </div>

      <p className="mt-3 text-center text-[10px] text-2">
        {formatNumber(rows.length, 0)} {t('common.rows')} · {EXPORT_W}×{EXPORT_H}
        {!ready && ` · ${t('export.rendering')}`}
      </p>

      {/* Off-screen render stage. Positioned far off-canvas but still painted. */}
      <div
        ref={stageRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -20000,
          top: 0,
          width: EXPORT_W,
          height: EXPORT_H,
          pointerEvents: 'none',
          opacity: 1,
        }}
      >
        {open && <OffscreenView config={config} rows={rows} />}
      </div>
    </Modal>
  );
}
