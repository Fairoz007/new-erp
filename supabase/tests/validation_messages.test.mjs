// The browser's validation messages (src/lib/validation.ts RULES) are the database's own.
// 1. Every RULES message appears in the CURRENT definition of a database function (pg_proc), so a
//    later migration that rewords a rule fails here.
// 2. The main rules are triggered for real and the raised message is compared with RULES.
// Standalone: node supabase/tests/validation_messages.test.mjs supabase/migrations
import { readFileSync } from 'node:fs';
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, HO } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const BANK = '44444444-4444-4444-4444-444444444444';

// read RULES from the TypeScript source (string literals and the template's fixed prefix)
const src = readFileSync(new URL('../../src/lib/validation.ts', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('export const RULES'), src.indexOf('} as const'));
const RULES = {};
for (const m of block.matchAll(/^\s*(\w+):\s*(?:'([^']+)'|\([^)]*\)\s*=>\s*`([^`$]+)\$\{)/gm)) RULES[m[1]] = (m[2] ?? m[3]).trim();
const bodies = (await asServer(`select string_agg(prosrc, E'\\n') s from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows[0].s;

await check('RULES has the expected entries', () => { assert(Object.keys(RULES).length >= 12, JSON.stringify(RULES)); return Object.keys(RULES).length + ' rules'; });
await check('every RULES message is raised by a current database function', () => {
  const missing = Object.entries(RULES).filter(([, msg]) => !bodies.includes(msg)).map(([k]) => k);
  assert(!missing.length, 'not in any function: ' + missing.join(', ')); return 'all present';
});

const raised = async (sql) => { try { await tx(ADMIN, sql); } catch (e) { return e.message; } throw new Error('no error raised'); };
const same = (msg, rule) => { assert(msg.startsWith(RULES[rule]), `db: "${msg}" vs browser: "${RULES[rule]}"`); return msg; };

const inv = '66666666-6666-6666-6666-000000000201';
await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
    values ('${inv}','${HO}','VAL-1','Purchase','Supplier','${SUP}', current_date, current_date + 30, 'VAL-R1')`);
await check('posting an invoice with no lines: invoiceTotalPositive', async () => same(await raised(`select post_invoice('${inv}')`), 'invoiceTotalPositive'));
const inv0 = '66666666-6666-6666-6666-000000000202';
await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
    values ('${inv0}','${HO}','VAL-0','Purchase','Supplier','${SUP}', current_date, current_date + 30, 'VAL-R0');
  insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
    values ('${inv0}', 1, 'Free', 1, 0, 0, '5000')`);
await check('posting an invoice whose total is zero: invoiceTotalPositive', async () => same(await raised(`select post_invoice('${inv0}')`), 'invoiceTotalPositive'));
await tx(ADMIN, `insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
  values ('${inv}', 1, 'Parts', 1, 100, 0, '5000'); select post_invoice('${inv}')`);
await check('payment without a date: paymentDateRequired', async () => same(await raised(`select record_payment('${inv}', 10, null, 'Cash', '${BANK}')`), 'paymentDateRequired'));
await check('payment without a method: paymentMethodRequired', async () => same(await raised(`select record_payment('${inv}', 10, current_date, ' ', '${BANK}')`), 'paymentMethodRequired'));
await check('payment above outstanding: paymentAmountRange', async () => same(await raised(`select record_payment('${inv}', 1000, current_date, 'Cash', '${BANK}')`), 'paymentAmountRange'));
const lines = (a, b) => `'[{"account_code":"1010","debit":${a},"credit":0},{"account_code":"2010","debit":0,"credit":${b}}]'::jsonb`;
await check('journal without description: journalDescriptionRequired', async () => same(await raised(`select post_journal_entry('${HO}', current_date, ' ', ${lines(5, 5)})`), 'journalDescriptionRequired'));
await check('journal without a date: journalDateRequired', async () => same(await raised(`select post_journal_entry('${HO}', null, 'x', ${lines(5, 5)})`), 'journalDateRequired'));
await check('journal with one line: journalTwoLines', async () => same(await raised(`select post_journal_entry('${HO}', current_date, 'x', '[{"account_code":"1010","debit":5,"credit":0}]'::jsonb)`), 'journalTwoLines'));
await check('journal line with a negative amount: journalLineSide', async () => same(await raised(`select post_journal_entry('${HO}', current_date, 'x', ${lines(-5, 5)})`), 'journalLineSide'));
await check('credit note without a reason: creditReasonRequired', async () => same(await raised(`select create_credit_note('${inv}', ' ', 10)`), 'creditReasonRequired'));

await check('post_invoice no longer says "no lines" for a zero total', () => { assert(!bodies.includes('Invoice has no lines'), 'old wording still present'); return 'ok'; });

t.report();
