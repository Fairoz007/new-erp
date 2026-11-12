import { describe, it, expect, vi, afterEach } from 'vitest';
import { keyedFetch, withRequestKey, currentRequestKey } from '../requestKey';

const seen: (string | null)[] = [];
afterEach(() => { seen.length = 0; vi.unstubAllGlobals(); });
const stub = () => vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init: RequestInit = {}) => {
  seen.push(new Headers(init.headers).get('x-request-key')); return new Response('{}');
}));

describe('request keys', () => {
  it('adds the key to writes made during a keyed save, not to reads or other saves', async () => {
    stub();
    await withRequestKey('11111111-1111-4111-8111-111111111111', async () => {
      await keyedFetch('/rest/v1/rpc/record_payment', { method: 'POST' });
      await keyedFetch('/rest/v1/invoices', { method: 'GET' });
    });
    await keyedFetch('/rest/v1/expenses', { method: 'POST' });
    expect(seen).toEqual(['11111111-1111-4111-8111-111111111111', null, null]);
    expect(currentRequestKey()).toBeNull();
  });
  it('refuses writes while offline, allows reads', async () => {
    stub();
    vi.stubGlobal('navigator', { onLine: false });
    await expect(keyedFetch('/rest/v1/expenses', { method: 'POST' })).rejects.toThrow(/offline/);
    await keyedFetch('/rest/v1/expenses', { method: 'GET' });
    expect(seen).toEqual([null]);
  });
  it('clears the key when the save fails', async () => {
    stub();
    await expect(withRequestKey('k', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(currentRequestKey()).toBeNull();
  });
});
