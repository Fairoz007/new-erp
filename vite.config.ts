import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readdirSync } from 'fs';

/**
 * Content-Security-Policy for production builds, as a <meta> tag (the app is static files, so
 * this works on any host). Only this origin may run scripts; network calls may go only to the
 * configured Supabase project. Not added in dev: Vite's dev server injects inline scripts.
 * frame-ancestors cannot be set from a meta tag; see docs/OPERATIONS.md for the host headers.
 */
function cspPlugin(supabaseUrl: string | undefined): Plugin {
  let origin = 'https://*.supabase.co';
  try { if (supabaseUrl) origin = new URL(supabaseUrl).origin; } catch { /* keep the wildcard */ }
  const ws = origin.replace(/^http/, 'ws');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",   // React style props and Google Fonts CSS
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} ${ws}`,
    `frame-src 'self' blob: ${origin}`,                                 // document viewer (signed storage URLs, PDFs)
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'erp-csp',
    apply: 'build',
    transformIndexHtml: html => html.replace('<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  // The newest migration in this build, shown by Settings → System health next to the newest one
  // applied to the database (a deploy whose migrations were not pushed shows the difference).
  const migrations = readdirSync(path.resolve(__dirname, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
  const latestMigration = (migrations[migrations.length - 1] ?? '').split('_')[0];
  return {
    define: { __LATEST_MIGRATION__: JSON.stringify(latestMigration), __MIGRATION_COUNT__: migrations.length },
    plugins: [react(), cspPlugin(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)],
    // Expose NEXT_PUBLIC_* vars (Supabase dashboard naming) alongside Vite's default VITE_*
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // No manualChunks: grouping every node_modules package into a few vendor chunks made the
      // entry chunk import (and preload) the PDF and chart libraries on every visit. Rollup's own
      // splitting keeps them in the lazy chunks that use them. Budget: scripts/bundle-report.mjs.
      chunkSizeWarningLimit: 600,
    },
  };
});
