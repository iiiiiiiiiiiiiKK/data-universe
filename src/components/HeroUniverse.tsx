import { useCallback, useEffect, useRef } from 'react';
import { mulberry32 } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/useViewport';

interface Star {
  angle: number;
  radius: number;
  size: number;
  speed: number;
  hue: number;
  alpha: number;
  arm: number;
}

/**
 * Hero ambience: a slowly rotating abstract galaxy.
 *
 * This is decoration, not data — it is deliberately kept separate from the
 * data-driven GalaxyCanvas so no one mistakes the marketing visual for data.
 */
export function HeroUniverse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  const paint = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.52;
      const R = Math.min(w, h) * 0.42;

      // Core glow
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      core.addColorStop(0, 'rgba(190,205,255,0.85)');
      core.addColorStop(0.18, 'rgba(139,108,255,0.45)');
      core.addColorStop(0.5, 'rgba(122,85,242,0.14)');
      core.addColorStop(1, 'transparent');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      const rand = mulberry32(90210);
      const stars: Star[] = Array.from({ length: 520 }, () => ({
        angle: rand() * Math.PI * 2,
        radius: 0.12 + Math.pow(rand(), 1.6) * 0.95,
        size: 0.4 + rand() * 1.7,
        speed: 0.6 + rand() * 0.9,
        hue: rand(),
        alpha: 0.25 + rand() * 0.7,
        arm: Math.floor(rand() * 3),
      }));

      const t = reduced ? 0 : time * 0.00004;

      ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const armOffset = (s.arm / 3) * Math.PI * 2;
        const angle = s.angle + t * s.speed * 240 + s.radius * 2.6 + armOffset * 0.35;
        const r = s.radius * R;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.42;

        const color =
          s.hue > 0.72 ? '#6ce6c4' : s.hue > 0.5 ? '#7d96f8' : s.hue > 0.28 ? '#c084fc' : '#ffc46b';

        const glow = ctx.createRadialGradient(x, y, 0, x, y, s.size * 5);
        glow.addColorStop(0, `${color}cc`);
        glow.addColorStop(0.4, `${color}33`);
        glow.addColorStop(1, 'transparent');
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, s.size * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = Math.min(1, s.alpha * 1.2);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
    [reduced],
  );

  useEffect(() => {
    if (reduced) {
      paint(0);
      return;
    }
    let raf = 0;
    const loop = (t: number) => {
      paint(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paint, reduced]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
