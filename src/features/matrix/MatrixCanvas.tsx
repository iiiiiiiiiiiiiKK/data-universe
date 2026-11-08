import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataRow, VisualConfig } from '@/types';
import { aggregateMatrix, correlationMatrix } from '@/utils/layout';
import { heatColor } from '@/utils/palettes';
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

/** Diverging colour for correlation values in [-1, 1]. */
function corrColor(v: number): string {
  if (!Number.isFinite(v)) return 'rgba(120,130,150,0.16)';
  const t = Math.abs(v);
  const rgb: [number, number, number] =
    v >= 0 ? [Math.round(60 + 130 * t), Math.round(120 - 20 * t), Math.round(200 - 120 * t)] : [Math.round(200 - 40 * t), Math.round(110 - 30 * t), Math.round(90 + 30 * t)];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.22 + 0.78 * t})`;
}

/**
 * Data matrix: either a cross-aggregated heatmap of two categorical fields, or
 * a numeric correlation matrix (Pearson / Spearman) — the method used is always
 * shown in the UI so correlation is never implied as causation.
 */
export function MatrixCanvas({ rows, config, exporting, width, height }: Props) {
  const { ref: wrapRef, width: wrapW, height: wrapH } = useElementSize<HTMLDivElement>();
  const w = width ?? wrapW;
  const h = height ?? wrapH;
  const locale = useApp((s) => s.locale);
  const [hover, setHover] = useState<{ row: number; col: number; x: number; y: number } | null>(null);

  const isCorrelation = config.matrixKind === 'correlation';

  const numericFields = useMemo(
    () =>
      config.mapping.matrixValueField
        ? [config.mapping.matrixValueField]
        : rows.length > 0
          ? Object.keys(rows[0]!).filter((f) => {
              let n = 0;
              let total = 0;
              for (let i = 0; i < Math.min(rows.length, 400); i++) {
                const v = rows[i]![f];
                if (v === null || v === undefined || v === '') continue;
                total++;
                if (toNumber(v) !== null) n++;
              }
              return total > 0 && n / total > 0.9;
            })
          : [],
    [rows, config.mapping.matrixValueField],
  );

  const corr = useMemo(() => {
    if (!isCorrelation) return null;
    const fields = numericFields.slice(0, 14);
    if (fields.length < 2) return null;
    return correlationMatrix(rows, fields, config.correlationMethod);
  }, [isCorrelation, numericFields, rows, config.correlationMethod]);

  const heat = useMemo(() => {
    if (isCorrelation) return null;
    const rowField = config.mapping.matrixRowField;
    const colField = config.mapping.matrixColField;
    if (!rowField || !colField) return null;
    return aggregateMatrix(rows, rowField, colField, config.mapping.matrixValueField, config.mapping.matrixValueField ? 'avg' : 'count');
  }, [isCorrelation, rows, config.mapping.matrixRowField, config.mapping.matrixColField, config.mapping.matrixValueField]);

  const cellRef = useRef<{ x: number; y: number; w: number; h: number; row: number; col: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = exporting ? 2 : Math.min(2.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#04060f' : '#f8fafd';
    ctx.fillRect(0, 0, w, h);

    ctx.font = '10px Inter, system-ui, sans-serif';

    if (isCorrelation && corr) {
      const labels = corr.fields.map((f) => (f.length > 16 ? `${f.slice(0, 15)}…` : f));
      const labelW = w < 480 ? 74 : 122;
      const labelH = w < 480 ? 74 : 110;
      const left = labelW;
      const top = labelH;
      const size = Math.min(w - left - 18, h - top - 18);
      if (size <= 0) return;
      const n = labels.length;
      const cell = size / n;

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const v = corr.matrix[i]![j]!;
          const x = left + j * cell;
          const y = top + i * cell;
          ctx.fillStyle = corrColor(v);
          ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
          if (cell > 30 && Number.isFinite(v)) {
            ctx.fillStyle = Math.abs(v) > 0.55 ? '#fff' : isDark ? 'rgba(220,230,250,0.85)' : 'rgba(30,40,60,0.85)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(v.toFixed(2), x + cell / 2, y + cell / 2);
          }
        }
        // Row labels
        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(180,195,225,0.9)' : 'rgba(50,60,85,0.9)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i]!, left - 6, top + i * cell + cell / 2);
        ctx.restore();
      }
      // Column labels (rotated)
      for (let j = 0; j < n; j++) {
        ctx.save();
        ctx.translate(left + j * cell + cell / 2, top - 6);
        ctx.rotate(-Math.PI / 3.2);
        ctx.fillStyle = isDark ? 'rgba(180,195,225,0.9)' : 'rgba(50,60,85,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[j]!, 0, 0);
        ctx.restore();
      }

      // Method + disclaimer
      ctx.fillStyle = isDark ? 'rgba(150,165,195,0.85)' : 'rgba(70,80,105,0.85)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        locale === 'zh'
          ? `${corr.method === 'pearson' ? 'Pearson' : 'Spearman'} 相关系数 · 相关不等于因果`
          : `${corr.method === 'pearson' ? 'Pearson' : 'Spearman'} correlation · correlation ≠ causation`,
        w - 10,
        h - 6,
      );
      cellRef.current = { x: left, y: top, w: size, h: size, row: 0, col: 0 };
      return;
    }

    if (heat) {
      const labelW = w < 480 ? 68 : 118;
      const labelH = w < 480 ? 64 : 96;
      const left = labelW;
      const top = labelH;
      const gridW = w - left - 16;
      const gridH = h - top - 22;
      if (gridW <= 0 || gridH <= 0) return;
      const cols = heat.colLabels.length;
      const rowsN = heat.rowLabels.length;
      const cw = gridW / Math.max(1, cols);
      const chh = gridH / Math.max(1, rowsN);
      const span = Math.max(1e-9, heat.max - heat.min);

      for (let i = 0; i < rowsN; i++) {
        for (let j = 0; j < cols; j++) {
          const v = heat.values[i]![j]!;
          const x = left + j * cw;
          const y = top + i * chh;
          if (v === null) {
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(20,30,50,0.04)';
            ctx.fillRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
            continue;
          }
          const t = (v - heat.min) / span;
          ctx.fillStyle = heatColor(t);
          ctx.fillRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
          if (cw > 42 && chh > 20) {
            ctx.fillStyle = t > 0.55 ? '#0b1020' : 'rgba(240,245,255,0.92)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatNumber(v, 1), x + cw / 2, y + chh / 2);
          }
        }
        ctx.fillStyle = isDark ? 'rgba(180,195,225,0.9)' : 'rgba(50,60,85,0.9)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const label = heat.rowLabels[i]!;
        ctx.fillText(label.length > 14 ? `${label.slice(0, 13)}…` : label, left - 6, top + i * chh + chh / 2);
      }
      for (let j = 0; j < cols; j++) {
        ctx.save();
        ctx.translate(left + j * cw + cw / 2, top - 6);
        ctx.rotate(-Math.PI / 3.2);
        ctx.fillStyle = isDark ? 'rgba(180,195,225,0.9)' : 'rgba(50,60,85,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = heat.colLabels[j]!;
        ctx.fillText(label.length > 14 ? `${label.slice(0, 13)}…` : label, 0, 0);
        ctx.restore();
      }

      // Colour legend
      const legendW = Math.min(150, w * 0.36);
      const lx = w - legendW - 14;
      const ly = h - 12;
      const grad = ctx.createLinearGradient(lx, 0, lx + legendW, 0);
      for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, heatColor(i / 10));
      ctx.fillStyle = grad;
      ctx.fillRect(lx, ly - 6, legendW, 5);
      ctx.fillStyle = isDark ? 'rgba(150,165,195,0.85)' : 'rgba(70,80,105,0.85)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(formatNumber(heat.min, 1), lx, ly - 9);
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(heat.max, 1), lx + legendW, ly - 9);

      cellRef.current = { x: left, y: top, w: cw, h: chh, row: rowsN, col: cols };
      return;
    }
  }, [w, h, exporting, isCorrelation, corr, heat, locale]);

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

  if (isCorrelation && !corr) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="max-w-sm text-xs leading-relaxed text-2">
          {locale === 'zh'
            ? '相关系数矩阵至少需要两个数值字段。当前数据中数值字段不足。'
            : 'A correlation matrix needs at least two numeric fields; this dataset has fewer.'}
        </p>
      </div>
    );
  }

  if (!isCorrelation && !heat) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-1">{locale === 'zh' ? '请选择行字段与列字段' : 'Choose row and column fields'}</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-2">
            {locale === 'zh'
              ? '热力矩阵会对两个分类字段做交叉聚合；也可以切换到相关矩阵查看数值字段关系。'
              : 'The heatmap cross-aggregates two categorical fields; switch to correlation to inspect numeric relationships.'}
          </p>
        </div>
      </div>
    );
  }

  const hoverCell = (() => {
    if (!hover) return null;
    if (isCorrelation && corr) {
      const r = corr.fields[hover.row];
      const c = corr.fields[hover.col];
      const v = corr.matrix[hover.row]?.[hover.col];
      if (!r || !c) return null;
      return { a: r, b: c, v: v ?? NaN, isCorr: true };
    }
    if (heat) {
      const r = heat.rowLabels[hover.row];
      const c = heat.colLabels[hover.col];
      const v = heat.values[hover.row]?.[hover.col];
      if (r === undefined || c === undefined) return null;
      return { a: r, b: c, v: v ?? null, isCorr: false };
    }
    return null;
  })();

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ minHeight: 240 }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label={locale === 'zh' ? '数据矩阵可视化' : 'Data matrix visualization'}
        onPointerMove={(e) => {
          if (exporting) return;
          const cell = cellRef.current;
          const canvas = canvasRef.current;
          if (!cell || !canvas) return;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (x < cell.x || y < cell.y) {
            setHover(null);
            return;
          }
          if (isCorrelation) {
            const n = corr?.fields.length ?? 0;
            const size = cell.w;
            const cs = size / Math.max(1, n);
            const col = Math.floor((x - cell.x) / cs);
            const row = Math.floor((y - cell.y) / cs);
            if (row < 0 || col < 0 || row >= n || col >= n) {
              setHover(null);
              return;
            }
            setHover({ row, col, x, y });
          } else {
            const col = Math.floor((x - cell.x) / cell.w);
            const row = Math.floor((y - cell.y) / cell.h);
            if (row < 0 || col < 0 || row >= cell.row || col >= cell.col) {
              setHover(null);
              return;
            }
            setHover({ row, col, x, y });
          }
        }}
        onPointerLeave={() => setHover(null)}
      />

      {hoverCell && hover && !exporting && (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-lg px-2.5 py-2 text-[11px]"
          style={{
            left: Math.min(hover.x + 14, Math.max(8, w - 250)),
            top: Math.min(hover.y + 14, Math.max(8, h - 80)),
            background: 'color-mix(in srgb, var(--bg-1) 94%, transparent)',
            border: '1px solid var(--border-strong)',
          }}
        >
          {hoverCell.isCorr ? (
            <>
              <div className="font-medium text-0">
                {hoverCell.a} ↔ {hoverCell.b}
              </div>
              <div className="mt-0.5 text-2">
                {Number.isFinite(hoverCell.v as number) ? (hoverCell.v as number).toFixed(3) : '—'}
              </div>
              <div className="mt-0.5 text-[10px] text-2">
                {locale === 'zh' ? '相关不等于因果' : 'Correlation is not causation'}
              </div>
            </>
          ) : (
            <>
              <div className="truncate font-medium text-0">
                {hoverCell.a} × {hoverCell.b}
              </div>
              <div className="mt-0.5 text-2">
                {hoverCell.v === null
                  ? locale === 'zh'
                    ? '该组合无数据'
                    : 'No data for this combination'
                  : `${config.mapping.matrixValueField ?? (locale === 'zh' ? '记录数' : 'Count')}: ${formatNumber(hoverCell.v as number, 2)}`}
              </div>
            </>
          )}
        </div>
      )}

      {!exporting && (
        <div
          className="absolute left-3 top-3 z-10 rounded-lg px-2 py-1 text-[10px]"
          style={{
            background: 'color-mix(in srgb, var(--bg-1) 86%, transparent)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
          }}
        >
          {isCorrelation
            ? locale === 'zh'
              ? `${config.correlationMethod === 'pearson' ? 'Pearson' : 'Spearman'} · ${corr?.fields.length ?? 0} 个数值字段`
              : `${config.correlationMethod === 'pearson' ? 'Pearson' : 'Spearman'} · ${corr?.fields.length ?? 0} numeric fields`
            : locale === 'zh'
              ? `${heat?.rowLabels.length ?? 0} × ${heat?.colLabels.length ?? 0} 交叉聚合`
              : `${heat?.rowLabels.length ?? 0} × ${heat?.colLabels.length ?? 0} cross-aggregation`}
        </div>
      )}
    </div>
  );
}


