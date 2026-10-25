// System services: approvals, notifications, audit log, reporting views.
// Conventions: see docs/audit/CONTRACTS.md and src/services/core.ts.
import { supabase, unwrap, rpcAny, ServiceError, num, ymd, currentUserId, type CollectionKey, type Fetchers } from './core';
import type {
  ApprovalRequest, ApprovalRule, AuditLog, NotificationItem, NotificationType, User, UserRole,
} from '../types/system';

// ---------------------------------------------------------------------------
// Mappers (rows are typed loosely: the generated types do not yet contain the
// columns added by migration 20261026000400_system.sql)
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

export const rowToNotification = (r: Row): NotificationItem => ({
  id: r.id,
  type: r.type as NotificationType,
  title: r.title,
  message: r.message,
  severity: r.severity,
  date: r.created_at,
  // notification_reads is filtered to the caller by RLS, so any row means "I read it"
  read: Array.isArray(r.notification_reads) ? r.notification_reads.length > 0 : false,
  link: r.link ?? undefined,
  vehicleId: r.vehicle_id ?? undefined,
  referenceId: r.reference_id ?? undefined,
});

export const rowToApprovalRule = (r: Row): ApprovalRule => ({
  id: r.id,
  module: r.module,
  thresholdAmount: num(r.threshold_amount),
  currency: r.currency,
  requiredRoles: (r.required_roles ?? []) as UserRole[],
  description: r.description ?? '',
  active: !!r.active,
});

export const rowToApprovalRequest = (r: Row): ApprovalRequest => ({
  id: r.id,
  referenceType: r.reference_type,
  referenceId: r.reference_id,
  referenceNumber: r.reference_number,
  companyId: r.company_id,
  requestedBy: r.requested_by ?? '',
  requestedByName: r.requested_by_name ?? 'Unknown user',
  requestedDate: r.requested_at,
  amount: num(r.amount),
  currency: r.currency,
  status: r.status,
  currentLevel: r.current_level,
  totalLevels: r.total_levels,
  requiredRoles: (r.required_roles ?? []) as UserRole[],
  history: ((r.approval_actions ?? []) as Row[])
    .slice()
    .sort((a, b) => a.level - b.level || String(a.acted_at).localeCompare(String(b.acted_at)))
    .map(a => ({
      level: a.level,
      approverId: a.approver_id,
      approverName: a.approver_name ?? 'Unknown user',
      approverRole: a.approver_role,
      action: a.action,
      comment: a.comment,
      date: a.acted_at,
    })),
  notes: r.notes ?? undefined,
});

// audit_logs.entity_type is the table name -> app entity type (falls back to a readable table name)
const ENTITY_TYPE: Record<string, string> = {
  vehicles: 'Vehicle', maintenance_records: 'Maintenance', work_orders: 'WorkOrder', invoices: 'Invoice',
  payments: 'Payment', expenses: 'Expense', accidents: 'Accident', tyres: 'Tyre', oil_changes: 'OilChange',
  journal_entries: 'Accounting', bank_accounts: 'Accounting', fixed_assets: 'Accounting',
  depreciation_runs: 'Accounting', payroll_runs: 'Accounting', employees: 'Accounting',
  documents: 'Document', companies: 'Company', profiles: 'User',
  suppliers: 'Supplier', customers: 'Customer', reconciliations: 'Reconciliation', approval_requests: 'Approval',
};
const NAME_KEYS = [
  'plate_number', 'invoice_number', 'work_order_number', 'record_number', 'expense_number', 'accident_number',
  'payment_number', 'reconciliation_number', 'entry_number', 'batch_number', 'payroll_number', 'asset_code',
  'employee_code', 'supplier_code', 'customer_code', 'reference_number', 'document_name', 'name', 'vehicle_code', 'code',
];
const IGNORED_FIELDS = new Set(['updated_at', 'created_at']);

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined) return '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 37) + '...' : s;
};

const changedFields = (oldV: Row | null, newV: Row | null): string[] => {
  if (!oldV || !newV) return [];
  return Object.keys(newV).filter(k => !IGNORED_FIELDS.has(k) && JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]));
};

export const rowToAuditLog = (r: Row): AuditLog => {
  const oldV: Row | null = r.old_value ?? null;
  const newV: Row | null = r.new_value ?? null;
  const src = newV ?? oldV ?? {};
  const table: string = r.entity_type;
  let action = String(r.action) as AuditLog['action'];

  if (table === 'approval_requests' && action === 'UPDATE' && oldV && newV && oldV.status !== newV.status) {
    action = newV.status === 'Approved' ? 'APPROVE' : newV.status === 'Rejected' ? 'REJECT' : action;
  } else if (table === 'payments' && action === 'CREATE') action = 'PAYMENT';
  else if (table === 'reconciliations' && action === 'CREATE') action = 'RECONCILE';

  let entityType = ENTITY_TYPE[table] ?? table;
  if (table === 'approval_requests') entityType = src.reference_type === 'Invoice' ? 'Invoice' : src.reference_type === 'Expense' ? 'Expense' : 'WorkOrder';

  const nameKey = NAME_KEYS.find(k => src[k]);
  const entityName = nameKey ? String(src[nameKey]) : String(r.entity_id ?? '');

  const changed = changedFields(oldV, newV);
  let details: string;
  if (action === 'CREATE' || action === 'PAYMENT' || action === 'RECONCILE') details = `${entityType} ${entityName} recorded`;
  else if (action === 'DELETE') details = `${entityType} ${entityName} deleted`;
  else if (action === 'APPROVE' || action === 'REJECT') details = `${action === 'APPROVE' ? 'Approved' : 'Rejected'} ${entityName} (level ${newV?.current_level}/${newV?.total_levels})`;
  else if (changed.length === 0) details = `${entityType} ${entityName} saved without field changes`;
  else details = changed.slice(0, 4).map(k => `${k}: ${fmtVal(oldV?.[k])} -> ${fmtVal(newV?.[k])}`).join('; ') + (changed.length > 4 ? ` (+${changed.length - 4} more)` : '');

  return {
    id: String(r.id),
    timestamp: r.occurred_at,
    userId: r.user_id ?? '',
    userName: r.user_name ?? (r.user_id ? 'Unknown user' : 'System'),
    userRole: r.user_role ?? '',
    action,
    entityType: entityType as AuditLog['entityType'],
    entityId: String(r.entity_id ?? ''),
    entityName,
    details,
    oldValue: changed.length ? JSON.stringify(Object.fromEntries(changed.map(k => [k, oldV?.[k]]))) : undefined,
    newValue: changed.length ? JSON.stringify(Object.fromEntries(changed.map(k => [k, newV?.[k]]))) : undefined,
    ipAddress: undefined, // not captured by the database; deliberately not fabricated
  };
};

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
export const AUDIT_LOG_LIMIT = 1000;

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const rows = await unwrap<Row[]>(
    supabase.from('notifications').select('*, notification_reads(read_at)').order('created_at', { ascending: false }).limit(500) as any,
  );
  return rows.map(rowToNotification);
}

export async function fetchApprovalRules(): Promise<ApprovalRule[]> {
  const rows = await unwrap<Row[]>(supabase.from('approval_rules').select('*').order('module').order('threshold_amount') as any);
  return rows.map(rowToApprovalRule);
}

export async function fetchApprovalRequests(): Promise<ApprovalRequest[]> {
  const rows = await unwrap<Row[]>(
    supabase.from('approval_requests').select('*, approval_actions(*)').order('requested_at', { ascending: false }) as any,
  );
  return rows.map(rowToApprovalRequest);
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const rows = await unwrap<Row[]>(
    supabase.from('audit_logs').select('*').order('occurred_at', { ascending: false }).limit(AUDIT_LOG_LIMIT) as any,
  );
  return rows.map(rowToAuditLog);
}

export const fetchers: Fetchers = {
  notifications: fetchNotifications,
  approvalRules: fetchApprovalRules,
  approvalRequests: fetchApprovalRequests,
  auditLogs: fetchAuditLogs,
};

// ---------------------------------------------------------------------------
// Mutations (same names / parameters as FleetContext)
// ---------------------------------------------------------------------------

// The DB decides who may sign (role, company, threshold) and records the signer from auth.uid();
// `approverUser` is accepted for signature compatibility only and is never trusted.
export async function processApproval(
  requestId: string,
  action: 'Approved' | 'Rejected',
  comment?: string,
  _approverUser?: User,
): Promise<void> {
  const text = (comment ?? '').trim();
  if (!text) throw new ServiceError('A sign-off comment is required.');
  await rpcAny('decide_approval', { p_request: requestId, p_action: action, p_comment: text });
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new ServiceError('You must be signed in.');
  const { error } = await (supabase.from('notification_reads') as any)
    .upsert({ notification_id: id, user_id: uid }, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
  if (error) throw new ServiceError(error.message, { code: error.code });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await rpcAny('mark_all_notifications_read');
}

// Admin fallback when pg_cron is not enabled: re-evaluates expiry / overdue alerts. Returns how many were created.
export async function refreshExpiryNotifications(): Promise<number> {
  return Number(await rpcAny<number>('run_expiry_notifications'));
}

export const affects: Record<string, CollectionKey[]> = {
  processApproval: ['approvalRequests', 'workOrders', 'invoices', 'expenses', 'notifications', 'auditLogs'],
  markNotificationAsRead: ['notifications'],
  markAllNotificationsAsRead: ['notifications'],
  refreshExpiryNotifications: ['notifications'],
};

// ---------------------------------------------------------------------------
// Reporting: AP / AR aging straight from v_invoice_aging
// ---------------------------------------------------------------------------
export interface AgingRow {
  companyId: string;
  partyId: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90Plus: number;
  total: number;
}

export async function fetchInvoiceAging(invoiceType: 'Purchase' | 'Sales'): Promise<AgingRow[]> {
  const rows = await unwrap<Row[]>(supabase.from('v_invoice_aging').select('*').eq('invoice_type', invoiceType) as any);
  return rows.map(r => {
    const a = {
      companyId: r.company_id as string,
      partyId: r.party_id as string,
      current: num(r.current_due),
      days1to30: num(r.days_1_30),
      days31to60: num(r.days_31_60),
      days61to90: num(r.days_61_90),
      days90Plus: num(r.days_90_plus),
    };
    return { ...a, total: a.current + a.days1to30 + a.days31to60 + a.days61to90 + a.days90Plus };
  });
}

// Pure helper used by the reports page (kept here so the date logic is testable)
export const monthKey = (d: string): string => ymd(d).slice(0, 7);
