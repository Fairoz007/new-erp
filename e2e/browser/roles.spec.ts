// Signed in, once per role, on STAGING only. Every page in that role's sidebar is opened and checked
// (axe WCAG 2.1 AA, no horizontal scroll, no uncaught errors) at desktop and 375 px.
//
// Needs (environment only, never committed):
//   E2E_BASE_URL   the staging deploy of this app (https://…)
//   E2E_CONFIRM    the staging Supabase project ref; the run stops if the app talks to any other
//   E2E_USERS      JSON: {"Super Admin": {"email": "…", "password": "…"}, "Accountant": {…}, …}
// Without them every test here is skipped.
import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, expectNoHorizontalScroll, expectNoSeriousAxe, smallTouchTargets } from './checks';

const PRODUCTION_REF = 'fpeniljpqigpeqtsgizr';
const base = process.env.E2E_BASE_URL ?? '';
const confirm = process.env.E2E_CONFIRM ?? '';
let users: Record<string, { email: string; password: string }> = {};
try { users = JSON.parse(process.env.E2E_USERS ?? '{}'); } catch { users = {}; }

test.skip(!base || !confirm || !Object.keys(users).length, 'staging not configured (E2E_BASE_URL, E2E_CONFIRM, E2E_USERS)');
test.skip(confirm === PRODUCTION_REF || base.includes(PRODUCTION_REF), 'refusing the production project');

/** Stop at the first request to a Supabase project other than the confirmed staging one. */
function guardProject(page: Page) {
  page.on('request', req => {
    const m = /https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(req.url());
    if (m && (m[1] === PRODUCTION_REF || m[1] !== confirm)) throw new Error(`app talks to project ${m[1]}, not the confirmed staging project`);
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeAttached({ timeout: 30_000 });
}

async function openNav(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Open Menu' }).click();
  return page.getByRole('navigation', { name: 'Primary navigation' });
}

for (const [role, cred] of Object.entries(users)) {
  test(`${role}: every page passes axe and fits the screen`, async ({ page }, info) => {
    test.setTimeout(10 * 60_000);
    guardProject(page);
    const errors = collectPageErrors(page);
    const mobile = info.project.name === 'mobile-375';
    await signIn(page, cred.email, cred.password);

    const labels = await (await openNav(page, mobile)).getByRole('button').allInnerTexts();
    const pages = labels.map(l => l.split('\n')[0].trim()).filter(Boolean);
    if (mobile) await page.keyboard.press('Escape');
    expect(pages.length, 'pages in the sidebar').toBeGreaterThan(0);

    const problems: string[] = [];
    for (const name of pages) {
      const nav = await openNav(page, mobile);
      await nav.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main h1').first()).toBeVisible();
      try { await expectNoSeriousAxe(page, info, `${role}-${name}`); } catch (e) { problems.push((e as Error).message.split('\n')[0] + ` (${name})`); }
      try { await expectNoHorizontalScroll(page, name); } catch (e) { problems.push(`horizontal scroll on ${name}`); }
      if (mobile) { const small = await smallTouchTargets(page); if (small.length) problems.push(`${name}: small touch targets ${small.slice(0, 5).join('; ')}`); }
    }
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
}
