#!/usr/bin/env node
// Fails (exit 1) if a tracked file or the built bundle contains something that looks like a secret:
// a Supabase service-role key, a private key, cloud provider keys, or a database URL with a password.
// The anon/publishable key is public by design and is allowed.
// Usage: node scripts/secret-scan.mjs [--dist]   (--dist also scans dist/ after a build)
import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const PATTERNS = [
  ['private key', /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Stripe live key', /\b(sk|rk)_live_[0-9a-zA-Z]{16,}/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{30,}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Supabase secret key', /\bsb_secret_[0-9A-Za-z_-]{20,}/],
  ['Postgres URL with password', /postgres(ql)?:\/\/[^:\s/]+:[^@\s/]{6,}@[^\s'"]+/],
];
// JWTs: allowed only when their role is anon (public client key)
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const ALLOW_FILES = [/^package-lock\.json$/, /^scripts\/secret-scan\.mjs$/];

const files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(f => !ALLOW_FILES.some(r => r.test(f)) && existsSync(f) && statSync(f).size < 5_000_000);
if (process.argv.includes('--dist') && existsSync('dist')) {
  const walk = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
  files.push(...walk('dist'));
}
const hits = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue;                   // binary
  for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${f}: ${name}`);
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString());
      if (payload.role && payload.role !== 'anon') hits.push(`${f}: JWT with role "${payload.role}"`);
    } catch { /* not a JWT */ }
  }
}
if (hits.length) { console.error('Possible secrets found:\n  ' + hits.join('\n  ')); process.exit(1); }
console.log(`Secret scan: ${files.length} files, nothing found.`);
