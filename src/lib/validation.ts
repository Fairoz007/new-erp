// One validation approach for every form.
//
// * A form describes its rules with these helpers and calls validate(); each failing field gets a
//   message, shown inline under the field (Input/Select/Textarea `error`), and the first invalid
//   field receives focus on submit (useDialog / focusFirstInvalid).
// * The database checks the same rules (constraints, triggers, RPCs). Where the database has a
//   message for a rule, the browser uses the SAME text, from RULES below, so the user sees one
//   wording whichever side catches it. supabase/tests/validation_messages.test.mjs triggers each
//   database rule and checks its message against RULES.

export type Errors<K extends string = string> = Partial<Record<K, string>>;
export type Check = (v: unknown) => string | null;

/** Messages shared with the database (keep in sync: validation_messages.test.mjs). */
export const RULES = {
  paymentDateRequired: 'Payment date is required',
  paymentMethodRequired: 'Payment method is required',
  paymentAmountRange: (outstanding: string) => `Payment amount must be between 0 and outstanding ${outstanding}`,
  invoiceTotalPositive: 'Invoice total must be greater than zero',
  expenseTotalPositive: 'The expense total must be greater than zero',
  journalDateRequired: 'Journal date is required',
  journalDescriptionRequired: 'Journal description is required',
  journalTwoLines: 'A journal entry needs at least two lines',
  journalLineSide: 'Each journal line must be either a positive debit or a positive credit',
  creditAmountPositive: 'Credit amount must be greater than zero',
  creditReasonRequired: 'A reason is required for a credit note',
  rejectReasonRequired: 'A reason is required to reject',
} as const;

const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const asNum = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

export const required = (label: string, message?: string): Check => v => (empty(v) ? message ?? `${label} is required` : null);
export const positive = (label: string, message?: string): Check => v => (!(asNum(v) > 0) ? message ?? `${label} must be greater than zero` : null);
export const notNegative = (label: string): Check => v => (!empty(v) && !(asNum(v) >= 0) ? `${label} cannot be negative` : null);
export const isNumber = (label: string): Check => v => (!empty(v) && !Number.isFinite(asNum(v)) ? `${label} must be a number` : null);
export const maxLength = (label: string, n: number): Check => v => (typeof v === 'string' && v.length > n ? `${label} must be at most ${n} characters` : null);
export const atMost = (label: string, max: number, message?: string): Check => v => (asNum(v) > max + 1e-9 ? message ?? `${label} cannot be more than ${max}` : null);
export const email = (label = 'Email'): Check => v => (!empty(v) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? `${label} is not a valid email address` : null);
export const phone = (label = 'Phone'): Check => v => (!empty(v) && !/^\+?[0-9 ()-]{6,20}$/.test(String(v).trim()) ? `${label} is not a valid phone number` : null);
export const isDate = (label: string): Check => v => (!empty(v) && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${label} must be a date (YYYY-MM-DD)` : null);
/** `v` (YYYY-MM-DD) must be on or after `other`. */
export const onOrAfter = (label: string, other: string | undefined, otherLabel: string): Check =>
  v => (!empty(v) && other && String(v) < other ? `${label} must be on or after ${otherLabel}` : null);

/** Run the checks per field; the first failing check of each field wins. */
export function validate<K extends string>(values: Record<K, unknown>, schema: Partial<Record<K, Check[]>>): Errors<K> {
  const out: Errors<K> = {};
  for (const k of Object.keys(schema) as K[]) {
    for (const c of schema[k] ?? []) { const m = c(values[k]); if (m) { out[k] = m; break; } }
  }
  return out;
}
export const hasErrors = (e: Errors) => Object.values(e).some(Boolean);

/** Focus the first invalid field inside `root` (after the errors have rendered). */
export function focusFirstInvalid(root: ParentNode | null = typeof document !== 'undefined' ? document : null): void {
  if (!root) return;
  setTimeout(() => (root.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 0);
}

/** Map a database error message to the field it concerns, when it is one of RULES. */
export function fieldForDbMessage<K extends string>(message: string, map: Partial<Record<K, (string | ((...a: string[]) => string))[]>>): K | null {
  for (const [field, msgs] of Object.entries(map) as [K, (string | ((...a: string[]) => string))[]][]) {
    for (const m of msgs) {
      const text = typeof m === 'function' ? m('').trim() : m;
      if (message.startsWith(text)) return field;
    }
  }
  return null;
}
