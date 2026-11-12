import { describe, expect, it, vi } from 'vitest';
import { validate, hasErrors, required, positive, notNegative, atMost, email, phone, isDate, onOrAfter, maxLength, RULES, fieldForDbMessage } from '../validation';
import { confirmDiscard, hasUnsavedChanges, markDirty } from '../unsaved';

describe('validation checks', () => {
  it('required treats blank strings, null and undefined as missing', () => {
    const c = required('Name');
    expect(c('')).toBe('Name is required');
    expect(c('   ')).toBe('Name is required');
    expect(c(undefined)).toBe('Name is required');
    expect(c(0)).toBeNull();
    expect(c('x')).toBeNull();
  });
  it('positive and notNegative read numbers and numeric strings', () => {
    expect(positive('Amount')(0)).toBe('Amount must be greater than zero');
    expect(positive('Amount')('2.5')).toBeNull();
    expect(positive('Amount', RULES.expenseTotalPositive)(-1)).toBe(RULES.expenseTotalPositive);
    expect(notNegative('Tax')(-0.001)).toBe('Tax cannot be negative');
    expect(notNegative('Tax')('')).toBeNull();
  });
  it('atMost, maxLength, email, phone, isDate, onOrAfter', () => {
    expect(atMost('Amount', 10)(10)).toBeNull();
    expect(atMost('Amount', 10)(10.01)).toMatch(/cannot be more than 10/);
    expect(maxLength('Code', 3)('abcd')).toMatch(/at most 3/);
    expect(email()('a@b.co')).toBeNull();
    expect(email()('a@b')).toMatch(/not a valid email/);
    expect(phone()('+968 9123 4567')).toBeNull();
    expect(phone()('abc')).toMatch(/not a valid phone/);
    expect(isDate('Date')('2026-11-12')).toBeNull();
    expect(isDate('Date')('12/11/2026')).toMatch(/YYYY-MM-DD/);
    expect(onOrAfter('Due date', '2026-11-12', 'the invoice date')('2026-11-11')).toBe('Due date must be on or after the invoice date');
    expect(onOrAfter('Due date', '2026-11-12', 'the invoice date')('2026-11-12')).toBeNull();
  });
  it('validate keeps the first failing check per field', () => {
    const e = validate({ amount: '', date: '2026-01-01' }, { amount: [required('Amount'), positive('Amount')], date: [required('Date')] });
    expect(e).toEqual({ amount: 'Amount is required' });
    expect(hasErrors(e)).toBe(true);
    expect(hasErrors({})).toBe(false);
  });
  it('maps database messages back to fields', () => {
    const map = { amount: [RULES.paymentAmountRange], method: [RULES.paymentMethodRequired] };
    expect(fieldForDbMessage('Payment amount must be between 0 and outstanding 55.000', map)).toBe('amount');
    expect(fieldForDbMessage('Payment method is required', map)).toBe('method');
    expect(fieldForDbMessage('Something else', map)).toBeNull();
    expect(RULES.paymentAmountRange('55.000')).toBe('Payment amount must be between 0 and outstanding 55.000');
  });
});

describe('unsaved-changes guard', () => {
  it('asks only when something is dirty and clears on agreement', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm });
    expect(confirmDiscard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    markDirty('f1', true);
    expect(hasUnsavedChanges()).toBe(true);
    expect(confirmDiscard('other')).toBe(true);
    expect(confirmDiscard()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(hasUnsavedChanges()).toBe(false);
  });
  it('keeps the edits when the user cancels', () => {
    vi.stubGlobal('window', { confirm: () => false });
    markDirty('f2', true);
    expect(confirmDiscard('f2')).toBe(false);
    expect(hasUnsavedChanges()).toBe(true);
    markDirty('f2', false);
  });
});
