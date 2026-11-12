import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests (Vitest): shared helpers and the ledger parity tests. `npm run test:unit`.
// The database tests stay in supabase/tests (PGlite, `npm run test:db`).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
