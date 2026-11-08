import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, maxDigits = 2): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(maxDigits)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(maxDigits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(maxDigits)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(maxDigits)}K`;
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: maxDigits });
  return n.toPrecision(3);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatPercent(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRelative(ts: number, locale: 'zh' | 'en'): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return locale === 'zh' ? '刚刚' : 'just now';
  if (min < 60) return locale === 'zh' ? `${min} 分钟前` : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return locale === 'zh' ? `${h} 小时前` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return locale === 'zh' ? `${d} 天前` : `${d}d ago`;
  return formatDate(ts);
}

export function uid(prefix = 'u'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Deterministic PRNG so layouts are reproducible for the same dataset. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
