import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Captures the real product screenshots used in the README.
 * Screenshots are generated from the running build, never mocked.
 */
const OUT = path.resolve('docs/screenshots');

test('capture product screenshots', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });

  const shot = async (name: string, opts?: { fullPage?: boolean }) => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, name), fullPage: opts?.fullPage ?? false });
  };

  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Landing page
  await page.goto('/');
  await page.waitForTimeout(2000);
  await shot('01-home.png');

  // 2. Understand step (upload a CSV via the demo path instead: crypto demo)
  await page.getByRole('button', { name: /Crypto Market/ }).first().click();
  await page.waitForTimeout(3500);
  await shot('02-galaxy.png');

  // 3. Detail panel — click canvas centre
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    // Poke a few points to increase the chance of hitting a star.
    for (const [dx, dy] of [
      [0.5, 0.5],
      [0.42, 0.46],
      [0.58, 0.54],
      [0.5, 0.38],
    ] as Array<[number, number]>) {
      await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy);
      if (await page.getByText('数据详情').isVisible().catch(() => false)) break;
    }
  }
  await shot('03-detail.png');

  // 4. Other modes
  const modes: Array<[string, string]> = [
    ['关系网络', '04-network.png'],
    ['时间宇宙', '05-timeline.png'],
    ['数据矩阵', '06-matrix.png'],
    ['分布宇宙', '07-distribution.png'],
  ];
  for (const [label, file] of modes) {
    await page.getByRole('button', { name: new RegExp('^' + label) }).first().click();
    await page.waitForTimeout(1800);
    await shot(file);
  }

  // 5. Map mode using the demo that has geo data: go to the examples lab.
  await page.goto('/');
  await page.getByRole('button', { name: /查看全部|All \d+ datasets/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /City Population/ }).first().click();
  await page.waitForTimeout(4500);
  await shot('08-map.png');

  // 6. Export dialog
  await page.getByRole('button', { name: '导出作品' }).first().click();
  await shot('09-export.png');
  await page.keyboard.press('Escape');

  // 7. Library — save a couple of universes first so the list has real content.
  await page.goto('/');
  for (const demo of [/Crypto Market/, /City Population/, /Website Analytics/]) {
    await page.getByRole('button', { name: /查看全部|All \d+ datasets/ }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: demo }).first().click();
    await page.waitForTimeout(2600);
    await page.getByRole('button', { name: '保存' }).first().click().catch(() => {});
    await page.waitForTimeout(900);
    await page.goto('/');
  }
  await page.getByRole('button', { name: /作品库|Library/ }).first().click();
  await page.waitForTimeout(1500);
  // Assert the library actually contains saved universes before shooting it.
  const cardCount = await page.locator('h3').count();
  if (cardCount === 0) throw new Error('Library screenshot would be empty: no universes were persisted');
  await shot('10-library.png');

  // 8. Light theme landing
  await page.goto('/');
  await page.getByRole('button', { name: /深色|Dark/ }).first().click();
  await page.waitForTimeout(1500);
  await shot('11-home-light.png');

  // 9. Mobile (reset to the default dark theme first)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('du.theme', 'dark');
    } catch {
      /* ignore */
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(2000);
  await shot('12-mobile-home.png');

  await page.getByRole('button', { name: /Crypto Market/ }).first().click();
  await page.waitForTimeout(3500);
  await shot('13-mobile-galaxy.png');
});
