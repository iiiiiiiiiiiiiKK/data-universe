import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataRow, VisualConfig } from '@/types';
import { buildBox, buildHistogram, buildScatter } from '@/utils/layout';
import { PALETTES } from '@/utils/palettes';
import { formatNumber } from '@/utils/cn';
import { toNumber } from '@/features/data-engine/infer';
import { useElementSize } from '@/hooks/useViewport';
import { useApp } from '@/stores/app';

interface Props {
  rows: DataRow[];
  config: VisualConfig;
  onSelect?: (rowIndex: number | null) => void;
  exporting?: boolean;
  width?: number;
  height?: number;
}

/**
 * Distribution universe: histogram, box plot, scatter, density (KDE-free
 * smooth histogram) and category share. All series come from real values.
 */
export function DistributionCanvas({ rows, config, onSelect, exporting, width, height }: Props) {
  const { ref: wrapRef, width: wrapW, height: wrapH, dpr } = useElementSize<HTMLDivElement>();
  const w = width ?? wrapW;
  const h = height ?? wrapH;
  const locale = useApp((s) => s.locale);
  const palette = PALETTES[config.palette] ?? PALETTES.nebula!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<Array<{ x: number; y: number; r: number; row: number }>>([]);
  const [hover, setHover] = useState<{ x: number; y: number; label: string; value: string } | null>(null);

  const field = config.mapping.distributionField;
  const kind = config.distributionKind;

  const numericField = useMemo(() => {
    if (!field) return null;
    let total = 0;
    let numeric = 0;
    for (let i = 0; i < Math.min(rows.length, 300); i++) {
      const v = rows[i]![field];
      if (v === null || v === undefined || v === '') continue;
      total++;
      if (toNumber(v) !== null) numeric++;
    }
    return total > 0 && numeric / total > 0.85 ? field : null;
  }, [rows, field]);

  const secondNumeric = useMemo(() => {
    if (!config.mapping.sizeField) return null;
    return config.mapping.sizeField;
  }, [config.mapping.sizeField]);

  const values = useMemo(() => {
    if (!numericField) return [];
    const out: number[] = [];
    for (const row of rows) {
      const v = toNumber(row[numericField]);
      if (v !== null) out.push(v);
    }
    return out;
  }, [rows, numericField]);

  const categoryCounts = useMemo(() => {
    if (!field) return [];
    const map = new Map<string, number>();
    for (const row of rows) {
      const v = row[field];
      const key = v === null || v === undefined || v === '' ? '(missing)' : String(v);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  }, [rows, field]);

  const histogram = useMemo(
    () => (numericField ? buildHistogram(values, w < 480 ? 16 : 26) : []),
    [numericField, values, w],
  );
  const box = useMemo(() => (numericField ? buildBox(values) : null), [numericField, values]);
  const scatter = useMemo(
    () => (numericField && secondNumeric ? buildScatter(rows, numericField, secondNumeric, config.mapping.colorField) : []),
    [numericField, secondNumeric, rows, config.mapping.colorField],
  );

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
    ctx.fillStyle = isDark ? '#04060f' : '#f8fafd';
    ctx.fillRect(0, 0, w, h);

    const padL = w < 480 ? 40 : 56;
    const padR = 16;
    const padT = 26;
    const padB = 40;
    const plotW = Math.max(10, w - padL - padR);
    const plotH = Math.max(10, h - padT - padB);
    hitRef.current = [];

    const axisText = isDark ? 'rgba(160,175,205,0.78)' : 'rgba(70,80,105,0.82)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = axisText;

    /* ---------------- histogram / density ---------------- */
    if ((kind === 'histogram' || kind === 'density') && numericField && histogram.length > 0) {
      const maxCount = Math.max(...histogram.map((b) => b.count));
      const bw = plotW / histogram.length;

      if (kind === 'density') {
        // Smooth the bins into a filled density curve.
        const pts = histogram.map((b, i) => ({
          x: padL + (i + 0.5) * bw,
          y: padT + plotH - (b.count / Math.max(1, maxCount)) * plotH * 0.92,
        }));
        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, `${palette.accent}77`);
        grad.addColorStop(1, `${palette.accent}08`);
        ctx.beginPath();
        ctx.moveTo(padL, padT + plotH);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!;
          const prev = pts[i - 1];
          if (!prev) ctx.lineTo(p.x, p.y);
          else {
            const cx = (prev.x + p.x) / 2;
            ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
          }
        }
        ctx.lineTo(padL + plotW, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        for (let i = 0; i < histogram.length; i++) {
          const b = histogram[i]!;
          const bh = (b.count / Math.max(1, maxCount)) * plotH * 0.92;
          const x = padL + i * bw;
          const y = padT + plotH - bh;
          const grad = ctx.createLinearGradient(0, y, 0, padT + plotH);
          grad.addColorStop(0, palette.colors[1] ?? palette.accent);
          grad.addColorStop(1, `${palette.colors[1] ?? palette.accent}33`);
          ctx.fillStyle = grad;
          ctx.fillRect(x + 1, y, Math.max(1, bw - 2), bh);
          hitRef.current.push({ x: x + bw / 2, y, r: 10, row: -1 });
          ctx.fillStyle = axisText;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          if (i % Math.ceil(histogram.length / (w < 480 ? 4 : 7)) === 0) {
            ctx.fillText(formatNumber(b.start, 1), x, padT + plotH + 8);
          }
        }
        // Y axis labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= 4; i++) {
          const y = padT + (plotH * i) / 4;
          ctx.fillStyle = axisText;
          ctx.fillText(formatNumber((maxCount * (4 - i)) / 4, 0), padL - 6, y);
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,21,40,0.07)';
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + plotW, y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = axisText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(numericField, padL + plotW / 2, h - 8);
      return;
    }

    /* ---------------- box plot ---------------- */
    if (kind === 'box' && numericField && box) {
      const midX = padL + plotW / 2;
      const boxW = Math.min(plotW * 0.42, 190);
      const span = Math.max(1e-9, box.max - box.min);
      const yOf = (v: number) => padT + plotH - ((v - box.min) / span) * plotH * 0.94 - plotH * 0.03;

      // Whiskers
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(midX, yOf(box.min));
      ctx.lineTo(midX, yOf(box.max));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX - boxW / 4, yOf(box.min));
      ctx.lineTo(midX + boxW / 4, yOf(box.min));
      ctx.moveTo(midX - boxW / 4, yOf(box.max));
      ctx.lineTo(midX + boxW / 4, yOf(box.max));
      ctx.stroke();

      // Box
      const boxGrad = ctx.createLinearGradient(midX - boxW / 2, 0, midX + boxW / 2, 0);
      boxGrad.addColorStop(0, `${palette.colors[0]}cc`);
      boxGrad.addColorStop(1, `${palette.colors[1] ?? palette.accent}cc`);
      ctx.fillStyle = boxGrad;
      ctx.fillRect(midX - boxW / 2, yOf(box.q3), boxW, Math.max(1, yOf(box.q1) - yOf(box.q3)));
      ctx.strokeStyle = palette.accent;
      ctx.strokeRect(midX - boxW / 2, yOf(box.q3), boxW, Math.max(1, yOf(box.q1) - yOf(box.q3)));

      // Median + mean
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midX - boxW / 2, yOf(box.median));
      ctx.lineTo(midX + boxW / 2, yOf(box.median));
      ctx.stroke();
      ctx.strokeStyle = `${palette.colors[3] ?? '#ffc46b'}`;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(midX - boxW / 2, yOf(box.mean));
      ctx.lineTo(midX + boxW / 2, yOf(box.mean));
      ctx.stroke();
      ctx.setLineDash([]);

      // Outliers
      ctx.fillStyle = `${palette.colors[5] ?? '#f472b6'}aa`;
      for (const o of box.outliers) {
        const y = yOf(Math.min(box.max * 1.1, Math.max(box.min * 0.9, o)));
        ctx.beginPath();
        ctx.arc(midX + (Math.random() - 0.5) * boxW * 0.5, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Labels
      ctx.fillStyle = axisText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labels: Array<[string, number]> = [
        [`max ${formatNumber(box.max, 1)}`, box.max],
        [`Q3 ${formatNumber(box.q3, 1)}`, box.q3],
        [`median ${formatNumber(box.median, 1)}`, box.median],
        [`mean ${formatNumber(box.mean, 1)}`, box.mean],
        [`Q1 ${formatNumber(box.q1, 1)}`, box.q1],
        [`min ${formatNumber(box.min, 1)}`, box.min],
      ];
      for (const [text, val] of labels) {
        ctx.fillText(text, midX + boxW / 2 + 10, yOf(val));
      }
      if (box.outliers.length > 0) {
        ctx.fillStyle = axisText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          locale === 'zh'
            ? `${box.outliers.length} 个离群值（IQR 1.5×）`
            : `${box.outliers.length} outliers (IQR 1.5×)`,
          padL + plotW / 2,
          h - 10,
        );
      }
      return;
    }

    /* ---------------- scatter ---------------- */
    if (kind === 'scatter' && numericField && secondNumeric && scatter.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of scatter) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const spanX = Math.max(1e-9, maxX - minX);
      const spanY = Math.max(1e-9, maxY - minY);
      const xOf = (v: number) => padL + ((v - minX) / spanX) * plotW;
      const yOf = (v: number) => padT + plotH - ((v - minY) / spanY) * plotH;

      // Grid
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,21,40,0.07)';
      for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.fillStyle = axisText;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatNumber(maxY - (spanY * i) / 4, 1), padL - 6, y);
      }

      const cats = [...new Set(scatter.map((p) => p.category))].sort();
      const colorOf = (c: string) => palette.colors[cats.indexOf(c) % palette.colors.length]!;
      for (const p of scatter) {
        const x = xOf(p.x);
        const y = yOf(p.y);
        ctx.fillStyle = `${colorOf(p.category)}bb`;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        hitRef.current.push({ x, y, r: 6, row: p.row });
      }

      ctx.fillStyle = axisText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${numericField}  →`, padL + plotW / 2, h - 8);
      ctx.save();
      ctx.translate(12, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${secondNumeric}  →`, 0, 0);
      ctx.restore();
      return;
    }

    /* ---------------- category share ---------------- */
    if (kind === 'share' && categoryCounts.length > 0) {
      const total = categoryCounts.reduce((a, b) => a + b.count, 0);
      const cx = w / 2;
      const cy = padT + plotH / 2;
      const radius = Math.min(plotW, plotH) * 0.38;
      let angle = -Math.PI / 2;
      const top = categoryCounts.slice(0, 12);
      top.forEach((c, i) => {
        const frac = c.count / total;
        const end = angle + frac * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, angle, end);
        ctx.closePath();
        ctx.fillStyle = palette.colors[i % palette.colors.length]!;
        ctx.globalAlpha = config.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
        angle = end;
      });
      // Donut hole
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#04060f' : '#f8fafd';
      ctx.fill();
      ctx.fillStyle = isDark ? 'rgba(228,236,255,0.95)' : 'rgba(24,30,50,0.92)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(formatNumber(total, 0), cx, cy - 7);
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = axisText;
      ctx.fillText(locale === 'zh' ? '记录数' : 'records', cx, cy + 10);

      // Legend
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      const legendX = w - (w < 480 ? 96 : 150);
      let legendY = padT + 6;
      top.slice(0, 8).forEach((c, i) => {
        ctx.fillStyle = palette.colors[i % palette.colors.length]!;
        ctx.fillRect(legendX, legendY, 8, 8);
        ctx.fillStyle = axisText;
        const name = c.value.length > 14 ? `${c.value.slice(0, 13)}…` : c.value;
        ctx.fillText(`${name} ${((c.count / total) * 100).toFixed(1)}%`, legendX + 12, legendY + 7);
        legendY += 15;
      });
      return;
    }

    // Nothing renderable
    ctx.fillStyle = axisText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      locale === 'zh' ? '当前设置没有可绘制的分布' : 'No distribution available for this setting',
      w / 2,
      h / 2,
    );
  }, [w, h, dpr, exporting, kind, numericField, secondNumeric, histogram, box, scatter, categoryCounts, palette, config.opacity, locale]);

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

  if (!field) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="max-w-sm text-xs leading-relaxed text-2">
          {locale === 'zh'
            ? '请选择一个字段来绘制分布。直方图与箱线图需要数值字段，类别占比可以使用分类字段。'
            : 'Choose a field to draw its distribution. Histograms and box plots need a numeric field; category share works with categories.'}
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ minHeight: 220 }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label={locale === 'zh' ? '数据分布可视化' : 'Data distribution visualization'}
        onPointerMove={(e) => {
          if (exporting) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best: { x: number; y: number; r: number; row: number } | null = null;
          let bestD = Infinity;
          for (const hit of hitRef.current) {
            const d = Math.hypot(hit.x - x, hit.y - y);
            if (d < hit.r + 4 && d < bestD) {
              best = hit;
              bestD = d;
            }
          }
          if (best && best.row >= 0) {
            const row = rows[best.row];
            if (row) {
              setHover({
                x,
                y,
                label: config.mapping.labelField ? String(row[config.mapping.labelField] ?? '') : `#${best.row + 1}`,
                value: numericField ? formatNumber(toNumber(row[numericField]) ?? 0, 2) : '',
              });
              return;
            }
          }
          setHover(null);
        }}
        onPointerUp={(e) => {
          if (exporting) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best: { x: number; y: number; r: number; row: number } | null = null;
          let bestD = Infinity;
          for (const hit of hitRef.current) {
            const d = Math.hypot(hit.x - x, hit.y - y);
            if (d < hit.r + 6 && d < bestD) {
              best = hit;
              bestD = d;
            }
          }
          if (best && best.row >= 0) onSelect?.(best.row);
        }}
        onPointerLeave={() => setHover(null)}
      />

      {hover && !exporting && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg px-2.5 py-1.5 text-[11px]"
          style={{
            left: Math.min(hover.x + 12, Math.max(8, w - 190)),
            top: Math.min(hover.y + 12, Math.max(8, h - 60)),
            background: 'color-mix(in srgb, var(--bg-1) 94%, transparent)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="max-w-[170px] truncate font-medium text-0">{hover.label}</div>
          {hover.value && <div className="text-2">{numericField}: {hover.value}</div>}
        </div>
      )}
    </div>
  );
}
