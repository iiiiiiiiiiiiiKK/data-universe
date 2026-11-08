import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { DataRow, VisualConfig } from '@/types';
import { buildTimeline } from '@/utils/layout';
import { PALETTES } from '@/utils/palettes';
import { formatNumber } from '@/utils/cn';
import { useElementSize, usePrefersReducedMotion } from '@/hooks/useViewport';
import { useApp } from '@/stores/app';
import { IconButton } from '@/components/ui';

interface Props {
  rows: DataRow[];
  config: VisualConfig;
  onSelect?: (rowIndex: number | null) => void;
  exporting?: boolean;
  width?: number;
  height?: number;
}

function fmtTime(ts: number, granularity: 'year' | 'month' | 'day' | 'second'): string {
  const d = new Date(ts);
  const pad = (v: number) => String(v).padStart(2, '0');
  if (granularity === 'year') return String(d.getUTCFullYear());
  if (granularity === 'month') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  if (granularity === 'second') return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * Timeline universe: a real time axis derived from a date/datetime field,
 * an optional value line, category-coloured event markers, and playback.
 */
export function TimelineCanvas({ rows, config, onSelect, exporting, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref: wrapRef, width: wrapW, height: wrapH, dpr } = useElementSize<HTMLDivElement>();
  const w = width ?? wrapW;
  const h = height ?? wrapH;
  const locale = useApp((s) => s.locale);
  const reduced = usePrefersReducedMotion();
  const palette = PALETTES[config.palette] ?? PALETTES.nebula!;

  const timeField = config.mapping.timeField;
  const valueField = config.mapping.valueField;
  const colorField = config.mapping.colorField;

  const model = useMemo(
    () => (timeField ? buildTimeline(rows, timeField, valueField, colorField, config.mapping.labelField, 64) : null),
    [rows, timeField, valueField, colorField, config.mapping.labelField],
  );

  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  /* Playback advances a normalised cursor 0..1 over the real time span. */
  useEffect(() => {
    if (!playing || reduced) return;
    lastTickRef.current = performance.now();
    const tick = (t: number) => {
      const dt = t - lastTickRef.current;
      lastTickRef.current = t;
      setCursor((c) => {
        const next = c + dt / 9000;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, reduced]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = exporting ? 2 : dpr;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#04060f' : '#f7f9ff';
    ctx.fillRect(0, 0, w, h);

    if (!model || model.points.length === 0) return;

    const padL = w < 480 ? 44 : 62;
    const padR = w < 480 ? 14 : 26;
    const padT = 24;
    const padB = 34;
    const plotW = Math.max(10, w - padL - padR);
    const plotH = Math.max(10, h - padT - padB);

    const categories = [...new Set(model.points.map((p) => p.category))].sort();
    const colorOf = (c: string) => palette.colors[categories.indexOf(c) % palette.colors.length]!;

    const span = Math.max(1, model.maxTime - model.minTime);
    const xOf = (t: number) => padL + ((t - model.minTime) / span) * plotW;
    const valueMin = Math.min(0, model.minValue);
    const valueMax = model.maxValue;
    const yOf = (v: number) =>
      padT + plotH - ((v - valueMin) / Math.max(1e-9, valueMax - valueMin)) * plotH;

    /* -------- grid -------- */
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(16,21,40,0.09)';
    ctx.lineWidth = 1;
    const rows4 = 4;
    for (let i = 0; i <= rows4; i++) {
      const y = padT + (plotH * i) / rows4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      const v = valueMax - ((valueMax - valueMin) * i) / rows4;
      ctx.fillStyle = isDark ? 'rgba(160,175,205,0.72)' : 'rgba(60,70,95,0.72)';
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(model.hasValue ? formatNumber(v, 1) : '', padL - 8, y);
    }

    /* -------- x labels -------- */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticks = w < 480 ? 3 : 6;
    const gran =
      span > 86400000 * 400 ? 'year' : span > 86400000 * 40 ? 'month' : span > 86400000 ? 'day' : 'second';
    for (let i = 0; i <= ticks; i++) {
      const t = model.minTime + (span * i) / ticks;
      const x = xOf(t);
      ctx.fillStyle = isDark ? 'rgba(160,175,205,0.72)' : 'rgba(60,70,95,0.72)';
      ctx.fillText(fmtTime(t, gran), x, padT + plotH + 8);
    }

    /* -------- area/line of bucketed average -------- */
    if (model.hasValue) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, `${palette.accent}55`);
      grad.addColorStop(1, `${palette.accent}00`);
      ctx.beginPath();
      ctx.moveTo(xOf(model.buckets[0]!.start), yOf(0));
      for (const b of model.buckets) {
        ctx.lineTo(xOf((b.start + b.end) / 2), yOf(b.avg));
      }
      ctx.lineTo(xOf(model.buckets[model.buckets.length - 1]!.end), yOf(0));
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      let first = true;
      for (const b of model.buckets) {
        const x = xOf((b.start + b.end) / 2);
        const y = yOf(b.avg);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* -------- event dots -------- */
    const cutoff = model.minTime + span * cursor;
    const maxDots = 4000;
    const stride = model.points.length > maxDots ? Math.ceil(model.points.length / maxDots) : 1;
    for (let i = 0; i < model.points.length; i += stride) {
      const p = model.points[i]!;
      if (p.time > cutoff) continue;
      const x = xOf(p.time);
      const y = model.hasValue
        ? yOf(p.value)
        : padT + plotH - ((p.time - model.minTime) / span) * plotH * 0.86 - plotH * 0.07;
      const c = colorOf(p.category);
      ctx.fillStyle = `${c}${hoverIdx === i ? 'ff' : 'aa'}`;
      ctx.beginPath();
      ctx.arc(x, y, hoverIdx === i ? 3.6 : 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    /* -------- playhead -------- */
    const px = xOf(cutoff);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(16,21,40,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, padT + plotH);
    ctx.stroke();

    /* -------- legend -------- */
    if (categories.length > 1 && categories.length <= 8) {
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let lx = padL;
      const ly = 10;
      for (const c of categories) {
        ctx.fillStyle = colorOf(c);
        ctx.beginPath();
        ctx.arc(lx + 3, ly, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isDark ? 'rgba(200,210,230,0.9)' : 'rgba(40,50,70,0.9)';
        ctx.fillText(c.length > 14 ? `${c.slice(0, 13)}…` : c, lx + 10, ly);
        lx += ctx.measureText(c).width + 28;
        if (lx > w - 80) break;
      }
    }

    plotRef.current = { padL, padT, plotW, plotH, xOf, yOf, cutoff };
  }, [w, h, dpr, exporting, model, palette, cursor, hoverIdx]);

  const plotRef = useRef<{
    padL: number;
    padT: number;
    plotW: number;
    plotH: number;
    xOf: (t: number) => number;
    yOf: (v: number) => number;
    cutoff: number;
  } | null>(null);

  useEffect(() => {
    if (exporting) {
      draw();
      return;
    }
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, exporting]);

  if (!timeField) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-1">{locale === 'zh' ? '请选择一个时间字段' : 'Choose a time field'}</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-2">
            {locale === 'zh'
              ? '时间线只基于数据中真实的日期 / 日期时间字段生成，不会伪造时间轴。'
              : 'The timeline is driven only by a real date/datetime field in your data.'}
          </p>
        </div>
      </div>
    );
  }

  const hoveredPoint = hoverIdx !== null && model ? model.points[hoverIdx] : null;
  const hoveredRow = hoveredPoint ? rows[hoveredPoint.row] : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ minHeight: 220 }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: 'crosshair' }}
        role="img"
        aria-label={locale === 'zh' ? '时间线可视化' : 'Timeline visualization'}
        onPointerMove={(e) => {
          if (exporting || !model) return;
          const canvas = canvasRef.current!;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          let best = -1;
          let bestD = 14;
          model.points.forEach((p, i) => {
            const pxx = plotRef.current?.xOf(p.time) ?? 0;
            const d = Math.abs(pxx - x);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          setHoverIdx(best >= 0 ? best : null);
        }}
        onPointerUp={(e) => {
          if (exporting || !model) return;
          const canvas = canvasRef.current!;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          let best = -1;
          let bestD = 18;
          model.points.forEach((p, i) => {
            const pxx = plotRef.current?.xOf(p.time) ?? 0;
            const d = Math.abs(pxx - x);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          if (best >= 0) onSelect?.(model.points[best]!.row);
        }}
        onPointerLeave={() => setHoverIdx(null)}
      />

      {hoveredRow && hoveredPoint && !exporting && (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg px-2.5 py-2 text-[11px]"
          style={{
            right: 14,
            top: 14,
            background: 'color-mix(in srgb, var(--bg-1) 94%, transparent)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="font-mono text-[10px] text-2">{fmtTime(hoveredPoint.time, 'second')}</div>
          {config.mapping.labelField && (
            <div className="mt-0.5 truncate font-medium text-0">
              {String(hoveredRow[config.mapping.labelField] ?? '—')}
            </div>
          )}
          {valueField && (
            <div className="mt-0.5 text-2">
              {valueField}: <span className="text-0">{formatNumber(hoveredPoint.value, 2)}</span>
            </div>
          )}
          {colorField && (
            <div className="text-2">
              {colorField}: {String(hoveredRow[colorField] ?? '—')}
            </div>
          )}
        </div>
      )}

      {!exporting && (
        <div className="absolute bottom-2 right-3 z-10 flex items-center gap-1 rounded-xl px-1.5 py-1" style={{ background: 'color-mix(in srgb, var(--bg-1) 90%, transparent)', border: '1px solid var(--border)' }}>
          <IconButton label={playing ? 'pause' : 'play'} onClick={() => setPlaying((p) => !p)} active={playing}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </IconButton>
          <IconButton
            label="restart"
            onClick={() => {
              setCursor(0);
              setPlaying(true);
            }}
          >
            <RotateCcw size={13} />
          </IconButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={cursor}
            aria-label="time cursor"
            className="ml-1 w-20 sm:w-28"
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
          />
        </div>
      )}
    </div>
  );
}
