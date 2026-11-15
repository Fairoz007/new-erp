// Lists controls that do nothing (docs/UI_INSPECTION_PROMPT.md step 1), as `file:line reason`.
// TypeScript AST over src/**/*.tsx (tests excluded). Exit code 1 when anything is found, so it can
// gate a check. A line can be marked deliberate with a `// controls-ok: <reason>` comment on it or
// on the line above.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = 'src';
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (!p.includes('__tests__')) walk(p); } else if (p.endsWith('.tsx')) files.push(p);
  }
})(ROOT);

// routes the app defines (path="…" or path: '…')
const routes = new Set();
for (const f of files.concat(fs.existsSync('src/App.tsx') ? [] : [])) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/path[=:]\s*["'`](\/[^"'`]*)["'`]/g)) routes.add(m[1].replace(/\/:[^/]+/g, '/:param'));
}
const routeOk = to => {
  if (!to.startsWith('/') || routes.size === 0) return true;
  const clean = to.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (routes.has(clean)) return true;
  // match dynamic segments
  const parts = clean.split('/');
  return [...routes].some(r => { const rp = r.split('/'); return rp.length === parts.length && rp.every((x, i) => x === ':param' || x === parts[i] || x === '*'); }) || [...routes].some(r => r.endsWith('/*') && clean.startsWith(r.slice(0, -2)));
};

// page ids the app renders (the `case '…':` ids in src/App.tsx; pages open by URL hash)
const pages = new Set([...fs.readFileSync('src/App.tsx', 'utf8').matchAll(/case '([a-z0-9-]+)':/g)].map(m => m[1]));

const out = [];
const TEXT = /coming soon|not implemented|\bTODO\b|lorem ipsum/i;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const src = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const at = n => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  const ok = line => /controls-ok:/.test(lines[line - 1] ?? '') || /controls-ok:/.test(lines[line - 2] ?? '');
  const report = (n, reason) => { const l = typeof n === 'number' ? n : at(n); if (!ok(l)) out.push(`${f}:${l} ${reason}`); };
  const attr = (el, name) => el.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(src) === name);
  const hasSpread = el => el.attributes.properties.some(a => ts.isJsxSpreadAttribute(a));
  const deadBody = fn => {
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return false;
    const b = fn.body;
    if (!ts.isBlock(b)) {
      const t = b.getText(src);
      return /^(console\.\w+|alert|window\.alert)\(/.test(t) || t === 'undefined' || t === 'null' || t === '{}';
    }
    const stmts = b.statements.map(s => s.getText(src).trim());
    return stmts.length === 0 || stmts.every(s => /^(console\.\w+|alert|window\.alert)\(|^\w+\.preventDefault\(\);?$/.test(s));
  };

  const visit = n => {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const tag = n.tagName.getText(src);
      if (tag === 'Button' || tag === 'button') {
        const type = attr(n, 'type');
        const submit = type && /submit/.test(type.getText(src));
        if (!submit && !hasSpread(n) && !attr(n, 'onClick') && !attr(n, 'onMouseDown') && !attr(n, 'form')) report(n, `<${tag}> with no action`);
      }
      for (const name of ['onClick', 'onSubmit', 'onChange', 'onSelect']) {
        const a = attr(n, name);
        const e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
        if (e && deadBody(e)) report(a, `${name} does nothing (${e.getText(src).slice(0, 50)})`);
      }
      for (const name of ['href', 'to']) {
        const a = attr(n, name);
        const v = a?.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : undefined;
        if (v !== undefined && (v === '' || v === '#')) report(a, `${name}="${v}"`);
        else if (v && name === 'to' && !routeOk(v)) report(a, `to="${v}" is not a route`);
      }
      const dis = attr(n, 'disabled');
      if ((tag === 'Button' || tag === 'button') && dis && (!dis.initializer || /^\{\s*true\s*\}$/.test(dis.initializer.getText(src))) && !attr(n, 'title') && !hasSpread(n)) report(dis, `<${tag}> always disabled, no title`);
    }
    if (ts.isJsxText(n) && TEXT.test(n.getText(src))) report(n, `text "${n.getText(src).trim().slice(0, 40)}"`);
    if (ts.isCallExpression(n) && /^(window\.)?alert$/.test(n.expression.getText(src))) report(n, 'alert()');
    ts.forEachChild(n, visit);
  };
  visit(src);

  // navigation to a page id the app does not render
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/(?:setCurrentPage|navigate)\(\s*'([a-z0-9-]+)'|\bpage:\s*'([a-z0-9-]+)'|href="#([a-z][a-z0-9-]*)"/g)) {
      const id = m[1] || m[2] || m[3];
      if (pages.size && !pages.has(id) && id !== 'main-content') report(i + 1, `page "${id}" has no case in src/App.tsx`);
    }
  });

  // <Tabs> whose tab id is never used outside its definition (no panel or case for it)
  if (/<Tabs\b/.test(text)) {
    lines.forEach((l, i) => {
      if (!/<Tabs\b|tabs=|TABS|VIEWS|Tab(Item)?\[\]/.test(lines.slice(Math.max(0, i - 6), i + 1).join('\n'))) return;
      for (const m of l.matchAll(/\bid:\s*'([a-z0-9_-]+)'/g)) {
        const uses = text.split(`'${m[1]}'`).length - 1;
        if (uses < 2) report(i + 1, `tab "${m[1]}" has no matching panel or case`);
      }
    });
  }
}
console.log(out.length ? out.join('\n') : 'Dead controls: none');
if (out.length) console.log(`\n${out.length} found`);
process.exit(out.length ? 1 : 0);
