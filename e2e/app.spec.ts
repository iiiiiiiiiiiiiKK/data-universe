import { expect, test, type Page } from '@playwright/test';

/**
 * Real end-to-end coverage of the primary user journey:
 * home -> upload CSV -> understand -> generate universe -> interact -> export.
 *
 * The same suite runs on desktop Chrome and Pixel 7. Mobile-specific flows
 * (drawer navigation) are handled by the `isMobile` helper rather than by
 * duplicating tests, so both breakpoints verify identical behaviour.
 */

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

function filePayload(name: string, mimeType: string, buffer: Buffer) {
  return { name, mimeType, buffer };
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 640;

async function openNavDrawer(page: Page) {
  if (!isMobile(page)) return;
  const menu = page.getByRole('button', { name: 'menu' });
  if (await menu.count()) await menu.click();
}

test.describe('home page', () => {
  test('renders hero, author X link and six modes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /YOUR DATA/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /YOUR UNIVERSE/i })).toBeVisible();

    // The author X link must be present in the top bar on every breakpoint.
    const xLink = page.locator('header a[href="https://x.com/0xkillcoin"]').first();
    await expect(xLink).toBeVisible();
    await expect(xLink).toHaveAttribute('target', '_blank');
    await expect(xLink).toHaveAttribute('rel', /noopener/);

    for (const mode of ['数据星系', '关系网络', '时间宇宙', '地理宇宙', '数据矩阵', '分布宇宙']) {
      await expect(page.getByText(mode).first()).toBeVisible();
    }
  });

  test('switches language to English', async ({ page }) => {
    await page.goto('/');
    if (isMobile(page)) {
      await openNavDrawer(page);
      await page.getByRole('button', { name: /English/ }).first().click();
    } else {
      await page.getByRole('button', { name: 'Switch language' }).click();
    }
    await expect(page.getByRole('heading', { name: /YOUR UNIVERSE/i })).toBeVisible();
    await expect(page.getByText('Six universes')).toBeVisible();
  });

  test('toggles light and dark theme', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
    const label = isMobile(page) ? 'theme' : /深色|Dark/;
    await page.getByRole('button', { name: label }).first().click();
    await expect(html).not.toHaveClass(/dark/);
  });
});

test.describe('import -> understand -> generate', () => {
  test('uploads a CSV and reaches the workspace galaxy', async ({ page }) => {
    await page.goto('/');

    await page.locator('input[type="file"]').first().setInputFiles(
      filePayload('crypto.csv', 'text/csv', Buffer.from(CSV, 'utf8')),
    );

    await expect(page.getByText('crypto.csv')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('数据理解')).toBeVisible();
    await expect(page.getByText('字段分析')).toBeVisible();

    await page.getByRole('button', { name: /生成我的数据宇宙/ }).click();

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole('button', { name: '撤销' })).toBeVisible();
  });

  test('switches between all six visualization modes', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles(
      filePayload('crypto.csv', 'text/csv', Buffer.from(CSV, 'utf8')),
    );
    await expect(page.getByText('数据理解')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /生成我的数据宇宙/ }).click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 25000 });

    // Each mode must render either a canvas or, when the data genuinely lacks
    // the required fields, an explicit explanation - never a blank panel.
    for (const mode of ['关系网络', '时间宇宙', '地理宇宙', '数据矩阵', '分布宇宙', '数据星系']) {
      // Desktop mode buttons carry their description in the accessible name;
      // the mobile strip uses the bare label. Prefix-match handles both.
      await page.getByRole('button', { name: new RegExp('^' + mode) }).first().click();
      await expect(
        page.locator('canvas').first().or(page.getByText(/没有可用的经纬度字段|请选择一个/).first()),
      ).toBeVisible({ timeout: 20000 });
    }
  });

  test('demo dataset generates a universe', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Crypto Market/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('body')).toBeVisible();
  });

  test('saves a universe and lists it in the library', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Crypto Market/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: '保存' }).click();

    if (isMobile(page)) {
      await page.getByRole('button', { name: '返回' }).click();
    } else {
      await page.getByRole('button', { name: /作品库|Library/ }).first().click();
    }

    await expect(page.getByRole('heading', { name: /作品库|Universe Library/ })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h3').first()).toBeVisible();
  });

  test('opens the export dialog with four formats', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Crypto Market/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: '导出作品' }).first().click();
    await expect(page.getByText('导出 PNG')).toBeVisible();
    await expect(page.getByText('导出 SVG')).toBeVisible();
    await expect(page.getByText('导出 HTML')).toBeVisible();
    await expect(page.getByText('导出 JSON')).toBeVisible();
  });
});

test.describe('error handling', () => {
  test('rejects an empty CSV with a visible error', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles(
      filePayload('empty.csv', 'text/csv', Buffer.from('   \n  \n', 'utf8')),
    );
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  });

  test('rejects malformed JSON with a visible error', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles(
      filePayload('broken.json', 'application/json', Buffer.from('{ not json', 'utf8')),
    );
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('mobile layout', () => {
  test('no horizontal overflow and author link reachable', async ({ page }) => {
    test.skip(!isMobile(page), 'mobile-only assertions');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /YOUR DATA/i })).toBeVisible();
    await expect(page.locator('header a[href="https://x.com/0xkillcoin"]').first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('workspace keeps the canvas usable and mode switcher on-screen', async ({ page }) => {
    test.skip(!isMobile(page), 'mobile-only assertions');
    await page.goto('/');
    await page.getByRole('button', { name: /Crypto Market/ }).first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

    const galaxyBtn = page.getByRole('button', { name: /^数据星系/ }).first();
    await galaxyBtn.click();
    await expect(page.locator('canvas').first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
