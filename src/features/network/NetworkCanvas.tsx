import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { DataRow, VisualConfig } from '@/types';
import { buildNetwork } from '@/utils/layout';
import { PALETTES } from '@/utils/palettes';
import { hashString, mulberry32 } from '@/utils/cn';
import { useCanvasViewport, useElementSize, usePrefersReducedMotion } from '@/hooks/useViewport';
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

interface SimNode {
  id: string;
  label: string;
  group: string;
  degree: number;
  rows: number[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Relationship network built strictly from real (from → to) value pairs.
 * Layout is a deterministic force relaxation so the same data always renders
 * the same graph.
 */
export function NetworkCanvas({ rows, config, onSelect, exporting, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref: wrapRef, width: wrapW, height: wrapH, dpr } = useElementSize<HTMLDivElement>();
  const w = width ?? wrapW;
  const h = height ?? wrapH;
  const reduced = usePrefersReducedMotion();
  const locale = useApp((s) => s.locale);
  const palette = PALETTES[config.palette] ?? PALETTES.nebula!;

  const fromField = config.mapping.edgeFromField;
  const toField = config.mapping.edgeToField;

  const graph = useMemo(() => {
    if (!fromField || !toField) return null;
    return buildNetwork(rows, fromField, toField, config.mapping.colorField);
  }, [rows, fromField, toField, config.mapping.colorField]);

  const simRef = useRef<{ nodes: SimNode[]; links: Array<{ a: number; b: number; weight: number }>; alpha: number } | null>(null);
  const [simReady, setSimReady] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; node: SimNode } | null>(null);
  const viewportApi = useCanvasViewport(canvasRef, { k: 1, x: 0, y: 0 });
  const { viewport, reset } = viewportApi;
  const selectedIdRef = useRef<number | null>(null);

  /* Build the simulation state whenever the graph changes. */
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) {
      simRef.current = null;
      setSimReady(false);
      return;
    }
    // Cap node count so the layout stays interactive.
    const MAX = 1200;
    const nodes = graph.nodes
      .slice()
      .sort((a, b) => b.degree - a.degree)
      .slice(0, MAX);
    const keep = new Set(nodes.map((n) => n.id));
    const links = graph.links.filter((l) => keep.has(l.source) && keep.has(l.target));

    const rand = mulberry32(hashString(`${graph.nodes.length}:${graph.links.length}:${fromField}:${toField}`));
    const R = 420;
    const maxDeg = Math.max(1, ...nodes.map((n) => n.degree));

    const simNodes: SimNode[] = nodes.map((n, i) => {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const angle = i * golden;
      const rad = R * Math.sqrt((i + 0.5) / nodes.length);
      const degNorm = n.degree / maxDeg;
      return {
        ...n,
        x: Math.cos(angle) * rad + (rand() - 0.5) * 40,
        y: Math.sin(angle) * rad + (rand() - 0.5) * 40,
        vx: 0,
        vy: 0,
        r: 2.5 + degNorm * 9,
      };
    });

    const index = new Map(simNodes.map((n, i) => [n.id, i]));
    const simLinks = links
      .map((l) => ({ a: index.get(l.source) ?? -1, b: index.get(l.target) ?? -1, weight: l.weight }))
      .filter((l) => l.a >= 0 && l.b >= 0);

    // Deterministic relaxation: a bounded number of ticks, no random seeds.
    const ticks = Math.min(240, Math.max(60, Math.floor(20000 / Math.max(1, simNodes.length))));
    for (let t = 0; t < ticks; t++) {
      const alpha = 1 - t / ticks;
      // Repulsion (sampled for large graphs to stay fast).
      const stepSize = simNodes.length > 500 ? Math.ceil(simNodes.length / 500) : 1;
      for (let i = 0; i < simNodes.length; i += stepSize) {
        const a = simNodes[i]!;
        for (let j = i + 1; j < simNodes.length; j += stepSize) {
          const b = simNodes[j]!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 === 0) {
            dx = (rand() - 0.5) * 0.01;
            dy = (rand() - 0.5) * 0.01;
            d2 = dx * dx + dy * dy;
          }
          if (d2 > 90000) continue;
          const f = (1400 * alpha) / d2;
          const d = Math.sqrt(d2);
          a.vx -= (dx / d) * f;
          a.vy -= (dy / d) * f;
          b.vx += (dx / d) * f;
          b.vy += (dy / d) * f;
        }
      }
      // Spring attraction along real edges.
      for (const l of simLinks) {
        const a = simNodes[l.a]!;
        const b = simNodes[l.b]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const ideal = 70;
        const f = ((d - ideal) / d) * 0.045 * alpha * Math.min(3, 1 + l.weight * 0.2);
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      // Gravity to centre keeps components from drifting away.
      for (const n of simNodes) {
        n.vx -= n.x * 0.0016 * alpha;
        n.vy -= n.y * 0.0016 * alpha;
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.82;
        n.vy *= 0.82;
      }
    }

    simRef.current = { nodes: simNodes, links: simLinks, alpha: 0 };
    setSimReady(true);
  }, [graph, fromField, toField]);

  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const ratio = exporting ? 2 : dpr;
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? '#04060f' : '#f6f8fd';
      ctx.fillRect(0, 0, w, h);

      // Subtle radial vignette.
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, isDark ? 'rgba(122,85,242,0.10)' : 'rgba(122,85,242,0.05)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const sim = simRef.current;
      if (!sim || sim.nodes.length === 0) return;

      // Fit to canvas.
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const n of sim.nodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const fit = Math.min((w * 0.9) / bw, (h * 0.9) / bh);
      const cx0 = (minX + maxX) / 2;
      const cy0 = (minY + maxY) / 2;
      const k = viewport.k * fit;
      const tx = (x: number) => (x - cx0) * k + w / 2 + viewport.x;
      const ty = (y: number) => (y - cy0) * k + h / 2 + viewport.y;

      const groups = [...new Set(sim.nodes.map((n) => n.group))].sort();
      const colorOf = (grp: string) => palette.colors[groups.indexOf(grp) % palette.colors.length]!;

      // Edges first.
      ctx.lineWidth = 1;
      for (const l of sim.links) {
        const a = sim.nodes[l.a]!;
        const b = sim.nodes[l.b]!;
        const ax = tx(a.x);
        const ay = ty(a.y);
        const bx = tx(b.x);
        const by = ty(b.y);
        const c = colorOf(a.group);
        ctx.strokeStyle = isDark ? `${c}33` : `${c}44`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // Nodes.
      for (const n of sim.nodes) {
        const x = tx(n.x);
        const y = ty(n.y);
        if (x < -30 || x > w + 30 || y < -30 || y > h + 30) continue;
        const c = colorOf(n.group);
        const isHover = hover?.node.id === n.id;

        const halo = ctx.createRadialGradient(x, y, 0, x, y, n.r * 3.6);
        halo.addColorStop(0, `${c}66`);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, n.r * 3.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = config.opacity;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (isHover) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, n.r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Labels for the biggest hubs only, to avoid clutter.
      if (config.showLabels && sim.nodes.length <= 400) {
        const top = sim.nodes
          .slice()
          .sort((a, b) => b.degree - a.degree)
          .slice(0, exporting ? 26 : 18);
        ctx.font = '500 10.5px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const n of top) {
          const x = tx(n.x);
          const y = ty(n.y);
          if (x < 20 || x > w - 20 || y < 20 || y > h - 20) continue;
          const text = n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label;
          const m = ctx.measureText(text);
          ctx.fillStyle = isDark ? 'rgba(4,6,15,0.66)' : 'rgba(255,255,255,0.86)';
          ctx.fillRect(x - m.width / 2 - 3, y + n.r + 3, m.width + 6, 13);
          ctx.fillStyle = isDark ? 'rgba(226,234,255,0.95)' : 'rgba(24,30,50,0.9)';
          ctx.fillText(text, x, y + n.r + 4);
        }
      }

      // Keep a frame marker for hit-testing on the next pointer move.
      lastFrameRef.current = { sim, k, tx, ty, groups };
      void time;
      void reduced;
      void selectedIdRef;
    },
    [w, h, dpr, exporting, viewport, config.opacity, config.showLabels, palette, hover, reduced],
  );

  const lastFrameRef = useRef<{
    sim: { nodes: SimNode[]; links: Array<{ a: number; b: number; weight: number }>; alpha: number };
    k: number;
    tx: (x: number) => number;
    ty: (y: number) => number;
    groups: string[];
  } | null>(null);

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

  const hitTest = useCallback((clientX: number, clientY: number): SimNode | null => {
    const canvas = canvasRef.current;
    const frame = lastFrameRef.current;
    if (!canvas || !frame) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of frame.sim.nodes) {
      const nx = frame.tx(n.x);
      const ny = frame.ty(n.y);
      const d = Math.hypot(nx - x, ny - y);
      if (d < n.r + 8 && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }, []);

  if (!fromField || !toField) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-1">
            {locale === 'zh' ? '请选择用于构建关系的两个字段' : 'Choose two fields to build the network'}
          </p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-2">
            {locale === 'zh'
              ? '关系网络只会使用数据中真实存在的字段取值连接节点，不会凭空生成关系。'
              : 'Nodes are connected only by real field values present in your data — no invented relationships.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ minHeight: 220 }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => {
          if (!exporting) viewportApi.onPointerDown(e.nativeEvent);
        }}
        onPointerUp={(e) => {
          if (exporting) return;
          viewportApi.onPointerUp();
          const node = hitTest(e.clientX, e.clientY);
          if (node && node.rows.length > 0) onSelect?.(node.rows[0]!);
        }}
        onPointerMove={(e) => {
          if (exporting) return;
          const node = hitTest(e.clientX, e.clientY);
          if (node) {
            const rect = canvasRef.current!.getBoundingClientRect();
            setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, node });
            canvasRef.current!.style.cursor = 'pointer';
          } else {
            setHover(null);
            canvasRef.current!.style.cursor = 'grab';
          }
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={locale === 'zh' ? '关系网络可视化' : 'Relationship network visualization'}
      />

      {hover && !exporting && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg px-2.5 py-2 text-[11px]"
          style={{
            left: Math.min(hover.x + 12, Math.max(8, w - 220)),
            top: Math.min(hover.y + 12, Math.max(8, h - 90)),
            background: 'color-mix(in srgb, var(--bg-1) 94%, transparent)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="max-w-[190px] truncate font-medium text-0">{hover.node.label}</div>
          <div className="mt-0.5 text-2">
            {locale === 'zh' ? '连接数' : 'Degree'}: {hover.node.degree}
          </div>
          <div className="text-2">
            {locale === 'zh' ? '分组' : 'Group'}: {hover.node.group}
          </div>
        </div>
      )}

      {!exporting && (
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-xl p-1" style={{ background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)', border: '1px solid var(--border)' }}>
          <IconButton label="zoom in" onClick={() => viewportApi.zoomTo(viewport.k * 1.35)}>
            <Plus size={15} />
          </IconButton>
          <IconButton label="zoom out" onClick={() => viewportApi.zoomTo(viewport.k / 1.35)}>
            <Minus size={15} />
          </IconButton>
          <IconButton label="reset" onClick={reset}>
            <RotateCcw size={14} />
          </IconButton>
        </div>
      )}

      {!exporting && graph && (
        <div
          className="absolute bottom-3 left-3 z-10 max-w-[70%] rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed"
          style={{ background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          {locale === 'zh' ? graph.note : `Built from real values of "${fromField}" → "${toField}": ${graph.links.length} edges.`}
        </div>
      )}

      {!simReady && (
        <div className="absolute inset-0 grid place-items-center text-xs text-2">
          {locale === 'zh' ? '正在计算网络布局…' : 'Computing network layout…'}
        </div>
      )}
    </div>
  );
}
