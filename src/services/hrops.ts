// HR operations: attendance, leave (requests, balances, adjustments) and recurring pay components.
// The office of every row comes from the employee (database trigger). RLS modules: attendance,
// leave, payroll. Leave status changes only through review_leave().
import { ServiceError, num, nul, rpcAny, supabase, unwrap, unwrapOne, ymd } from './core';

type Row = Record<string, any>;
const table = (name: string): any => (supabase as any).from(name);

// ---------------------------------------------------------------- attendance
export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Half Day' | 'On Leave' | 'Holiday' | 'Weekend';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Holiday', 'Weekend'];
export interface Attendance {
  id: string; companyId: string; employeeId: string; workDate: string; status: AttendanceStatus;
  checkIn: string; checkOut: string; overtimeHours: number; leaveRequestId: string | null; notes: string;
}
const rowToAttendance = (r: Row): Attendance => ({
  id: r.id, companyId: r.company_id, employeeId: r.employee_id, workDate: ymd(r.work_date), status: r.status,
  checkIn: (r.check_in ?? '').slice(0, 5), checkOut: (r.check_out ?? '').slice(0, 5), overtimeHours: num(r.overtime_hours),
  leaveRequestId: r.leave_request_id ?? null, notes: r.notes ?? '',
});

export async function fetchAttendance(from: string, to: string): Promise<Attendance[]> {
  const rows = await unwrap<Row[]>(table('attendance').select('*').gte('work_date', from).lte('work_date', to).order('work_date'));
  return (rows ?? []).map(rowToAttendance);
}

export interface AttendanceInput { employeeId: string; workDate: string; status: AttendanceStatus; checkIn?: string; checkOut?: string; overtimeHours?: number; notes?: string }
export function validateAttendance(a: AttendanceInput): string | null {
  if (!a.employeeId) return 'Employee is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.workDate)) return 'Date must be YYYY-MM-DD.';
  if (!ATTENDANCE_STATUSES.includes(a.status)) return `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`;
  for (const t of [a.checkIn, a.checkOut]) if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return 'Times must be HH:MM (24-hour).';
  if (a.checkIn && a.checkOut && a.checkOut <= a.checkIn) return 'Check-out must be after check-in.';
  const ot = a.overtimeHours ?? 0;
  if (!(ot >= 0 && ot <= 16)) return 'Overtime must be between 0 and 16 hours.';
  return null;
}

/** Saves one day for one employee (insert or replace that day's row). */
export async function saveAttendance(a: AttendanceInput, companyId: string): Promise<Attendance> {
  const err = validateAttendance(a);
  if (err) throw new ServiceError(err);
  const row = await unwrapOne<Row>(table('attendance').upsert({
    company_id: companyId, employee_id: a.employeeId, work_date: a.workDate, status: a.status,
    check_in: nul(a.checkIn), check_out: nul(a.checkOut), overtime_hours: a.overtimeHours ?? 0, notes: nul(a.notes),
  }, { onConflict: 'employee_id,work_date' }).select('*').single());
  return rowToAttendance(row);
}

export async function deleteAttendance(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('attendance').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('You cannot delete this attendance record.');
}

// ---------------------------------------------------------------- leave
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export interface LeaveRequest {
  id: string; companyId: string; employeeId: string; leaveTypeId: string; startDate: string; endDate: string; days: number;
  reason: string; documentPath: string; status: LeaveStatus; requestedBy: string | null; reviewedBy: string | null;
  reviewedAt: string | null; reviewNote: string; createdAt: string;
}
const rowToLeave = (r: Row): LeaveRequest => ({
  id: r.id, companyId: r.company_id, employeeId: r.employee_id, leaveTypeId: r.leave_type_id, startDate: ymd(r.start_date), endDate: ymd(r.end_date),
  days: num(r.days), reason: r.reason ?? '', documentPath: r.document_path ?? '', status: r.status, requestedBy: r.requested_by ?? null,
  reviewedBy: r.reviewed_by ?? null, reviewedAt: r.reviewed_at ?? null, reviewNote: r.review_note ?? '', createdAt: r.created_at,
});

export async function fetchLeaveRequests(year: number): Promise<LeaveRequest[]> {
  const rows = await unwrap<Row[]>(table('leave_requests').select('*').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
    .order('start_date', { ascending: false }));
  return (rows ?? []).map(rowToLeave);
}

export interface LeaveInput { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; reason: string; documentPath?: string }
export async function requestLeave(v: LeaveInput, companyId: string): Promise<LeaveRequest> {
  if (!v.employeeId || !v.leaveTypeId) throw new ServiceError('Choose the employee and the leave type.');
  if (!v.startDate || !v.endDate) throw new ServiceError('Start and end dates are required.');
  if (v.endDate < v.startDate) throw new ServiceError('The end date cannot be before the start date.');
  if (v.startDate.slice(0, 4) !== v.endDate.slice(0, 4)) throw new ServiceError('Split leave that crosses the year end into two requests.');
  const row = await unwrapOne<Row>(table('leave_requests').insert({
    company_id: companyId, employee_id: v.employeeId, leave_type_id: v.leaveTypeId, start_date: v.startDate, end_date: v.endDate,
    reason: nul(v.reason), document_path: nul(v.documentPath),
  }).select('*').single());
  return rowToLeave(row);
}

/** Pending leave requests the caller can see (sidebar badge). */
export async function countPendingLeave(): Promise<number> {
  const { count, error } = await table('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'Pending');
  if (error) throw new ServiceError(error.message);
  return count ?? 0;
}

export async function withdrawLeave(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('leave_requests').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('Only a pending request can be withdrawn.');
}

export const reviewLeave = (id: string, decision: 'Approved' | 'Rejected' | 'Cancelled', note?: string) =>
  rpcAny('review_leave', { p_id: id, p_decision: decision, p_note: note ?? null });

export interface LeaveBalance { entitlement: number | null; adjustments: number; taken: number; pending: number; remaining: number | null }
export async function leaveBalance(employeeId: string, leaveTypeId: string, year: number): Promise<LeaveBalance> {
  const r = await rpcAny<Row[] | Row>('leave_balance', { p_employee: employeeId, p_type: leaveTypeId, p_year: year });
  const row = (Array.isArray(r) ? r[0] : r) ?? {};
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { entitlement: n(row.entitlement), adjustments: Number(row.adjustments ?? 0), taken: Number(row.taken ?? 0), pending: Number(row.pending ?? 0), remaining: n(row.remaining) };
}

export async function addLeaveAdjustment(v: { employeeId: string; leaveTypeId: string; year: number; days: number; reason: string }, companyId: string): Promise<void> {
  if (!v.days) throw new ServiceError('Days cannot be zero.');
  if (!v.reason.trim()) throw new ServiceError('A reason is required (e.g. "Carried forward from last year").');
  await unwrap(table('leave_adjustments').insert({
    company_id: companyId, employee_id: v.employeeId, leave_type_id: v.leaveTypeId, year: v.year, days: v.days, reason: v.reason.trim(),
  }));
}

// ---------------------------------------------------------------- recurring pay components
export interface EmployeePayComponent { id: string; employeeId: string; componentId: string; amount: number; startDate: string; endDate: string; notes: string }
const rowToEpc = (r: Row): EmployeePayComponent => ({
  id: r.id, employeeId: r.employee_id, componentId: r.component_id, amount: num(r.amount), startDate: ymd(r.start_date), endDate: ymd(r.end_date), notes: r.notes ?? '',
});
export async function fetchEmployeePayComponents(employeeId: string): Promise<EmployeePayComponent[]> {
  const rows = await unwrap<Row[]>(table('employee_pay_components').select('*').eq('employee_id', employeeId).order('start_date'));
  return (rows ?? []).map(rowToEpc);
}
export async function saveEmployeePayComponent(v: Omit<EmployeePayComponent, 'id'> & { id?: string }, companyId: string): Promise<void> {
  if (!v.componentId) throw new ServiceError('Choose the allowance or deduction.');
  if (!(v.amount > 0)) throw new ServiceError('The amount must be more than zero.');
  if (!v.startDate) throw new ServiceError('Start date is required.');
  if (v.endDate && v.endDate < v.startDate) throw new ServiceError('The end date cannot be before the start date.');
  if (v.id) {
    await unwrap(table('employee_pay_components').update({ component_id: v.componentId, amount: v.amount, start_date: v.startDate, end_date: nul(v.endDate), notes: nul(v.notes) }).eq('id', v.id));
  } else {
    await unwrap(table('employee_pay_components').insert({
      company_id: companyId, employee_id: v.employeeId, component_id: v.componentId, amount: v.amount, start_date: v.startDate, end_date: nul(v.endDate), notes: nul(v.notes),
    }));
  }
}
export async function deleteEmployeePayComponent(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('employee_pay_components').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('You cannot delete this line.');
}
