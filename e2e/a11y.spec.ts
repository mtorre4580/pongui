import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectScene } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// The game itself is a canvas: axe covers the HTML shell (language, landmarks, touch controls,
// orientation notice). Keyboard play is covered by smoke.spec.ts.
const views = [
  { name: 'game menu', path: './play/', scene: 'Menu' },
  { name: 'level', path: './play/?level=1', scene: 'Game' },
];

for (const view of views) {
  test(`${view.name} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(view.path);
    await expectScene(page, view.scene);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  });
}
