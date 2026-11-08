import { expect, test } from '@playwright/test';
import path from 'node:path';

/**
 * Format coverage against the local production build.
 *
 * XLSX and JSON cannot be generated inside the browser, so these fixtures are
 * committed files (see `fixtures/`) and uploaded through the real file input.
 */

const fixture = (name: string) => path.resolve('fixtures', name);

test.describe('file formats', () => {
  test('imports a real XLSX workbook with Chinese headers', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles(fixture('cities.xlsx'));

    await expect(page.getByText('cities.xlsx')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('数据理解')).toBeVisible();

    // The Chinese header names must survive SheetJS parsing.
    await expect(page.getByText('城市').first()).toBeVisible();
    await expect(page.getByText('人口').first()).toBeVisible();

    // Latitude/longitude must be detected, which makes Map mode recommended.
    await expect(page.getByText('地理宇宙').first()).toBeVisible();
  });

  test('imports a JSON array of objects', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles(fixture('projects.json'));

    await expect(page.getByText('projects.json')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('数据理解')).toBeVisible();
    await expect(page.getByText('repo').first()).toBeVisible();
  });

  test('TSV with tab separators parses into columns', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'data.tsv',
      mimeType: 'text/tab-separated-values',
      buffer: Buffer.from('name\tvalue\tgroup\nA\t1\tx\nB\t2\ty\nC\t3\tx\n', 'utf8'),
    });

    await expect(page.getByText('data.tsv')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('数据理解')).toBeVisible();
    // 3 fields detected, not 1 — proves the tab delimiter was found.
    await expect(page.getByText('3 字段').first()).toBeVisible();
  });

  test('nested JSON is flattened to dotted field paths', async ({ page }) => {
    await page.goto('/');
    const nested = [
      { user: { name: 'Ada', age: 36 }, score: 90 },
      { user: { name: 'Alan', age: 41 }, score: 85 },
    ];
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'nested.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(nested), 'utf8'),
    });

    await expect(page.getByText('数据理解')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('user.name').first()).toBeVisible();
  });
});
