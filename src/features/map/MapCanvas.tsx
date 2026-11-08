import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { DataRow, VisualConfig } from '@/types';
import { PALETTES } from '@/utils/palettes';
import { toNumber } from '@/features/data-engine/infer';
import { formatNumber } from '@/utils/cn';
import { useCanvasViewport, useElementSize } from '@/hooks/useViewport';
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

interface MapPoint {
  lat: number;
  lon: number;
  row: number;
  category: string;
  value: number | null;
  label: string;
}

/* The world basemap is a 110m Natural Earth outline (public domain) served from
   /public, so the app never calls a third-party tile server. */
let worldCache: GeoPermissibleObjects | null = null;
let worldPromise: Promise<GeoPermissibleObjects | null> | null = null;

/** Minimal TopoJSON typing — only what the `feature()` call needs. */
interface TopoCollection {
  type: 'GeometryCollection';
  geometries: unknown[];
}
interface TopoDoc {
  type: 'Topology';
  objects: Record<string, TopoCollection>;
}

async function loadWorld(): Promise<GeoPermissibleObjects | null> {
  if (worldCache) return worldCache;
  if (worldPromise) return worldPromise;
  worldPromise = (async () => {
    try {
      const url = new URL('world-110m.json', document.baseURI).toString();
      const res = await fetch(url);
      if (!res.ok) return null;
      const topo = (await res.json()) as TopoDoc;
      const collection = topo.objects.countries;
      if (!collection) return null;
      const geo = feature(topo as never, collection as never);
      worldCache = geo as unknown as GeoPermissibleObjects;
      return worldCache;
    } catch {
      return null;
    }
  })();
  return worldPromise;
}

/**
 * Geographic universe. Points are plotted at their real coordinates; zooming
 * uses the projection scale in projected space (no tile fetching, fully offline).
 */
export function MapCanvas({ rows, config, onSelect, exporting, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref: wrapRef, width: wrapW, height: wrapH, dpr } = useElementSize<HTMLDivElement>();
  const w = width ?? wrapW;
  const h = height ?? wrapH;
  const locale = useApp((s) => s.locale);
  const palette = PALETTES[config.palette] ?? PALETTES.nebula!;

  const [world, setWorld] = useState<GeoPermissibleObjects | null>(worldCache);
  const [hover, setHover] = useState<{ x: number; y: number; p: MapPoint } | null>(null);

  useEffect(() => {
    let alive = true;
    loadWorld().then((g) => {
      if (alive) setWorld(g);
    });
    return () => {
      alive = false;
    };
  }, []);

  const latField = config.mapping.latField;
  const lonField = config.mapping.lonField;
  const sizeField = config.mapping.sizeField;
  const colorField = config.mapping.colorField;

  const points = useMemo<MapPoint[]>(() => {
    if (!latField || !lonField) return [];
    const out: MapPoint[] = [];
    const stride = rows.length > 8000 ? Math.ceil(rows.length / 8000) : 1;
    for (let i = 0; i < rows.length; i += stride) {
      const row = rows[i]!;
      const lat = toNumber(row[latField]);
      const lon = toNumber(row[lonField]);
      if (lat === null || lon === null) continue;
      if (lat < -85 || lat > 85 || lon < -180 || lon > 180) continue;
      out.push({
        lat,
        lon,
        row: i,
        category: colorField ? String(row[colorField] ?? '—') : 'all',
        value: sizeField ? toNumber(row[sizeField]) : null,
        label: config.mapping.labelField ? String(row[config.mapping.labelField] ?? '') : '',
      });
    }
    return out;
  }, [rows, latField, lonField, colorField, sizeField, config.mapping.labelField]);

  const valueRange = useMemo(() => {
    const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [points]);

  const viewportApi = useCanvasViewport(canvasRef, { k: 1, x: 0, y: 0 });
  const { viewport, reset } = viewportApi;
  const projRef = useRef<{ x: number; y: number; p: MapPoint }[] | null>(null);

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
    ctx.fillStyle = isDark ? '#050915' : '#eef3fb';
    ctx.fillRect(0, 0, w, h);

    // Ocean ambience.
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, isDark ? 'rgba(56,189,248,0.08)' : 'rgba(56,189,248,0.06)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Fit the projection; viewport.k scales on top of the fitted scale.
    const baseScale = Math.min(w / 6.6, h / 3.4) * 0.92;
    const projection = geoNaturalEarth1()
      .scale(baseScale * viewport.k)
      .translate([w / 2 + viewport.x, h / 2 + viewport.y]);

    const path = geoPath(projection, ctx);

    if (world) {
      ctx.beginPath();
      path(world);
      ctx.fillStyle = isDark ? 'rgba(90,110,160,0.20)' : 'rgba(150,168,200,0.35)';
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(140,165,225,0.42)' : 'rgba(90,110,150,0.5)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    } else {
      // Graticule fallback so the view still reads as a map before the basemap loads.
      ctx.strokeStyle = isDark ? 'rgba(140,165,225,0.16)' : 'rgba(90,110,150,0.2)';
      ctx.lineWidth = 0.6;
      for (let lon = -180; lon <= 180; lon += 30) {
        ctx.beginPath();
        for (let lat = -80; lat <= 80; lat += 4) {
          const xy = projection([lon, lat]);
          if (!xy) continue;
          if (lat === -80) ctx.moveTo(xy[0], xy[1]);
          else ctx.lineTo(xy[0], xy[1]);
        }
        ctx.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let lon = -180; lon <= 180; lon += 4) {
          const xy = projection([lon, lat]);
          if (!xy) continue;
          if (lon === -180) ctx.moveTo(xy[0], xy[1]);
          else ctx.lineTo(xy[0], xy[1]);
        }
        ctx.stroke();
      }
    }

    // Points.
    const cats = [...new Set(points.map((p) => p.category))].sort();
    const colorOf = (c: string) => palette.colors[cats.indexOf(c) % palette.colors.length]!;
    const projected: Array<{ x: number; y: number; p: MapPoint }> = [];

    for (const p of points) {
      const xy = projection([p.lon, p.lat]);
      if (!xy) continue;
      const [x, y] = xy;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const norm = valueRange && p.value !== null ? (p.value - valueRange.min) / Math.max(1e-9, valueRange.max - valueRange.min) : 0.5;
      const r = (2 + norm * 6) * config.sizeScale;
      const c = colorOf(p.category);

      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      halo.addColorStop(0, `${c}77`);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = config.opacity;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      projected.push({ x, y, p });
    }
    projRef.current = projected;

    // Labels for the top few points by value.
    if (config.showLabels && projected.length <= 120) {
      const top = projected
        .slice()
        .sort((a, b) => (b.p.value ?? 0) - (a.p.value ?? 0))
        .slice(0, exporting ? 14 : 10);
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const t of top) {
        if (!t.p.label) continue;
        const text = t.p.label.length > 18 ? `${t.p.label.slice(0, 17)}…` : t.p.label;
        const m = ctx.measureText(text);
        ctx.fillStyle = isDark ? 'rgba(4,6,15,0.7)' : 'rgba(255,255,255,0.86)';
        ctx.fillRect(t.x - m.width / 2 - 3, t.y - 19, m.width + 6, 13);
        ctx.fillStyle = isDark ? 'rgba(230,236,255,0.95)' : 'rgba(24,30,50,0.9)';
        ctx.fillText(text, t.x, t.y - 7);
      }
    }
  }, [w, h, dpr, exporting, world, points, viewport, palette, config.opacity, config.sizeScale, config.showLabels, valueRange]);

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

  if (!latField || !lonField) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-1">
            {locale === 'zh' ? '当前数据没有可用的经纬度字段' : 'No usable latitude/longitude fields'}
          </p>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-2">
            {locale === 'zh'
              ? '地图模式只展示真实地理坐标。请提供 lat/lon 字段，或在字段映射中手动选择一个纬度和一个经度字段。'
              : 'Map mode shows real coordinates only. Provide lat/lon columns, or pick a latitude and longitude field in the mapping panel.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ minHeight: 240 }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: 'grab' }}
        role="img"
        aria-label={locale === 'zh' ? '地理分布地图' : 'Geographic distribution map'}
        onPointerDown={(e) => {
          if (!exporting) viewportApi.onPointerDown(e.nativeEvent);
        }}
        onPointerUp={(e) => {
          if (exporting) return;
          viewportApi.onPointerUp();
          const canvas = canvasRef.current!;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best: MapPoint | null = null;
          let bestD = 16;
          for (const pr of projRef.current ?? []) {
            const d = Math.hypot(pr.x - x, pr.y - y);
            if (d < bestD) {
              bestD = d;
              best = pr.p;
            }
          }
          if (best) onSelect?.(best.row);
        }}
        onPointerMove={(e) => {
          if (exporting) return;
          const canvas = canvasRef.current!;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best: MapPoint | null = null;
          let bestD = 14;
          for (const pr of projRef.current ?? []) {
            const d = Math.hypot(pr.x - x, pr.y - y);
            if (d < bestD) {
              bestD = d;
              best = pr.p;
            }
          }
          if (best) {
            setHover({ x, y, p: best });
            canvas.style.cursor = 'pointer';
          } else {
            setHover(null);
            canvas.style.cursor = 'grab';
          }
        }}
        onPointerLeave={() => setHover(null)}
      />

      {hover && !exporting && (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg px-2.5 py-2 text-[11px]"
          style={{
            left: Math.min(hover.x + 12, Math.max(8, w - 220)),
            top: Math.min(hover.y + 12, Math.max(8, h - 90)),
            background: 'color-mix(in srgb, var(--bg-1) 94%, transparent)',
            border: '1px solid var(--border-strong)',
          }}
        >
          {hover.p.label && <div className="truncate font-medium text-0">{hover.p.label}</div>}
          <div className="mt-0.5 font-mono text-[10px] text-2">
            {hover.p.lat.toFixed(3)}, {hover.p.lon.toFixed(3)}
          </div>
          {hover.p.value !== null && (
            <div className="text-2">
              {sizeField}: <span className="text-0">{formatNumber(hover.p.value, 2)}</span>
            </div>
          )}
        </div>
      )}

      {!exporting && (
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-xl p-1" style={{ background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)', border: '1px solid var(--border)' }}>
          <IconButton label="zoom in" onClick={() => viewportApi.zoomTo(viewport.k * 1.4)}>
            <Plus size={15} />
          </IconButton>
          <IconButton label="zoom out" onClick={() => viewportApi.zoomTo(viewport.k / 1.4)}>
            <Minus size={15} />
          </IconButton>
          <IconButton label="reset" onClick={reset}>
            <RotateCcw size={14} />
          </IconButton>
        </div>
      )}

      {!exporting && (
        <div
          className="absolute bottom-3 left-3 z-10 rounded-lg px-2.5 py-1.5 text-[10px]"
          style={{ background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          {locale === 'zh'
            ? `${points.length} 个坐标点 · 底图：Natural Earth (110m，公有领域)`
            : `${points.length} points · Basemap: Natural Earth 110m (public domain)`}
        </div>
      )}
    </div>
  );
}
