// Browser suite (Phase 9): Playwright at desktop and 375 px, with axe.
// * Without E2E_BASE_URL it builds the app against an unreachable placeholder database and checks
//   the screens that render without signing in (sign-in page): axe, layout at 375 px, touch targets.
// * With E2E_BASE_URL (a STAGING deploy) and E2E_USERS it also signs in once per role and checks
//   every page that role can open. It refuses the production project. See e2e/README.md.
import { defineConfig, devices } from '@playwright/test';

const remote = process.env.E2E_BASE_URL;
const PORT = 4300;

export default defineConfig({
  testDir: 'e2e/browser',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: remote || `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-375', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: remote ? undefined : {
    // placeholder URL and key: nothing is reachable, so only the signed-out screens render
    command: `npx vite build --outDir .e2e-dist --logLevel error && npx vite preview --outDir .e2e-dist --port ${PORT} --strictPort`,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'e2e-placeholder-key' },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
