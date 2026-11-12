// Screens that render without signing in. Runs locally (placeholder database) and on staging.
import { expect, test } from '@playwright/test';
import { collectPageErrors, expectNoHorizontalScroll, expectNoSeriousAxe, smallTouchTargets } from './checks';

test('sign-in page: WCAG 2.1 AA (axe), layout and keyboard', async ({ page }, info) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  const email = page.getByLabel(/email/i);
  await expect(email).toBeVisible();
  await expectNoSeriousAxe(page, info, 'sign-in');
  await expectNoHorizontalScroll(page, 'sign-in');
  // keyboard: Tab reaches the email field, the password field and the sign-in button
  await page.keyboard.press('Tab');
  const reached: string[] = [];
  for (let i = 0; i < 8; i++) {
    reached.push(await page.evaluate(() => (document.activeElement?.getAttribute('type') || document.activeElement?.tagName || '').toLowerCase()));
    await page.keyboard.press('Tab');
  }
  expect(reached).toEqual(expect.arrayContaining(['email', 'password']));
  if (info.project.name === 'mobile-375') expect(await smallTouchTargets(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('sign-in page respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel(/email/i)).toBeVisible();
  const animated = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('*')]
    .filter(el => { const s = getComputedStyle(el); return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01 && s.animationIterationCount === 'infinite'); })
    .map(el => el.className.toString().slice(0, 60)));
  expect(animated).toEqual([]);
});
