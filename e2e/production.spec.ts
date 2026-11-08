import { expect, test } from '@playwright/test';

/**
 * Production verification against the live GitHub Pages deployment.
 *
 * This is NOT a local build check: every assertion below runs against the real
 * public URL, so it catches base-path, MIME, and CDN cache problems that a
 * local `vite preview` cannot reveal.
 */

const LIVE = 'https://iiiiiiiiiiiiiKK.github.io/data-universe/';

const CSV = `date,symbol,price,volume,chain
2026-01-01,AAA,101.5,12000,Ethereum
2026-01-02,AAA,104.25,14000,Ethereum
2026-01-03,BBB,88.75,9000,Solana
2026-01-04,BBB,91.2,9800,Solana
2026-01-05,CCC,12.4,44000,Cosmos
2026-01-06,CCC,13.1,51000,Cosmos
2026-01-07,AAA,106.9,15500,Ethereum
2026-01-08,BBB,94.8,10300,Solana
`;

test.use({ baseURL: LIVE });

test.describe('production — GitHub Pages', () => {
  test('home page loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    const res = await page.goto(LIVE, { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: /YOUR DATA/i })).toBeVisible();
    await expect(page.locator('header a[href="https://x.com/0xkillcoin"]').first()).toBeVisible();

    // Ignore only third-party font failures (offline-CDN tolerance).
    const real = errors.filter((e) => !/fonts\.(googleapis|gstatic)\.com/.test(e));
    expect(real).toEqual([]);
  });

  test('assets resolve (CSS, JS, favicon, world basemap)', async ({ page, request }) => {
    await page.goto(LIVE, { waitUntil: 'networkidle' });

    const css = await page.locator('link[rel="stylesheet"][href*="assets"]').first().getAttribute('href');
    expect(css).toBeTruthy();
    const cssRes = await request.get(new URL(css!, LIVE).toString());
    expect(cssRes.status()).toBe(200);
    expect((await cssRes.text()).length).toBeGreaterThan(1000);

    // The Natural Earth basemap must be reachable at the deployed sub-path.
    const worldRes = await request.get(new URL('world-110m.json', LIVE).toString());
    expect(worldRes.status()).toBe(200);
    const topo = await worldRes.json();
    expect(topo.type).toBe('Topology');
  });

  test('full journey: upload CSV → understand → galaxy → save → library', async ({ page }) => {
    await page.goto(LIVE, { waitUntil: 'networkidle' });

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'crypto.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf8'),
    });

    await expect(page.getByText('数据理解')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('字段分析')).toBeVisible();

    await page.getByRole('button', { name: /生成我的数据宇宙/ }).click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
    await page.getByRole('button', { name: '保存' }).click();

    await page.getByRole('button', { name: /作品库|Library/ }).first().click();
    await expect(page.getByRole('heading', { name: /作品库/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('h3').first()).toBeVisible();
  });

  test('export dialog offers all four formats', async ({ page }) => {
    await page.goto(LIVE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Crypto Market/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: '导出作品' }).first().click();
    for (const label of ['导出 PNG', '导出 SVG', '导出 HTML', '导出 JSON']) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test('JSON export actually downloads a valid file', async ({ page }) => {
    await page.goto(LIVE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Crypto Market/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '导出作品' }).first().click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByText('导出 JSON').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const stream = await download.createReadStream();
    let raw = '';
    for await (const chunk of stream) raw += chunk.toString('utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.format).toBe('data-universe/v1');
    expect(Array.isArray(parsed.dataset.rows)).toBe(true);
    expect(parsed.dataset.rows.length).toBeGreaterThan(0);
  });

  test('map mode renders the basemap on the deployed path', async ({ page }) => {
    await page.goto(LIVE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /查看全部|All \d+ datasets/ }).first().click();
    await page.getByRole('button', { name: /City Population/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /^地理宇宙/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
    // The basemap caption only renders once the topology loaded successfully.
    await expect(page.getByText(/Natural Earth/)).toBeVisible({ timeout: 20_000 });
  });

  test('mobile viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LIVE, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /YOUR DATA/i })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
