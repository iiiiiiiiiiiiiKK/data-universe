import { useCallback, useEffect, useRef, useState } from 'react';

export interface Viewport {
  k: number;
  x: number;
  y: number;
}

const MIN_K = 0.08;
const MAX_K = 14;

/**
 * Pan / zoom state machine for a canvas 2D viewport.
 * Handles wheel-zoom around the cursor, drag-pan, and pinch-zoom on touch.
 */
export function useViewport(initial?: Partial<Viewport>) {
  const [viewport, setViewport] = useState<Viewport>({ k: 1, x: 0, y: 0, ...initial });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const pinchRef = useRef<{ active: boolean; dist: number; centerX: number; centerY: number; k: number }>({
    active: false,
    dist: 0,
    centerX: 0,
    centerY: 0,
    k: 1,
  });
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => setViewport({ k: 1, x: 0, y: 0 }), []);

  const zoomTo = useCallback((k: number) => {
    setViewport((v) => ({ ...v, k: Math.min(MAX_K, Math.max(MIN_K, k)) }));
  }, []);

  const onWheel = useCallback((e: WheelEvent, rect: DOMRect) => {
    e.preventDefault();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    setViewport((v) => {
      const factor = Math.exp(-e.deltaY * 0.0016);
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const scale = k / v.k;
      return { k, x: cx - (cx - v.x) * scale, y: cy - (cy - v.y) * scale };
    });
  }, []);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, originX: 0, originY: 0 };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setDragging(true);
    const movedX = dx - dragRef.current.originX;
    const movedY = dy - dragRef.current.originY;
    dragRef.current.originX = dx;
    dragRef.current.originY = dy;
    setViewport((v) => ({ ...v, x: v.x + movedX, y: v.y + movedY }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
    setTimeout(() => setDragging(false), 0);
  }, []);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = {
        active: true,
        dist,
        centerX: (a.clientX + b.clientX) / 2,
        centerY: (a.clientY + b.clientY) / 2,
        k: 1,
      };
      dragRef.current.active = false;
    }
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current.active) {
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = dist / (pinchRef.current.dist || dist);
      setViewport((v) => ({
        ...v,
        k: Math.min(MAX_K, Math.max(MIN_K, v.k * factor)),
      }));
      pinchRef.current.dist = dist;
    }
  }, []);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current.active = false;
  }, []);

  return {
    viewport,
    setViewport,
    reset,
    zoomTo,
    dragging,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

/** Attaches all viewport listeners to a canvas in one go. */
export function useCanvasViewport(canvasRef: React.RefObject<HTMLCanvasElement | null>, initial?: Partial<Viewport>) {
  const api = useViewport(initial);
  const { onWheel, onPointerDown, onPointerMove, onPointerUp, onTouchStart, onTouchMove, onTouchEnd } = api;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheel = (e: WheelEvent) => onWheel(e, canvas.getBoundingClientRect());
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [canvasRef, onWheel, onPointerDown, onPointerMove, onPointerUp, onTouchStart, onTouchMove, onTouchEnd]);

  return api;
}

/** Reactive device pixel ratio + element size observer. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr: Math.min(2.5, window.devicePixelRatio || 1),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return { ref, ...size };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
