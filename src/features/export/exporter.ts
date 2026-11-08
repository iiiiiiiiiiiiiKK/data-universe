import type { DataFilter, Dataset, VisualConfig } from '@/types';

export interface UniverseExport {
  format: 'data-universe/v1';
  exportedAt: string;
  config: VisualConfig;
  filters: DataFilter[];
  dataset: {
    meta: Dataset['meta'];
    fields: string[];
    columns: Dataset['columns'];
    rows: Dataset['rows'];
  };
}

/** Serialise everything needed to re-import a universe. */
export function toExportJson(dataset: Dataset, config: VisualConfig, filters: DataFilter[]): UniverseExport {
  return {
    format: 'data-universe/v1',
    exportedAt: new Date().toISOString(),
    config,
    filters,
    dataset: {
      meta: dataset.meta,
      fields: dataset.fields,
      columns: dataset.columns,
      rows: dataset.rows,
    },
  };
}

export interface ImportValidation {
  ok: boolean;
  error?: string;
  payload?: UniverseExport;
}

/** Validate an imported JSON file before touching application state. */
export function validateImport(raw: unknown): ImportValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a JSON object' };
  const obj = raw as Partial<UniverseExport>;
  if (obj.format !== 'data-universe/v1') {
    return { ok: false, error: 'Unrecognised format (expected data-universe/v1)' };
  }
  if (!obj.dataset || !Array.isArray(obj.dataset.rows) || !Array.isArray(obj.dataset.fields)) {
    return { ok: false, error: 'Dataset payload is missing or malformed' };
  }
  if (!obj.config || typeof obj.config !== 'object') {
    return { ok: false, error: 'Visual config is missing' };
  }
  return { ok: true, payload: obj as UniverseExport };
}

/** Download a canvas as a PNG with a chosen scale. */
export async function canvasToPngBlob(canvas: HTMLCanvasElement, scale = 2): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}

/**
 * Build a standalone HTML file that renders the current universe as an image
 * plus a data table — no external scripts, works from file://.
 */
export function buildStandaloneHtml(opts: {
  title: string;
  subtitle: string;
  dataUrl: string;
  dataset: Dataset;
  config: VisualConfig;
  locale: 'zh' | 'en';
}): string {
  const { title, subtitle, dataUrl, dataset, config, locale } = opts;
  const previewRows = dataset.rows.slice(0, 200);
  const head = dataset.fields.slice(0, 12);
  const esc = (s: unknown) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="${locale === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#04060f; color:#e9eefc; font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .sub { color:#8d99b8; font-size: 13px; margin-bottom: 22px; }
  .card { background: rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 14px; }
  img { width:100%; border-radius: 10px; display:block; background:#04060f; }
  .meta { margin: 18px 0 8px; color:#8d99b8; font-size: 11px; }
  table { width:100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align:left; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); white-space: nowrap; max-width: 240px; overflow:hidden; text-overflow: ellipsis; }
  th { color:#8d99b8; font-weight:600; text-transform: uppercase; letter-spacing: 0.08em; font-size: 9.5px; }
  .scroll { overflow:auto; max-height: 460px; }
  .warn { margin-top: 18px; padding: 10px 12px; border-radius: 10px; background: rgba(251,191,36,0.07); border:1px solid rgba(251,191,36,0.24); color:#fcd34d; font-size: 11px; line-height: 1.6; }
  .brand { margin-top: 22px; font-size: 10.5px; color:#66708c; }
  a { color:#a3b8ff; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  <div class="card"><img alt="${esc(title)}" src="${dataUrl}"></div>
  <div class="meta">
    ${esc(dataset.meta.fileName)} · ${dataset.meta.rows.toLocaleString()} ${locale === 'zh' ? '行' : 'rows'} · ${dataset.meta.columns} ${locale === 'zh' ? '字段' : 'fields'} ·
    ${locale === 'zh' ? '可视化类型' : 'View'}: ${esc(config.mode)}
  </div>
  <div class="warn">
    ${locale === 'zh'
      ? '此文件包含你的原始数据（已内嵌在图片与下方表格中）。请勿随意公开分享。'
      : 'This file embeds your raw data in the image and the table below. Do not publish it casually.'}
  </div>
  <div class="card" style="margin-top:14px">
    <div class="scroll">
      <table>
        <thead><tr>${head.map((f) => `<th>${esc(f)}</th>`).join('')}</tr></thead>
        <tbody>
          ${previewRows
            .map((r) => `<tr>${head.map((f) => `<td>${esc(r[f] ?? '')}</td>`).join('')}</tr>`)
            .join('\n          ')}
        </tbody>
      </table>
    </div>
    ${
      dataset.rows.length > previewRows.length
        ? `<div class="meta">${locale === 'zh' ? `仅展示前 ${previewRows.length} 行，共 ${dataset.rows.length} 行。` : `Showing first ${previewRows.length} of ${dataset.rows.length} rows.`}</div>`
        : ''
    }
  </div>
  <div class="brand">Data Universe · 数据宇宙 — <a href="https://x.com/0xkillcoin" target="_blank" rel="noopener">@0xkillcoin</a></div>
</div>
</body>
</html>`;
}
