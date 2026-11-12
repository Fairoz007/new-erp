// Bundle size report for the production build (run `npm run build` first).
//   node scripts/bundle-report.mjs            human-readable table
//   node scripts/bundle-report.mjs --json     machine-readable (used by CI to enforce the budget)
//   node scripts/bundle-report.mjs --budget 250   exit 1 when the initial JS exceeds 250 kB gzip
//
// "Initial JS" is everything the browser must download before the first screen can render:
// the entry <script> plus every <link rel="modulepreload"> that Vite injected into dist/index.html.
// Lazy chunks (pages, PDF, charts, the wizard) are listed separately.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = new Set([
  ...[...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map(m => m[1]),
  ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g)].map(m => m[1]),
]);
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+\.css)"/g)].map(m => m[1]);

const files = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js') || f.endsWith('.css'));
const rows = files.map(f => {
  const buf = readFileSync(join(dist, 'assets', f));
  return { file: `assets/${f}`, raw: statSync(join(dist, 'assets', f)).size, gzip: gzipSync(buf, { level: 9 }).length };
}).sort((a, b) => b.gzip - a.gzip);

const kb = n => (n / 1024).toFixed(1);
const initialRows = rows.filter(r => initial.has(r.file));
const initialGzip = initialRows.reduce((s, r) => s + r.gzip, 0);
const cssGzip = rows.filter(r => css.includes(r.file)).reduce((s, r) => s + r.gzip, 0);
const lazyRows = rows.filter(r => !initial.has(r.file) && r.file.endsWith('.js'));
const result = {
  initialJsGzipKb: Number(kb(initialGzip)),
  initialCssGzipKb: Number(kb(cssGzip)),
  initialChunks: initialRows.map(r => ({ file: r.file, gzipKb: Number(kb(r.gzip)) })),
  largestLazyChunks: lazyRows.slice(0, 10).map(r => ({ file: r.file, gzipKb: Number(kb(r.gzip)) })),
  totalJsGzipKb: Number(kb(rows.filter(r => r.file.endsWith('.js')).reduce((s, r) => s + r.gzip, 0))),
};

const args = process.argv.slice(2);
if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Initial JS (entry + modulepreload): ${result.initialJsGzipKb} kB gzip`);
  for (const r of result.initialChunks) console.log(`  ${r.gzipKb.toString().padStart(7)} kB  ${r.file}`);
  console.log(`Initial CSS: ${result.initialCssGzipKb} kB gzip`);
  console.log('Largest lazy chunks:');
  for (const r of result.largestLazyChunks) console.log(`  ${r.gzipKb.toString().padStart(7)} kB  ${r.file}`);
  console.log(`All JS: ${result.totalJsGzipKb} kB gzip`);
}
const b = args.indexOf('--budget');
if (b >= 0) {
  const budget = Number(args[b + 1]);
  if (result.initialJsGzipKb > budget) { console.error(`Initial JS ${result.initialJsGzipKb} kB exceeds the ${budget} kB budget`); process.exit(1); }
}
