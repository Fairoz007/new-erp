// Shared page checks: axe (WCAG 2.1 AA; serious and critical fail), no horizontal scroll, touch
// targets of at least 44 px on phones, no uncaught errors.
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function expectNoSeriousAxe(page: Page, info: TestInfo, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const body = JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), null, 2);
  writeFileSync(info.outputPath(`axe-${label}.json`), body);
  await info.attach(`axe-${label}.json`, { body, contentType: 'application/json' });
  expect(bad.map(v => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`), `axe on ${label}`).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `horizontal scroll on ${label}`).toBeLessThanOrEqual(1);
}

/** Visible buttons, links and form controls smaller than 44x44 px (phones only). */
export async function smallTouchTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]), select, textarea, [role=button]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
      // inline links inside running text are exempt (WCAG 2.5.5 "inline" exception)
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const label = el.closest('label'); if (label && label.getBoundingClientRect().height >= 44) return;
      }
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).name || '').trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}
