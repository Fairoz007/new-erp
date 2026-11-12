import { describe, it, expect } from 'vitest';
import { friendlyMessage, toServiceError, isTransient, CONFLICT } from '../core';

describe('error mapping', () => {
  it('keeps messages our functions raise on purpose', () => {
    expect(friendlyMessage('P0001', 'Amount is above your approval limit (OMR 500)')).toBe('Amount is above your approval limit (OMR 500)');
    expect(friendlyMessage('42501', 'Permission denied: invoices.create')).toBe('Permission denied: invoices.create');
  });
  it('maps RLS, unique, foreign key and format errors', () => {
    expect(friendlyMessage('42501', 'new row violates row-level security policy')).toBe('Permission denied for this action.');
    expect(friendlyMessage('23505', 'duplicate key', 'Key (company_id, plate_number)=(x, y) already exists.')).toBe('A record with the same company id, plate number already exists.');
    expect(friendlyMessage('23503', 'violates foreign key')).toMatch(/linked to other records/);
    expect(friendlyMessage('22P02', 'invalid input syntax for type numeric')).toMatch(/wrong format/);
    expect(friendlyMessage('57014', 'canceling statement due to statement timeout')).toMatch(/took too long/);
  });
  it('recognises network failures and expired sessions', () => {
    expect(friendlyMessage(undefined, 'TypeError: Failed to fetch')).toMatch(/reach the server/);
    expect(friendlyMessage('PGRST301', 'JWT expired')).toMatch(/session has expired/);
    expect(isTransient(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransient({ code: '23505', message: 'dup' })).toBe(false);
  });
  it('wraps once and keeps the code', () => {
    const e = toServiceError({ message: 'x', code: '23514' });
    expect(e.code).toBe('23514');
    expect(toServiceError(e)).toBe(e);
    expect(friendlyMessage(CONFLICT, 'Changed by someone else')).toBe('Changed by someone else');
  });
});
