import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} reader baseline`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`file://${process.cwd()}/test/visual/reference.html?mode=${mode}`);
    await page.evaluate((value) => document.body.className = `vscode-${value}`, mode);
    const reference = PNG.sync.read(await page.screenshot({ fullPage: true }));
    await page.goto(`file://${process.cwd()}/test/visual/candidate.html?mode=${mode}`);
    await page.evaluate((value) => document.body.className = `vscode-${value}`, mode);
    const candidate = PNG.sync.read(await page.screenshot({ fullPage: true }));
    expect(reference.width).toBe(candidate.width);
    expect(reference.height).toBe(candidate.height);
    expect(pixelmatch(reference.data, candidate.data, undefined, reference.width, reference.height, { threshold: 0.1 }) / (reference.width * reference.height)).toBeLessThanOrEqual(0.01);
  });
}
