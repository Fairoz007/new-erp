// A manual journal line on a bank ledger account carries the bank account to the database, so the
// bank account's balance (journal lines with bank_account_id) moves with the ledger.
import { describe, expect, it, vi } from 'vitest';

const rpcAny = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ status: 'Pending', id: 'r1', request_number: 'JR-2026-0001' }));
vi.mock('../core', async (orig) => ({ ...(await orig<typeof import('../core')>()), rpcAny }));

const { addJournalEntry } = await import('../accounting');

describe('addJournalEntry', () => {
  it('sends the bank account of a bank line and null for other lines', async () => {
    await addJournalEntry({
      companyId: '11111111-1111-1111-1111-111111111111', date: '2026-11-12', description: 'Bank charges', reference: '', status: 'Posted', sourceModule: 'Manual',
      totalDebit: 1.5, totalCredit: 1.5, postedBy: '',
      lines: [
        { id: 'a', accountCode: '5090', accountName: 'Bank charges', debit: 1.5, credit: 0 },
        { id: 'b', accountCode: '1020', accountName: 'Bank', debit: 0, credit: 1.5, bankAccountId: 'bank-1' },
      ],
    } as never);
    const lines = (rpcAny.mock.calls[0][1] as { p_lines: { account_code: string; bank_account_id: string | null }[] }).p_lines;
    expect(lines.map(l => [l.account_code, l.bank_account_id])).toEqual([['5090', null], ['1020', 'bank-1']]);
  });
});
