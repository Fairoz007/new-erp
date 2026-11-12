// Queries timed by scripts/staging-volume-seed.mjs --pglite. Each `run(q)` issues what the
// browser asks PostgREST for (same filters, order and page sizes), as the Super Admin, and
// returns { requests, rows, maxRowsPerRequest }.
//
// "before" = the Phase 0 path: every collection loaded at sign-in in pages of 400 rows.
// "after"  = the Phase 1 path: one page of a server-side list, or one aggregate RPC.

// Page through an ordered query 400 rows at a time, exactly like fetchPaged() did.
const pageAll = async (q, sql) => {
  let requests = 0, rows = 0, max = 0;
  for (let off = 0; ; off += 400) {
    const r = await q(`${sql} limit 400 offset ${off}`);
    requests++; rows += r.rows.length; max = Math.max(max, r.rows.length);
    if (r.rows.length < 400) break;
  }
  return { requests, rows, maxRowsPerRequest: max };
};
const once = async (q, sql) => { const r = await q(sql); return { requests: 1, rows: r.rows.length, maxRowsPerRequest: r.rows.length }; };

const JE_WITH_LINES = `select e.*, (select json_agg(l) from journal_lines l where l.entry_id = e.id) lines
  from journal_entries e order by e.date desc, e.entry_number desc`;

export default [
  // ---------------- before (Phase 0)
  { name: 'before: journal entries with lines, all pages (dashboard, ledger pages)', repeat: 1, run: q => pageAll(q, JE_WITH_LINES) },
  { name: 'before: invoices with lines, all pages (invoices page, dashboard)', repeat: 1,
    run: q => pageAll(q, `select i.*, (select json_agg(l) from invoice_lines l where l.invoice_id = i.id) lines from invoices i order by created_at desc`) },
  { name: 'before: payments, all pages', repeat: 1, run: q => pageAll(q, `select * from payments order by payment_date desc`) },
  { name: 'before: audit logs, newest 1000 (cap)', run: q => once(q, `select * from audit_logs order by occurred_at desc limit 1000`) },
  { name: 'before: notifications, newest 500 (cap)', run: q => once(q, `select n.*, (select json_agg(r) from notification_reads r where r.notification_id = n.id) reads from notifications n order by created_at desc limit 500`) },
  { name: 'before: account balances (v_account_balances)', run: q => once(q, `select * from v_account_balances order by company_id, code`) },
];
