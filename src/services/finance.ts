// AR/AP service (Agent B): suppliers, customers, invoices (+ lines, credit notes), payments, reconciliation,
// bank accounts. Same function names / parameters as the old FleetContext mutations, async and Supabase-backed.
//
// Source of truth (see supabase/migrations/20261026000200_finance.sql):
//   * invoice totals          -> invoice_lines generated columns + recalc_invoice_totals trigger
//   * paid / credited / status -> payments + credit-note settlement triggers
//   * supplier/customer balances -> v_party_summary;  bank balances -> v_bank_balances
//   * reconciliation difference / variance / status -> fin_reconciliation_compute trigger
// Nothing here computes a stored money value; the client only maps rows.
import {
  CollectionKey, Fetchers, ServiceError, nul, num, rpcAny, supabase, unwrap, unwrapOne, ymd,
} from './core';
import { parseStorageRef, toStorageRef } from './storage';
import type { Supplier, Customer, SupplierType } from '../types/operations';
import type {
  BankAccount, Invoice, InvoiceLineItem, InvoiceReconciliation, Payment, PartyStatementLine,
} from '../types/finance';

type Row = Record<string, any>;
const table = (name: string): any => (supabase as any).from(name);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

const PAGE = 1000;
/** PostgREST caps responses at 1000 rows: page so a collection is never silently truncated. */
async function fetchAll(name: string, select: string, orderBy = 'created_at', ascending = false, filter?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = table(name).select(select);
    if (filter) q = filter(q);
    const rows = await unwrap<Row[]>(q.order(orderBy, { ascending }).range(from, from + PAGE - 1));
    out.push(...(rows ?? []));
    if (!rows || rows.length < PAGE) return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Attachments: rows store a storage path; the app carries "storage://documents/<path>" in attachmentUrl
// so UIContext.openBillModal / DocumentViewerModal can resolve a signed URL.
// ---------------------------------------------------------------------------------------------
/**
 * 'Overdue' is stored, not time-driven, so it goes stale as days pass. Derive it from the due date:
 * a posted invoice with a balance past its due date is Overdue; one not yet due is never Overdue.
 */
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function effectivePaymentStatus(stored: Invoice['paymentStatus'], approval: string, creditNote: boolean, outstanding: number, paid: number, due: string): Invoice['paymentStatus'] {
  if (creditNote || approval !== 'Approved' || stored === 'Paid' || stored === 'Cancelled' || outstanding <= 0.0005) return stored;
  if (due && due < localToday()) return 'Overdue';
  return paid > 0 ? 'Partially Paid' : 'Unpaid';
}

const pathToRef = (path: string | null | undefined): string | undefined => (path ? toStorageRef('documents', path) : undefined);
const pathToName = (path: string | null | undefined): string | undefined => {
  if (!path) return undefined;
  const base = path.split('/').pop() || path;
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
};
/** Accepts a storage ref or a bare object path; rejects data:/http URLs (upload with storage.uploadFile first). */
export function attachmentPathFrom(url: string | undefined | null): string | null {
  if (!url) return null;
  const ref = parseStorageRef(url);
  if (ref) {
    if (ref.bucket !== 'documents') throw new ServiceError('Attachments must be stored in the documents bucket.');
    return ref.path;
  }
  if (/^[0-9a-f-]{36}\/(invoices|payments)\//i.test(url)) return url;
  throw new ServiceError('Upload the file first (storage.uploadFile) and pass its storage reference.');
}

// ---------------------------------------------------------------------------------------------
// Suppliers / customers
// ---------------------------------------------------------------------------------------------
interface PartySummary { total_invoiced: unknown; total_paid: unknown; total_credited: unknown; outstanding: unknown; invoice_count: unknown; current_balance: unknown }

export const rowToSupplier = (r: Row, s?: PartySummary): Supplier => ({
  id: r.id,
  supplierId: r.supplier_code,
  name: r.name,
  supplierType: r.supplier_type as SupplierType,
  contactPerson: r.contact_person ?? '',
  phone: r.phone ?? '',
  email: r.email ?? '',
  address: r.address ?? '',
  city: r.city ?? '',
  country: r.country ?? '',
  vatNumber: r.vat_number ?? '',
  taxNumber: r.tax_number ?? '',
  paymentTermsDays: r.payment_terms_days ?? 0,
  creditLimit: num(r.credit_limit),
  bankDetails: {
    bankName: r.bank_details?.bankName ?? '',
    accountNumber: r.bank_details?.accountNumber ?? '',
    iban: r.bank_details?.iban ?? '',
    swiftCode: r.bank_details?.swiftCode ?? '',
  },
  openingBalance: num(r.opening_balance),
  currentBalance: s ? num(s.current_balance) : num(r.opening_balance),
  totalPurchases: num(s?.total_invoiced),
  totalInvoicesCount: num(s?.invoice_count),
  amountPaid: num(s?.total_paid),
  creditNotesAmount: num(s?.total_credited),
  status: r.status,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

export const rowToCustomer = (r: Row, s?: PartySummary): Customer => ({
  id: r.id,
  customerId: r.customer_code,
  name: r.name,
  customerType: r.customer_type,
  contactPerson: r.contact_person ?? '',
  phone: r.phone ?? '',
  email: r.email ?? '',
  address: r.address ?? '',
  city: r.city ?? '',
  country: r.country ?? '',
  vatNumber: r.vat_number ?? '',
  taxNumber: r.tax_number ?? '',
  paymentTermsDays: r.payment_terms_days ?? 0,
  creditLimit: num(r.credit_limit),
  openingBalance: num(r.opening_balance),
  currentBalance: s ? num(s.current_balance) : num(r.opening_balance),
  totalSales: num(s?.total_invoiced),
  totalInvoicesCount: num(s?.invoice_count),
  amountReceived: num(s?.total_paid),
  status: r.status,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

const partyCommonToRow = (p: Partial<Supplier> | Partial<Customer>): Row => {
  const row: Row = {};
  if (p.name !== undefined) row.name = p.name.trim();
  if (p.contactPerson !== undefined) row.contact_person = nul(p.contactPerson);
  if (p.phone !== undefined) row.phone = nul(p.phone);
  if (p.email !== undefined) row.email = nul(p.email);
  if (p.address !== undefined) row.address = nul(p.address);
  if (p.city !== undefined) row.city = nul(p.city);
  if (p.country !== undefined) row.country = nul(p.country);
  if (p.vatNumber !== undefined) row.vat_number = nul(p.vatNumber);
  if (p.taxNumber !== undefined) row.tax_number = nul(p.taxNumber);
  if (p.paymentTermsDays !== undefined) row.payment_terms_days = p.paymentTermsDays;
  if (p.creditLimit !== undefined) row.credit_limit = p.creditLimit;
  if (p.openingBalance !== undefined) row.opening_balance = p.openingBalance;
  if (p.status !== undefined) row.status = p.status;
  if (p.notes !== undefined) row.notes = nul(p.notes);
  return row;
};

export const supplierToRow = (p: Partial<Supplier>): Row => {
  const row = partyCommonToRow(p);
  if (p.supplierType !== undefined) row.supplier_type = p.supplierType;
  if (p.bankDetails !== undefined) row.bank_details = p.bankDetails ?? {};
  return row;   // supplierId (code) and every balance field are DB-owned
};

export const customerToRow = (p: Partial<Customer>): Row => {
  const row = partyCommonToRow(p);
  if (p.customerType !== undefined) row.customer_type = p.customerType;
  return row;
};

async function partySummaries(partyType: 'Supplier' | 'Customer', ids?: string[]): Promise<Map<string, PartySummary>> {
  const rows = await fetchAll('v_party_summary', '*', 'party_id', true, q => {
    let x = q.eq('party_type', partyType);
    if (ids) x = x.in('party_id', ids);
    return x;
  });
  return new Map(rows.map(r => [r.party_id as string, r as PartySummary]));
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const [rows, sums] = await Promise.all([fetchAll('suppliers', '*', 'name', true), partySummaries('Supplier')]);
  return rows.map(r => rowToSupplier(r, sums.get(r.id)));
}

export async function fetchCustomers(): Promise<Customer[]> {
  const [rows, sums] = await Promise.all([fetchAll('customers', '*', 'name', true), partySummaries('Customer')]);
  return rows.map(r => rowToCustomer(r, sums.get(r.id)));
}

async function loadSupplier(id: string): Promise<Supplier> {
  const r = await unwrapOne<Row>(table('suppliers').select('*').eq('id', id).maybeSingle());
  return rowToSupplier(r, (await partySummaries('Supplier', [id])).get(id));
}
async function loadCustomer(id: string): Promise<Customer> {
  const r = await unwrapOne<Row>(table('customers').select('*').eq('id', id).maybeSingle());
  return rowToCustomer(r, (await partySummaries('Customer', [id])).get(id));
}

export async function addSupplier(
  supplier: Omit<Supplier, 'id' | 'supplierId' | 'currentBalance' | 'totalPurchases' | 'totalInvoicesCount' | 'amountPaid' | 'creditNotesAmount' | 'createdAt'>,
): Promise<Supplier> {
  if (!supplier.name?.trim()) throw new ServiceError('Supplier name is required.');
  const row = { ...supplierToRow(supplier), supplier_code: null };   // SUP-### assigned by the DB
  const r = await unwrapOne<Row>(table('suppliers').insert(row).select('id').single());
  return loadSupplier(r.id);
}

/** Edits master data only. Deactivate with { status: 'Inactive' } (suppliers linked to invoices cannot be deleted). */
export async function updateSupplier(id: string, supplier: Partial<Supplier>): Promise<void> {
  const row = supplierToRow(supplier);
  if (row.name === '') throw new ServiceError('Supplier name is required.');
  if (Object.keys(row).length === 0) return;
  await unwrapOne(table('suppliers').update(row).eq('id', id).select('id').maybeSingle());
}

export async function addCustomer(
  customer: Omit<Customer, 'id' | 'customerId' | 'currentBalance' | 'totalSales' | 'totalInvoicesCount' | 'amountReceived' | 'createdAt'>,
): Promise<Customer> {
  if (!customer.name?.trim()) throw new ServiceError('Customer name is required.');
  const row = { ...customerToRow(customer), customer_code: null };   // CUST-### assigned by the DB
  const r = await unwrapOne<Row>(table('customers').insert(row).select('id').single());
  return loadCustomer(r.id);
}

export async function updateCustomer(id: string, customer: Partial<Customer>): Promise<void> {
  const row = customerToRow(customer);
  if (row.name === '') throw new ServiceError('Customer name is required.');
  if (Object.keys(row).length === 0) return;
  await unwrapOne(table('customers').update(row).eq('id', id).select('id').maybeSingle());
}

// ---------------------------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------------------------
/** Invoice plus DB-only fields the pages may use (still assignable to Invoice). */
export interface FinanceInvoice extends Invoice {
  creditedAmount: number;
  journalEntryId?: string;
  attachmentPath?: string;
}

const INVOICE_SELECT = `*,
  company:companies(name),
  vehicle:vehicles(plate_number),
  work_order:work_orders(work_order_number),
  supplier:suppliers(name, vat_number, address, email, phone),
  customer:customers(name, vat_number, address, email, phone),
  lines:invoice_lines(*, vehicle:vehicles(plate_number))`;

export const rowToInvoiceLine = (l: Row): InvoiceLineItem => ({
  id: l.id,
  itemCode: l.item_code ?? '',
  description: l.description,
  quantity: num(l.quantity),
  unit: l.unit ?? '',
  unitPrice: num(l.unit_price),
  discountPercentage: num(l.discount_percentage),
  discountAmount: num(l.discount_amount),
  taxRatePercentage: num(l.tax_rate_percentage),
  taxAmount: num(l.tax_amount),
  lineTotal: num(l.line_total),
  vehicleId: l.vehicle_id ?? undefined,
  vehiclePlate: l.vehicle?.plate_number ?? undefined,
  expenseCategory: l.expense_category ?? undefined,
  glAccountCode: l.gl_account_code ?? undefined,
  costCentre: l.cost_centre ?? undefined,
});

export const rowToInvoice = (r: Row): FinanceInvoice => {
  const cn = !!r.is_credit_note;
  const sign = cn ? -1 : 1;   // app convention: credit notes carry negative totals so sums net naturally
  const party = r.party_type === 'Supplier' ? r.supplier : r.customer;
  const snap = r.party_snapshot ?? {};
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    invoiceType: r.invoice_type,
    companyId: r.company_id,
    companyName: r.company?.name ?? '',
    partyType: r.party_type,
    partyId: r.supplier_id ?? r.customer_id,
    partyName: snap.name ?? party?.name ?? '',
    partyVatNumber: snap.vat_number ?? party?.vat_number ?? undefined,
    partyAddress: snap.address ?? party?.address ?? undefined,
    partyEmail: snap.email ?? party?.email ?? undefined,
    partyPhone: snap.phone ?? party?.phone ?? undefined,
    invoiceDate: ymd(r.invoice_date),
    dueDate: ymd(r.due_date),
    referenceNumber: r.reference_number ?? undefined,
    purchaseOrderNumber: r.purchase_order_number ?? undefined,
    workOrderNumber: r.work_order?.work_order_number ?? undefined,
    maintenanceRecordId: r.maintenance_record_id ?? undefined,
    vehicleId: r.vehicle_id ?? undefined,
    vehiclePlate: r.vehicle?.plate_number ?? undefined,
    costCentre: r.cost_centre ?? undefined,
    currency: r.currency,
    exchangeRate: num(r.exchange_rate),
    items: ((r.lines ?? []) as Row[]).slice().sort((a, b) => a.line_no - b.line_no).map(rowToInvoiceLine),
    subtotal: sign * num(r.subtotal),
    discountTotal: sign * num(r.discount_total),
    taxTotal: sign * num(r.tax_total),
    otherCharges: num(r.other_charges),
    grandTotal: sign * num(r.grand_total),
    amountPaid: cn ? 0 : num(r.amount_paid),
    outstandingAmount: cn ? 0 : num(r.outstanding_amount),
    creditedAmount: num(r.credited_amount),
    paymentStatus: effectivePaymentStatus(r.payment_status, r.approval_status, cn, num(r.outstanding_amount), num(r.amount_paid), ymd(r.due_date)),
    approvalStatus: r.approval_status,
    approvedBy: r.approved_by ?? undefined,
    approvalDate: r.approval_date ?? undefined,
    attachmentPath: r.attachment_path ?? undefined,
    attachmentUrl: pathToRef(r.attachment_path),
    attachmentName: pathToName(r.attachment_path),
    paymentTermsDays: r.payment_terms_days ?? 0,
    termsAndConditions: r.terms_and_conditions ?? undefined,
    notes: r.notes ?? undefined,
    isCreditNote: cn,
    parentInvoiceId: r.parent_invoice_id ?? undefined,
    journalEntryId: r.journal_entry_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

/** Lines for create_invoice / replace_invoice_lines. Amount fields (discount/tax/line totals) are computed by the DB. */
export const invoiceLineToJson = (l: InvoiceLineItem): Row => ({
  item_code: nul(l.itemCode),
  description: l.description,
  quantity: Number(l.quantity),
  unit: nul(l.unit),
  unit_price: Number(l.unitPrice),
  discount_percentage: Number(l.discountPercentage || 0),
  tax_rate_percentage: Number(l.taxRatePercentage || 0),
  vehicle_id: nul(l.vehicleId),
  expense_category: nul(l.expenseCategory),
  gl_account_code: nul(l.glAccountCode),
  cost_centre: nul(l.costCentre),
});

/** Header for create_invoice. Party snapshot, number, totals and status are set by the DB. */
export const invoiceToHeader = (inv: Partial<Invoice>): Row => ({
  company_id: inv.companyId,
  invoice_type: inv.invoiceType,
  supplier_id: inv.invoiceType === 'Purchase' ? inv.partyId : null,
  customer_id: inv.invoiceType === 'Sales' ? inv.partyId : null,
  invoice_date: nul(inv.invoiceDate),
  due_date: nul(inv.dueDate),
  reference_number: nul(inv.referenceNumber),
  purchase_order_number: nul(inv.purchaseOrderNumber),
  maintenance_record_id: nul(inv.maintenanceRecordId),
  vehicle_id: nul(inv.vehicleId),
  cost_centre: nul(inv.costCentre),
  currency: inv.currency || 'OMR',
  exchange_rate: inv.exchangeRate || 1,
  payment_terms_days: inv.paymentTermsDays ?? null,
  terms_and_conditions: nul(inv.termsAndConditions),
  notes: nul(inv.notes),
  other_charges: inv.otherCharges || 0,
  attachment_path: attachmentPathFrom(inv.attachmentUrl),
});

export async function fetchInvoices(): Promise<FinanceInvoice[]> {
  return (await fetchAll('invoices', INVOICE_SELECT, 'invoice_date')).map(rowToInvoice);
}

export async function fetchInvoice(id: string): Promise<FinanceInvoice> {
  return rowToInvoice(await unwrapOne<Row>(table('invoices').select(INVOICE_SELECT).eq('id', id).maybeSingle()));
}

/**
 * Atomic header + lines (create_invoice RPC). Client totals are ignored.
 * approvalStatus 'Draft' saves a draft; anything else submits: posted to the GL at once when the user may
 * approve the amount, otherwise 'Pending Approval' with an approval request.
 */
export async function addInvoice(
  invoice: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'outstandingAmount'>,
): Promise<Invoice> {
  if (!invoice.items?.length) throw new ServiceError('Add at least one invoice line.');
  const id = await rpcAny<string>('create_invoice', {
    p_header: invoiceToHeader(invoice),
    p_lines: invoice.items.map(invoiceLineToJson),
    p_submit: invoice.approvalStatus !== 'Draft',
  });
  return fetchInvoice(id);
}

/** Submit a Draft/Rejected (or system-raised pending) invoice. Returns the resulting approval status. */
export async function submitInvoice(id: string): Promise<Invoice['approvalStatus']> {
  return rpcAny<Invoice['approvalStatus']>('submit_invoice', { p_invoice: id });
}

/**
 * Header edits through RLS (the DB guard rejects changes to totals, numbering or posted terms);
 * `items` replaces the lines atomically (draft/rejected only); approvalStatus 'Pending Approval'/'Approved'
 * submits; 'Cancelled' cancels an unposted invoice. Derived fields (totals, paid, status) are ignored.
 */
export async function updateInvoice(id: string, invoice: Partial<Invoice>): Promise<void> {
  if (invoice.items) {
    await rpcAny('replace_invoice_lines', { p_invoice: id, p_lines: invoice.items.map(invoiceLineToJson) });
  }
  const row: Row = {};
  if (invoice.invoiceDate !== undefined) row.invoice_date = invoice.invoiceDate;
  if (invoice.dueDate !== undefined) row.due_date = invoice.dueDate;
  if (invoice.referenceNumber !== undefined) row.reference_number = nul(invoice.referenceNumber);
  if (invoice.purchaseOrderNumber !== undefined) row.purchase_order_number = nul(invoice.purchaseOrderNumber);
  if (invoice.vehicleId !== undefined) row.vehicle_id = nul(invoice.vehicleId);
  if (invoice.costCentre !== undefined) row.cost_centre = nul(invoice.costCentre);
  if (invoice.paymentTermsDays !== undefined) row.payment_terms_days = invoice.paymentTermsDays;
  if (invoice.termsAndConditions !== undefined) row.terms_and_conditions = nul(invoice.termsAndConditions);
  if (invoice.notes !== undefined) row.notes = nul(invoice.notes);
  if (invoice.currency !== undefined) row.currency = invoice.currency;
  if (invoice.exchangeRate !== undefined) row.exchange_rate = invoice.exchangeRate;
  if (invoice.attachmentUrl !== undefined) row.attachment_path = attachmentPathFrom(invoice.attachmentUrl);
  if (invoice.partyId !== undefined) {
    if (invoice.partyType === 'Customer' || invoice.invoiceType === 'Sales') row.customer_id = invoice.partyId;
    else row.supplier_id = invoice.partyId;
  }
  if (invoice.approvalStatus === 'Cancelled' || invoice.approvalStatus === 'Draft') row.approval_status = invoice.approvalStatus;
  if (Object.keys(row).length) {
    await unwrapOne(table('invoices').update(row).eq('id', id).select('id').maybeSingle());
  }
  if (invoice.approvalStatus === 'Pending Approval' || invoice.approvalStatus === 'Approved') {
    await submitInvoice(id);
  }
}

/** Copy as a new Draft dated today (duplicate_invoice RPC). */
export async function duplicateInvoice(id: string): Promise<Invoice> {
  const newId = await rpcAny<string>('duplicate_invoice', { p_invoice: id });
  return fetchInvoice(newId);
}

/**
 * Credit note against a posted invoice, posted immediately (needs invoice approval authority for the amount).
 * amount omitted = the full outstanding amount. Over-crediting and double crediting are rejected by the DB.
 */
export async function createCreditNote(invoiceId: string, reason: string, amount?: number): Promise<Invoice> {
  if (!reason?.trim()) throw new ServiceError('A reason is required for a credit note.');
  if (amount !== undefined && !(amount > 0)) throw new ServiceError('Credit amount must be greater than zero.');
  const id = await rpcAny<string>('create_credit_note', {
    p_invoice: invoiceId, p_reason: reason.trim(), p_amount: amount ?? null,
  });
  return fetchInvoice(id);
}

// ---------------------------------------------------------------------------------------------
// Payments (record_payment RPC only: direct inserts are not granted)
// ---------------------------------------------------------------------------------------------
const PAYMENT_SELECT = `*,
  invoice:invoices(invoice_number, invoice_type, party_type, supplier_id, customer_id, party_snapshot),
  bank:bank_accounts(account_name, bank_name)`;

export const rowToPayment = (r: Row): Payment => ({
  id: r.id,
  paymentNumber: r.payment_number,
  companyId: r.company_id,
  invoiceId: r.invoice_id,
  invoiceNumber: r.invoice?.invoice_number ?? '',
  invoiceType: r.invoice?.invoice_type,
  partyType: r.invoice?.party_type,
  partyId: r.invoice?.supplier_id ?? r.invoice?.customer_id ?? '',
  partyName: r.invoice?.party_snapshot?.name ?? '',
  paymentDate: ymd(r.payment_date),
  amount: num(r.amount),
  currency: r.currency,
  paymentMethod: r.payment_method,
  bankAccountId: r.bank_account_id,
  bankAccountName: r.bank?.account_name ?? '',
  transactionReference: r.transaction_reference ?? '',
  chequeNumber: r.cheque_number ?? undefined,
  notes: r.notes ?? undefined,
  attachmentUrl: pathToRef(r.attachment_path),
  attachmentName: pathToName(r.attachment_path),
  createdAt: r.created_at,
});

export async function fetchPayments(): Promise<Payment[]> {
  return (await fetchAll('payments', PAYMENT_SELECT, 'payment_date')).map(rowToPayment);
}

/**
 * Records the payment and its GL entry atomically (record_payment). Amount must be > 0 and <= outstanding;
 * the invoice must be approved/posted. Only invoiceId, amount, paymentDate, paymentMethod, bankAccountId,
 * transactionReference, chequeNumber, notes and attachmentUrl are used; party/invoice copies come from the DB.
 * attachmentUrl (storage ref under <company>/payments/) is linked after the payment exists.
 */
export async function addPayment(payment: Omit<Payment, 'id' | 'paymentNumber' | 'createdAt'>): Promise<Payment> {
  if (!(payment.amount > 0)) throw new ServiceError('Payment amount must be greater than zero.');
  const attachment = attachmentPathFrom(payment.attachmentUrl);
  const id = await rpcAny<string>('record_payment', {
    p_invoice: payment.invoiceId,
    p_amount: round3(payment.amount),
    p_date: payment.paymentDate,
    p_method: payment.paymentMethod,
    p_bank_account: payment.bankAccountId,
    p_reference: nul(payment.transactionReference),
    p_cheque: nul(payment.chequeNumber),
    p_notes: nul(payment.notes),
  });
  if (attachment) {
    try {
      await rpcAny('set_payment_attachment', { p_payment: id, p_path: attachment });
    } catch (e) {
      throw new ServiceError(`Payment recorded, but the attachment could not be linked: ${(e as Error).message}`);
    }
  }
  return unwrapOne<Row>(table('payments').select(PAYMENT_SELECT).eq('id', id).maybeSingle()).then(rowToPayment);
}

// ---------------------------------------------------------------------------------------------
// Bank accounts (balance from v_bank_balances)
// ---------------------------------------------------------------------------------------------
export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const [rows, bal] = await Promise.all([
    fetchAll('bank_accounts', '*', 'bank_name', true),
    fetchAll('v_bank_balances', 'id, current_balance', 'id', true),
  ]);
  const balances = new Map(bal.map(b => [b.id as string, num(b.current_balance)]));
  return rows.map(r => ({
    id: r.id,
    companyId: r.company_id,
    bankName: r.bank_name,
    accountName: r.account_name,
    accountNumber: r.account_number,
    iban: r.iban ?? '',
    currency: r.currency,
    currentBalance: balances.get(r.id) ?? num(r.opening_balance),
    accountType: r.account_type,
    active: !!r.active,
  }));
}

// ---------------------------------------------------------------------------------------------
// Reconciliation (difference / variance / status computed by fin_reconciliation_compute)
// ---------------------------------------------------------------------------------------------
const REC_SELECT = `*, invoice:invoices(invoice_number, amount_paid, party_snapshot)`;

export const rowToReconciliation = (r: Row): InvoiceReconciliation => ({
  id: r.id,
  reconciliationNumber: r.reconciliation_number,
  companyId: r.company_id,
  invoiceId: r.invoice_id,
  invoiceNumber: r.invoice?.invoice_number ?? '',
  supplierOrCustomerName: r.invoice?.party_snapshot?.name ?? '',
  matchingType: r.matching_type,
  purchaseOrderNumber: r.purchase_order_number ?? undefined,
  purchaseOrderAmount: r.purchase_order_amount == null ? undefined : num(r.purchase_order_amount),
  workOrderNumber: r.work_order_number ?? undefined,
  workOrderAmount: r.work_order_amount == null ? undefined : num(r.work_order_amount),
  goodsServiceReceivedAmount: r.goods_received_amount == null ? undefined : num(r.goods_received_amount),
  invoiceAmount: num(r.invoice_amount),
  paidAmount: num(r.invoice?.amount_paid),
  differenceAmount: num(r.difference_amount),
  variancePercentage: num(r.variance_percentage),
  status: r.status,
  discrepancyReason: r.discrepancy_reason ?? undefined,
  reconciledBy: r.reconciled_by ?? undefined,
  reconciledDate: r.reconciled_date ? ymd(r.reconciled_date) : undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

export async function fetchReconciliations(): Promise<InvoiceReconciliation[]> {
  return (await fetchAll('reconciliations', REC_SELECT)).map(rowToReconciliation);
}

/** invoiceAmount, paidAmount and status in the input are ignored: the DB derives them. */
export async function addReconciliation(
  rec: Omit<InvoiceReconciliation, 'id' | 'reconciliationNumber' | 'createdAt' | 'differenceAmount' | 'variancePercentage'>,
): Promise<InvoiceReconciliation> {
  const row = {
    company_id: rec.companyId,             // overwritten from the invoice by the trigger
    reconciliation_number: null,           // REC-YYYY-### assigned by the DB
    invoice_id: rec.invoiceId,
    matching_type: rec.matchingType,
    purchase_order_number: nul(rec.purchaseOrderNumber),
    purchase_order_amount: rec.purchaseOrderAmount ?? null,
    goods_received_amount: rec.matchingType === '3-Way' ? rec.goodsServiceReceivedAmount ?? null : null,
    work_order_number: nul(rec.workOrderNumber),
    work_order_amount: rec.workOrderAmount ?? null,
    discrepancy_reason: nul(rec.discrepancyReason),
    notes: nul(rec.notes),
    // NOT NULL placeholders, recomputed by fin_reconciliation_compute
    invoice_amount: 0, difference_amount: 0, variance_percentage: 0, status: 'Pending Review',
  };
  return rowToReconciliation(await unwrapOne<Row>(table('reconciliations').insert(row).select(REC_SELECT).single()));
}

// ---------------------------------------------------------------------------------------------
// Party statement (pure; moved from FleetContext.getPartyLedger)
// Only posted (Approved) documents appear. Balance = amount owed (to the supplier / by the customer).
// ---------------------------------------------------------------------------------------------
export function getPartyLedger(
  partyId: string,
  partyType: 'Supplier' | 'Customer',
  invoices: Invoice[],
  payments: Payment[],
  parties: { id: string; openingBalance: number }[] = [],
  companyId?: string,
): { openingBalance: number; lines: PartyStatementLine[]; totalDebit: number; totalCredit: number; closingBalance: number } {
  const openingBalance = parties.find(p => p.id === partyId)?.openingBalance ?? 0;
  const supplier = partyType === 'Supplier';
  const docs = invoices.filter(i => i.partyId === partyId && i.partyType === partyType && (!companyId || i.companyId === companyId)
    && i.approvalStatus === 'Approved' && i.paymentStatus !== 'Cancelled');
  const pays = payments.filter(p => p.partyId === partyId && p.partyType === partyType && (!companyId || p.companyId === companyId));

  type Ev = { date: string; created: string; line: Omit<PartyStatementLine, 'runningBalance'>; delta: number };
  const events: Ev[] = [
    ...docs.map(i => {
      const amt = Math.abs(i.grandTotal);
      const isCn = !!i.isCreditNote;
      // supplier: invoice = credit (owed up), credit note = debit; customer: invoice = debit, credit note = credit
      const debit = supplier ? (isCn ? amt : 0) : (isCn ? 0 : amt);
      const credit = supplier ? (isCn ? 0 : amt) : (isCn ? amt : 0);
      return {
        date: i.invoiceDate, created: i.createdAt, delta: isCn ? -amt : amt,
        line: {
          id: `inv-${i.id}`, date: i.invoiceDate, type: isCn ? 'Credit Note' as const : 'Invoice' as const,
          referenceNumber: i.invoiceNumber,
          description: i.notes || `${i.invoiceType} ${isCn ? 'credit note' : 'invoice'} (${i.items.length} line${i.items.length === 1 ? '' : 's'})`,
          debit, credit,
        },
      };
    }),
    ...pays.map(p => ({
      date: p.paymentDate, created: p.createdAt, delta: -p.amount,
      line: {
        id: `pay-${p.id}`, date: p.paymentDate, type: 'Payment' as const, referenceNumber: p.paymentNumber,
        description: p.notes || `${supplier ? 'Payment' : 'Collection'} via ${p.paymentMethod}`,
        debit: supplier ? p.amount : 0, credit: supplier ? 0 : p.amount,
      },
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || String(a.created).localeCompare(String(b.created)));

  let running = openingBalance, totalDebit = 0, totalCredit = 0;
  const lines: PartyStatementLine[] = [];
  if (openingBalance !== 0) {
    lines.push({
      id: `open-${partyId}`, date: '', type: 'Opening Balance', referenceNumber: '-', description: 'Opening balance',
      debit: supplier ? 0 : openingBalance, credit: supplier ? openingBalance : 0, runningBalance: round3(openingBalance),
    });
  }
  for (const ev of events) {
    running += ev.delta;
    totalDebit += ev.line.debit;
    totalCredit += ev.line.credit;
    lines.push({ ...ev.line, runningBalance: round3(running) });   // no clamping: overpayments must stay visible
  }
  return { openingBalance, lines, totalDebit: round3(totalDebit), totalCredit: round3(totalCredit), closingBalance: round3(running) };
}

// ---------------------------------------------------------------------------------------------
// Coordinator wiring
// ---------------------------------------------------------------------------------------------
export const fetchers: Fetchers = {
  suppliers: fetchSuppliers,
  customers: fetchCustomers,
  invoices: fetchInvoices,
  payments: fetchPayments,
  reconciliations: fetchReconciliations,
  bankAccounts: fetchBankAccounts,
};

const POSTING: CollectionKey[] = ['invoices', 'suppliers', 'customers', 'journalEntries', 'chartOfAccounts', 'approvalRequests', 'notifications'];
export const affects: Record<string, CollectionKey[]> = {
  addSupplier: ['suppliers'],
  updateSupplier: ['suppliers', 'invoices'],
  addCustomer: ['customers'],
  updateCustomer: ['customers', 'invoices'],
  addInvoice: POSTING,
  updateInvoice: POSTING,
  submitInvoice: POSTING,
  duplicateInvoice: ['invoices', 'suppliers', 'customers'],
  createCreditNote: ['invoices', 'suppliers', 'customers', 'journalEntries', 'chartOfAccounts'],
  addPayment: ['payments', 'invoices', 'bankAccounts', 'suppliers', 'customers', 'journalEntries', 'chartOfAccounts', 'notifications'],
  addReconciliation: ['reconciliations'],
};
