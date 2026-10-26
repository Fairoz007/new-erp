# Agent B: Accounts payable / receivable

Scope: B1 Suppliers, B2 Customers, B3 Invoices (credit notes, duplicate), B4 Payments, B5 Reconciliation.

Files changed or added (all owned by B):
- `supabase/migrations/20261026000200_finance.sql` (new)
- `supabase/tests/20261026000200_finance.test.mjs` (new, 80 checks, run by `npm run test:db`)
- `src/services/finance.ts` (new)
- `src/pages/suppliers/SuppliersPage.tsx`, `src/pages/suppliers/PartyEditModal.tsx` (new, shared with customers)
- `src/pages/customers/CustomersPage.tsx`, `src/pages/invoices/InvoicesPage.tsx`, `src/pages/payments/PaymentsPage.tsx`, `src/pages/reconciliation/ReconciliationPage.tsx`
- `src/components/common/PrintableInvoiceModal.tsx`

Verification: `npm run test:db` passes all 8 suites (finance 80/80). `npx tsc --noEmit` reports no errors in B files except the 2 expected ones in PrintableInvoiceModal, which go away once the coordinator wires the new context functions (see "Coordinator integration notes"). Not run: dev server or browser (not allowed in this pass). No remote writes.

---

## Posting model (approval → GL)

| Step | What happens | Where |
|---|---|---|
| Create | `create_invoice(header, lines, submit)` inserts the header and lines in one transaction. The invoice number comes from E's trigger. `party_snapshot` is built on the server from the supplier/customer row. Totals come from the line triggers, and client totals are ignored. | finance.sql |
| Submit (default on create) | If the caller passes `can_approve('invoice', grand_total)`, `post_invoice` runs: the invoice becomes Approved and a journal entry is posted (AP/AR vs expense/revenue + VAT). Otherwise the invoice becomes `Pending Approval` and an `approval_requests` row (reference_type `Invoice`, required_roles from the matching `approval_rules`) is created. | `fin_submit_invoice` |
| Approve/Reject | `decide_approval` (unchanged) updates the request. The new trigger `fin_invoice_approval_bridge` (AFTER UPDATE OF status on approval_requests) handles the invoice side. **Approved** calls `post_invoice` as the approver, which re-checks `can_approve`; if posting fails, the whole approval rolls back. **Rejected** sets the invoice to Rejected. This closes the gap D reported. Nothing in later slots redefines `decide_approval` (checked with grep). | finance.sql |
| Rework | A Rejected or Draft invoice can be edited (`replace_invoice_lines`) and submitted again (`submit_invoice`). It can also be cancelled (client update to `approval_status='Cancelled'` is allowed only while unposted). | |
| Pay | `record_payment` (existing). New guard: a GL-posted payment needs an Approved, posted invoice. Before this, paying a draft drove AP/AR negative. | `fin_payments_guard` |
| Credit note | `create_credit_note(invoice, reason, amount?)`. It works only on posted invoices, requires invoice approval authority for the credit amount, and is posted immediately. The amount is capped at the outstanding amount (row lock plus the parent's CHECK constraint), so double crediting is impossible. Full credit copies the lines. Partial credit uses pro-rata lines with the same VAT rate plus a zero-VAT rounding line, so the credit equals the requested amount exactly. | finance.sql |

UI mapping: the quick-action "Create Invoice" corresponds to submit=true (it previously hard-coded `approvalStatus: 'Approved'`). PrintableInvoiceModal shows "Approve & Post" or "Submit for Approval" for Draft/Rejected invoices, and for system-raised Pending invoices that have no request. It also shows "Cancel Invoice" for unposted drafts and a Credit Note dialog (reason + amount). The Approvals page (D) needs no change.

### Agent A's maintenance → invoice trigger (reviewed against this model)
It is compatible: its own `next_doc_number('PINV-YYYY')` uses the same sequence key as E's trigger, it has lines with `gl_account_code '5000'`, and it uses `Pending Approval`. `submit_invoice` accepts a `Pending Approval` invoice that has no open request: it posts the invoice when the user can approve it, or raises the request otherwise (tested). Requested changes to A (not blocking):
1. Set `party_snapshot` (supplier name/vat/address/email/phone). Without it, the printed invoice falls back to the live supplier row.
2. Either insert the `approval_requests` row in the same trigger, or document that finance users must press "Submit for Approval" on those invoices. As written, they sit in Pending with no approver notified.
3. Optional: pass `invoice_number` null and let E's trigger number it.

---

## B1 Suppliers: route `suppliers`

Components: SuppliersPage, PartyEditModal, QuickActionModals `add-supplier` (coordinator).

| Control | Expected | Backend op | Tables | Auth | Status |
|---|---|---|---|---|---|
| Add Supplier | Create the supplier; the code is assigned by the DB | `addSupplier` → insert (supplier_code null → `SUP-###`) | suppliers | RLS suppliers:create; button hidden without `create` | Fixed (service); the modal is the coordinator's |
| Edit (new) | Edit master data; balances are read-only | `updateSupplier` → update | suppliers | RLS suppliers:edit; column hidden without `edit` | New |
| Deactivate/Activate (new) | Set status Inactive/Active instead of deleting | `updateSupplier({status})` | suppliers | suppliers:edit | New |
| KPIs / balance columns | Values from the DB | `v_party_summary` (posted invoices only) | view | RLS on invoices (security_invoker) | Fixed |
| Search / export | Client side | n/a | n/a | n/a | OK |

Issues: P2 balances were computed in JS and included unposted invoices. They now come from `v_party_summary`, which agrees with the AP/AR control accounts (tested). P2 there was no edit and no deactivate. P3 "Active Suppliers" counted every supplier, and "YTD" was not year-to-date; both relabelled. Note: create_invoice rejects Inactive/Blocked parties.

## B2 Customers: route `customers`
The same work as B1: `addCustomer`/`updateCustomer`, the edit modal, activate/deactivate, and DB balances. "Total Logistics Revenue" (it was all billings) is renamed "Total Posted Billings".

## B3 Invoices: route `invoices`, plus PrintableInvoiceModal

| Control | Expected | Backend op | Auth | Status |
|---|---|---|---|---|
| Create Invoice | Atomic header+lines, then submit | `addInvoice` → `create_invoice` | invoices:create (+ can_approve to post) | Fixed |
| "Upload Bill" button | Opened the same create modal (duplicate, misleading) | n/a | n/a | Removed |
| View Bill / Bill column | Opens the stored file only | `openBillModal(storage://documents/<path>)` → F's viewer signs the URL | storage RLS | Fixed (P1 fake unsplash "scan" for every purchase invoice removed) |
| Print | `window.print()` | n/a | n/a | OK |
| Duplicate | Copy as a Draft, then open it | `duplicate_invoice` | invoices:create | Fixed (P2: was copied as Draft but numbered `SINV`; not shown) |
| Credit Note | Reason + amount ≤ outstanding, posted | `create_credit_note` | invoices:create + can_approve(amount) | Fixed (P1: full negative copy, no limit, duplicable, hard-coded reason, never reduced the parent) |
| Approve & Post / Submit (new) | Post or raise approval | `submit_invoice` | invoices:create/edit | New |
| Cancel Invoice (new) | Cancel an unposted draft/rejected invoice | `updateInvoice({approvalStatus:'Cancelled'})` | invoices:edit, DB guard | New |
| Filters (type/payment/approval/attachment) | Client side | n/a | n/a | Added an approval filter and a Cancelled option |

DB guards added (P0/P1 integrity holes in the base RLS, where `invoices:edit` allowed direct writes):
- `fin_invoices_guard`: clients cannot change totals, amount_paid, credited, journal, approval fields, number, type, company or other_charges. Self-approval and marking an invoice Paid are blocked. A client insert is forced to Draft with zero totals. Credit notes can be created only through the RPC. Posted and submitted invoices keep party, date and currency frozen. Only unposted draft, rejected or cancelled invoices can be deleted.
- `fin_invoice_lines_guard`: lines can be changed only on Draft/Rejected invoices.
- A unique index plus an RPC check stop the same supplier bill reference being recorded twice per office (the double-submit guard).
- `other_charges` must be 0, because `post_invoice` leaves it out of the AP/AR line. Add extra charges as an invoice line instead.

Display fixes: "VAT (5%)" was hard-coded and now shows the real rate. "(Omani Rial)" appeared for every currency and is removed. A pre-printed "✓ Authorized Signatory" stamp is replaced by the system approval date, shown only when the invoice is Approved. The terms placeholder text is removed. The "not posted" banner is shown for non-approved invoices. A Credited line is added. The company fallback to `companies[0]` (which could show the wrong letterhead) is removed. KPIs use posted documents only. The fake "Critical" trend is replaced by a pending-approval count.

## B4 Payments: route `payments`

| Control | Expected | Backend op | Auth | Status |
|---|---|---|---|---|
| Record Payment | Payment + GL entry atomically, 0 < amount ≤ outstanding, posted invoice only | `addPayment` → `record_payment`, then `set_payment_attachment` if a file was given | payments:create (+ accounting:create inside post_journal_entry) | Fixed |
| Linked invoice | Opens the invoice modal | n/a | n/a | OK |
| Receipt link (new) | Opens the stored receipt | storage ref | storage RLS | New |
| Bank balance KPI | `v_bank_balances` | fetch | RLS | Fixed (was a client running total) |

Removed: the fake "Ledger Cleared" label, the decorative trends, and the unscoped bank account count. Note: `record_payment` has no attachment parameter and payments have no UPDATE grant, so the new `set_payment_attachment` RPC fills `attachment_path` once. The path must be under `<company>/payments/`, and F's CHECK also applies.

## B5 Reconciliation: route `reconciliation`

| Control | Expected | Backend op | Auth | Status |
|---|---|---|---|---|
| New Reconciliation | User enters PO/received/WO figures; the DB computes invoice amount, difference, variance and status | `addReconciliation` → insert, then trigger `fin_reconciliation_compute` | RLS reconciliation:create + invoice visibility | Fixed |
| Work order picker (new) | Fills the WO number/amount from real work orders of the same office | n/a | n/a | New |

Issues: P1 the form came pre-filled with fabricated figures (PO-2026-0092, 295, WO-2026-104, 294.25, 294); now it starts empty. This is the form-side remainder of the AUDIT_REPORT "294" defect. P1 the difference, variance and status were trusted from the client; they are now computed in the DB, including on UPDATE, so a client cannot fake "Matched" (tested). P2 a 3-way match with 0 received showed "Partially Matched"; it now shows Mismatch with 100% variance. P2 the variance column compared the PO even for 3-way matches; it now shows the DB values. Sales invoices, credit notes and cancelled invoices are rejected. `company_id` is taken from the invoice. Columns `work_order_number` and `work_order_amount` were added (additive). Page and KPIs are scoped to the selected office.

## Dummy data found → action
| Where | Data | Action |
|---|---|---|
| InvoicesPage (×2) | Unsplash image shown as "Scanned_Supplier_Bill.pdf, 1.4 MB" for every purchase invoice | Removed; a bill is shown only when `attachment_path` exists |
| InvoicesPage KPI | "Scanned Bills Attached" counted every purchase invoice | Counts real attachments |
| ReconciliationPage | Pre-filled PO/WO/amounts; "Automated three-way parity verified." note; "100% Verified" trend | Removed |
| PrintableInvoiceModal | Authorized-signatory stamp, "Electronic Verification", "(Omani Rial)", fixed 5% VAT, terms placeholder | Removed or replaced with real data |
| PaymentsPage | "Ledger Cleared", generated `TXN-xxxx` reference (in QuickActionModals) | Label removed; see the coordinator notes for TXN |
| QuickActionModals (coordinator) | Supplier/customer defaults: fake phone, email, VAT `OM1100223344`, tax no., Bank Muscat account/IBAN/SWIFT, credit limits 10000/50000; invoice line default 100 OMR "Fleet Service & Spare Parts" | **Coordinator to remove** (send empty/null) |

---

## Coordinator integration notes

`import * as finance from '../services/finance'`, then register `finance.fetchers` (suppliers, customers, invoices, payments, reconciliations, bankAccounts) and `finance.affects`.

Context functions (same names; all now async):
```ts
addSupplier(s: Omit<Supplier,'id'|'supplierId'|'currentBalance'|'totalPurchases'|'totalInvoicesCount'|'amountPaid'|'creditNotesAmount'|'createdAt'>): Promise<Supplier>
updateSupplier(id: string, s: Partial<Supplier>): Promise<void>
addCustomer(c: Omit<Customer,'id'|'customerId'|'currentBalance'|'totalSales'|'totalInvoicesCount'|'amountReceived'|'createdAt'>): Promise<Customer>
updateCustomer(id: string, c: Partial<Customer>): Promise<void>
addInvoice(inv: Omit<Invoice,'id'|'invoiceNumber'|'createdAt'|'updatedAt'|'amountPaid'|'outstandingAmount'>): Promise<Invoice>
updateInvoice(id: string, inv: Partial<Invoice>): Promise<void>
duplicateInvoice(id: string): Promise<Invoice>
createCreditNote(invoiceId: string, reason: string, amount?: number): Promise<Invoice>      // NEW optional param
submitInvoice(id: string): Promise<Invoice['approvalStatus']>                                // NEW context fn
addPayment(p: Omit<Payment,'id'|'paymentNumber'|'createdAt'>): Promise<Payment>
addReconciliation(r: Omit<InvoiceReconciliation,'id'|'reconciliationNumber'|'createdAt'|'differenceAmount'|'variancePercentage'>): Promise<InvoiceReconciliation>
getPartyLedger(partyId, partyType) => finance.getPartyLedger(partyId, partyType, invoices, payments, partyType === 'Supplier' ? suppliers : customers)
```
The two expected tsc errors are in `PrintableInvoiceModal.tsx` (`submitInvoice` missing on the context, and the 3rd argument of `createCreditNote`). Both clear once the coordinator adds these. `getPartyLedger` now lists only posted invoices, shows credit notes and the opening balance, and no longer clamps the running balance at 0 (GeneralLedgerPage, owned by C, keeps working unchanged).

After `processApproval` on an Invoice request, also refetch `invoices, journalEntries, chartOfAccounts, suppliers, customers` (the bridge posts the invoice).

QuickActionModals call sites:
- **add-invoice**: pass `companyId`, `invoiceType`, `partyId`, `invoiceDate`, `dueDate`, `referenceNumber`, `purchaseOrderNumber`, `vehicleId`, `currency`, `items` (only itemCode, description, quantity, unit, unitPrice, discountPercentage, taxRatePercentage, glAccountCode, vehicleId, costCentre are used), and `otherCharges: 0`. Send `approvalStatus: 'Approved'` (= submit) or `'Draft'`. Drop the client subtotal/grandTotal math: it is ignored (send 0). Attachment: `const f = await uploadFile(file, companyId, 'invoices'); attachmentUrl: toStorageRef('documents', f.path)`. A data: URL is rejected with a clear error. Remove the leftover upload with `removeFiles` if `addInvoice` throws. Toast text should use the returned invoice, e.g. ``${inv.invoiceNumber}: ${inv.approvalStatus === 'Approved' ? 'posted' : 'sent for approval'}``. Remove the default line (100 OMR) and `partyId: 'sup-1'`. Default `partyId` must switch to `customers` when the type is Sales. Await, disable the submit button while pending, and show success only after the call.
- **add-payment**: list only invoices with `approvalStatus === 'Approved' && !isCreditNote && outstandingAmount > 0` (and in scope). Default the amount to the selected invoice's outstanding amount, not 100. Bank accounts must belong to the invoice's company. Pass `transactionReference` exactly as typed (drop the generated `TXN-xxxx`). Optional receipt: `uploadFile(file, inv.companyId, 'payments')` → `attachmentUrl: toStorageRef(...)`. Await inside the existing try/catch.
- **add-supplier / add-customer**: drop every fabricated default (phone, email, address, VAT/tax numbers, bank details, credit limit 10000/50000, the "Registered via Quick Actions" note). Send empty strings/0; `finance` maps '' to null. Await and use try/catch.

## Requests to other agents
- **E**: regenerate `src/types/database.ts` for `reconciliations.work_order_number/work_order_amount`, `v_party_summary`, and the RPCs `create_invoice, submit_invoice, replace_invoice_lines, duplicate_invoice, create_credit_note, set_payment_attachment`. `finance.ts` uses untyped `from()`/`rpcAny`, so this is not blocking. Numbering ordering is confirmed: `reconciliations_doc_number` fires after `fin_reconciliation_compute`, so REC numbers use the invoice's company.
- **D**: Invoice approval requests now exist (created by `fin_submit_invoice`). On approval they post through the bridge trigger, so do not also post them from `decide_approval`. Optional: `payment_status 'Overdue'` is only recalculated when a payment changes; your scheduled overdue job could set it on Unpaid invoices past due (an UPDATE run as definer is allowed by my guard).
- **A**: see the "Agent A's maintenance → invoice trigger" section above.
- **C**: GL control accounts 1100/2010/1300/2100/4000/5000 must exist in every company's seeded chart (`post_invoice` uses them).

## Open issues (not fixed)
- P2 `post_invoice` ignores `other_charges`. It is neutralised by rejecting other_charges ≠ 0 in `create_invoice` and by the guard; a proper fix belongs in `post_invoice` (000100).
- P2 `updateInvoice` runs lines → header → submit as separate calls. Each step is guarded, but the sequence is not atomic.
- P3 the opening balances of suppliers and customers are not in the GL, so party balances and control accounts differ by the opening amounts.
- P3 the CN rounding line (at most a few baisa) carries 0% VAT.
