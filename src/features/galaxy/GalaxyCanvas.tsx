import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Move, Plus, RotateCcw } from 'lucide-react';
import type { DataRow, VisualConfig } from '@/types';
import { buildColorMap, PALETTES } from '@/utils/palettes';
import { buildGalaxyLayout, type GalaxyLayout } from '@/utils/layout';
import { hashString, mulberry32 } from '@/utils/cn';
import { useCanvasViewport, useElementSize, usePrefersReducedMotion } from '@/hooks/useViewport';
import { useApp } from '@/stores/app';
import { IconButton, Tooltip } from '@/components/ui';

interface Props {
  rows: DataRow[];
  config: VisualConfig;
  onSelect?: (rowIndex: number | null) => void;
  selectedRow?: number | null;
  /** Export mode: no interaction chrome, fixed sizing. */
  exporting?: boolean;
  width?: number;
  height?: number;
}

interface HitNode {
  x: number;
  y: number;
  r: number;
  index: number;
  row: number;
}

/**
 * The signature Data Universe view.
 *
 * Canvas 2D is used deliberately: thousands of glowing stars with radial
 * gradients are cheap on canvas and would be catastrophic as DOM nodes.
 * All star properties come from real record values (see buildGalaxyLayout).
 */
export function GalaxyCanvas({ rows, config, onSelect, selectedRow, exporting, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref: wrapRef, width: wrapW, height: wrapH, dpr } = useElementSize<HTMLDivElement>();
  const w = width ?? wrapW;
  const h = height ?? wrapH;
  const reducedMotion = usePrefersReducedMotion();
  const locale = useApp((s) => s.locale);

  const [hover, setHover] = useState<{ x: number; y: number; node: HitNode } | null>(null);
  const hitRef = useRef<HitNode[]>([]);
  const layoutRef = useRef<GalaxyLayout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });

  const palette = PALETTES[config.palette] ?? PALETTES.nebula!;

  // Only the inputs that actually change node positions are dependencies: the
  // layout generator is deterministic, so visual-only settings (opacity, size
  // scale, palette) must not force an expensive re-layout of every star.
  const layout = useMemo(
    () => buildGalaxyLayout(rows, config.mapping, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these config fields affect the layout
    [rows, config.mapping, config.showLinks, config.layout],
  );
  layoutRef.current = layout;

  const colorMap = useMemo(() => {
    if (!config.mapping.colorField) return new Map<string, string>();
    const cats = layout.nodes.map((n) => n.category);
    return buildColorMap(cats, palette);
  }, [layout.nodes, config.mapping.colorField, palette]);

  const viewportApi = useCanvasViewport(exporting ? { current: null } : canvasRef, { k: 1, x: 0, y: 0 });
  const { viewport, reset } = viewportApi;

  /* ---------------- background starfield (static, deterministic) ---------------- */
  const starfield = useMemo(() => {
    const r = mulberry32(hashString(`stars:${Math.round(config.starfield * 100)}`));
    const count = Math.round(160 + config.starfield * 520);
    return Array.from({ length: count }, () => ({
      x: r(),
      y: r(),
      r: 0.35 + r() * 1.15,
      a: 0.12 + r() * 0.55,
      tw: r() * Math.PI * 2,
    }));
  }, [config.starfield]);

  /* ---------------- main draw ---------------- */
  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cw = w;
      const ch = h;
      const ratio = exporting ? 2 : dpr;
      if (canvas.width !== Math.round(cw * ratio) || canvas.height !== Math.round(ch * ratio)) {
        canvas.width = Math.round(cw * ratio);
        canvas.height = Math.round(ch * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const isDark = document.documentElement.classList.contains('dark');
      const bg0 = isDark ? palette.background[0] : '#f7f9ff';
      const bg1 = isDark ? palette.background[2] : '#e8eefb';

      // Deep space background with a soft central glow.
      const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg0);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);

      // Ambient nebula blobs derived from the palette so each palette feels distinct.
      if (isDark) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const cx = cw * (0.24 + i * 0.27);
          const cy = ch * (0.35 + (i % 2) * 0.3);
          const rad = Math.max(cw, ch) * 0.42;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, `${palette.colors[i % palette.colors.length]}18`);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, cw, ch);
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // Starfield (parallax-free so it reads as a stable sky).
      for (const s of starfield) {
        const twinkle = config.animate && !reducedMotion ? 0.6 + 0.4 * Math.sin(time * 0.0006 + s.tw) : 1;
        ctx.globalAlpha = s.a * twinkle * (isDark ? 1 : 0.35);
        ctx.fillStyle = isDark ? '#dce6ff' : '#5a6b8c';
        ctx.beginPath();
        ctx.arc(s.x * cw, s.y * ch, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* ---------- world -> screen ---------- */
      const nodes = layout.nodes;
      if (nodes.length === 0) return;

      // Fit-to-view scale so any dataset fills the canvas nicely.
      const bw = Math.max(1, layout.bounds.maxX - layout.bounds.minX);
      const bh = Math.max(1, layout.bounds.maxY - layout.bounds.minY);
      const fit = Math.min(cw / (bw * 1.14), ch / (bh * 1.14));
      const baseK = Math.min(fit, cw / 2200);
      const cx0 = (layout.bounds.minX + layout.bounds.maxX) / 2;
      const cy0 = (layout.bounds.minY + layout.bounds.maxY) / 2;

      const k = viewport.k * baseK;
      const tx = (x: number) => (x - cx0) * k + cw / 2 + viewport.x;
      const ty = (y: number) => (y - cy0) * k + ch / 2 + viewport.y;

      const isSmall = nodes.length > 3000;
      const hits: HitNode[] = [];

      /* ---------- links ---------- */
      if (config.showLinks && layout.links.length > 0 && !isSmall) {
        ctx.lineWidth = 1;
        for (const link of layout.links) {
          const a = nodes[link.a];
          const b = nodes[link.b];
          if (!a || !b) continue;
          const ax = tx(a.x);
          const ay = ty(a.y);
          const bx = tx(b.x);
          const by = ty(b.y);
          if (ax < -60 || ax > cw + 60 || ay < -60 || ay > ch + 60) continue;
          const ca = colorMap.get(a.category) ?? palette.colors[0]!;
          const g = ctx.createLinearGradient(ax, ay, bx, by);
          g.addColorStop(0, `${ca}30`);
          g.addColorStop(1, `${ca}08`);
          ctx.strokeStyle = g;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      /* ---------- stars ---------- */
      const compact = nodes.length > 800;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const sx = tx(n.x);
        const sy = ty(n.y);
        if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;

        const baseR = (1.5 + n.weight * 4.2) * config.sizeScale * (compact ? 0.92 : 1);
        const r = Math.max(0.8, baseR);
        const color = colorMap.get(n.category) ?? palette.colors[hashString(n.category) % palette.colors.length]!;
        const alpha = config.opacity * (0.55 + n.brightness * 0.45);
        const isSelected = selectedRow !== null && selectedRow === n.row;

        // Glow halo (cheap: one radial gradient per node, skipped when very dense).
        if (!isSmall || isSelected) {
          const glowR = r * (isSelected ? 5.5 : 3.4);
          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
          g.addColorStop(0, `${color}${isSelected ? 'cc' : '55'}`);
          g.addColorStop(0.45, `${color}22`);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        // Bright core for larger stars only (keeps dense views fast).
        if (r > 2.4) {
          ctx.globalAlpha = Math.min(1, alpha * 1.25);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isSelected) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        hits.push({ x: sx, y: sy, r: Math.max(r, 3.5), index: i, row: n.row });
      }
      hitRef.current = hits;

      /* ---------- labels ---------- */
      if (config.showLabels && !isSmall) {
        const showAll = nodes.length <= 90;
        ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const drawn: Array<[number, number]> = [];
        const limit = exporting ? 60 : 42;
        let count = 0;
        // Label the biggest stars first so the canvas stays legible.
        const ordered = [...nodes].map((n, i) => ({ n, i })).sort((a, b) => b.n.weight - a.n.weight);
        for (const { n } of ordered) {
          if (count >= limit) break;
          if (!n.label) continue;
          const sx = tx(n.x);
          const sy = ty(n.y);
          if (sx < 20 || sx > cw - 20 || sy < 20 || sy > ch - 20) continue;
          if (!showAll && n.weight < 0.45) continue;
          const tooClose = drawn.some(([dx, dy]) => Math.hypot(dx - sx, dy - sy) < 46);
          if (tooClose) continue;
          drawn.push([sx, sy]);
          const text = n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label;
          const m = ctx.measureText(text);
          ctx.fillStyle = isDark ? 'rgba(4,6,15,0.62)' : 'rgba(255,255,255,0.82)';
          ctx.fillRect(sx - m.width / 2 - 4, sy + 8, m.width + 8, 14);
          ctx.fillStyle = isDark ? 'rgba(226,234,255,0.94)' : 'rgba(24,30,50,0.92)';
          ctx.fillText(text, sx, sy + 9);
          count++;
        }
      }
    },
    [
      w,
      h,
      dpr,
      exporting,
      layout,
      viewport,
      config.opacity,
      config.sizeScale,
      config.showLabels,
      config.showLinks,
      config.animate,
      colorMap,
      palette,
      starfield,
      selectedRow,
      reducedMotion,
    ],
  );

  /* ---------------- render loop ---------------- */
  useEffect(() => {
    if (exporting) {
      draw(0);
      return;
    }
    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, exporting]);

  /* ---------------- pointer interaction ---------------- */
  const hitTest = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: HitNode | null = null;
    let bestD = Infinity;
    for (const hit of hitRef.current) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d < hit.r + 7 && d < bestD) {
        best = hit;
        bestD = d;
      }
    }
    return best;
  }, []);

  const handleMove = (e: React.PointerEvent) => {
    if (exporting) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, node: hit });
      if (canvas) canvas.style.cursor = 'pointer';
    } else {
      setHover(null);
      if (canvasRef.current) canvasRef.current.style.cursor = viewportApi.dragging ? 'grabbing' : 'grab';
    }
  };

  const handleDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
    if (!exporting) {
      viewportApi.onPointerDown(e.nativeEvent);
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    }
  };

  const handleUp = (e: React.PointerEvent) => {
    if (exporting) return;
    viewportApi.onPointerUp();
    const moved = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y) > 5;
    if (!moved) {
      const hit = hitTest(e.clientX, e.clientY);
      onSelect?.(hit ? hit.row : null);
    }
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  };

  const hoveredRow = hover ? rows[hover.node.row] : null;
  const hoverColor = hover
    ? (colorMap.get(layout.nodes[hover.node.index]?.category ?? '') ?? palette.colors[0]!)
    : palette.colors[0]!;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ minHeight: 220 }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: exporting ? 'default' : 'grab' }}
        onPointerMove={handleMove}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerLeave={() => {
          setHover(null);
          viewportApi.onPointerUp();
        }}
        role="img"
        aria-label={locale === 'zh' ? '数据星系可视化画布' : 'Data galaxy visualization canvas'}
      />

      {/* Hover tooltip */}
      {hover && hoveredRow && !exporting && (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-lg px-2.5 py-2 text-[11px] shadow-xl"
          style={{
            left: Math.min(hover.x + 14, Math.max(8, w - 250)),
            top: Math.min(hover.y + 14, Math.max(8, h - 120)),
            background: 'color-mix(in srgb, var(--bg-1) 94%, transparent)',
            border: '1px solid var(--border-strong)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: hoverColor }} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-2">#{hover.node.row + 1}</span>
          </div>
          {config.mapping.labelField && (
            <div className="truncate font-medium text-0">{String(hoveredRow[config.mapping.labelField] ?? '—')}</div>
          )}
          {config.mapping.colorField && (
            <div className="mt-0.5 truncate text-2">
              {config.mapping.colorField}: {String(hoveredRow[config.mapping.colorField] ?? '—')}
            </div>
          )}
          {config.mapping.sizeField && (
            <div className="mt-0.5 truncate text-2">
              {config.mapping.sizeField}: {String(hoveredRow[config.mapping.sizeField] ?? '—')}
            </div>
          )}
          <div className="mt-1 text-[10px] text-2">{locale === 'zh' ? '点击查看完整记录' : 'Click for full record'}</div>
        </div>
      )}

      {/* Zoom controls */}
      {!exporting && (
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-xl p-1" style={{ background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)', border: '1px solid var(--border)' }}>
          <Tooltip label={locale === 'zh' ? '放大' : 'Zoom in'}>
            <IconButton label="zoom in" onClick={() => viewportApi.zoomTo(viewport.k * 1.35)}>
              <Plus size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip label={locale === 'zh' ? '缩小' : 'Zoom out'}>
            <IconButton label="zoom out" onClick={() => viewportApi.zoomTo(viewport.k / 1.35)}>
              <Minus size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip label={locale === 'zh' ? '重置视角' : 'Reset view'}>
            <IconButton label="reset view" onClick={reset}>
              <RotateCcw size={14} />
            </IconButton>
          </Tooltip>
        </div>
      )}

      {/* Sampling notice */}
      {!exporting && layout.sampled.shown < layout.sampled.total && (
        <div
          className="absolute bottom-3 left-3 z-10 rounded-lg px-2.5 py-1.5 text-[10px]"
          style={{ background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          {locale === 'zh'
            ? `已采样 ${layout.sampled.shown} / ${layout.sampled.total} 行用于渲染`
            : `Sampled ${layout.sampled.shown} / ${layout.sampled.total} rows for render`}
        </div>
      )}

      {/* Empty guard */}
      {layout.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 text-2">
            <Move size={22} className="opacity-50" />
            <p className="text-xs">{locale === 'zh' ? '当前筛选条件下没有数据' : 'No rows match the current filters'}</p>
          </div>
        </div>
      )}

      {exporting && (
        <div className="absolute right-2 top-2 flex items-center gap-1 text-[9px] text-2">
          <Maximize2 size={9} />
        </div>
      )}
    </div>
  );
}
