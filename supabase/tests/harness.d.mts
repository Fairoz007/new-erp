// Types for harness.mjs, so TypeScript tests (Vitest) can import it.
export const IDS: Record<'ADMIN' | 'VIEWER' | 'FLEET' | 'OTHER' | 'HO' | 'DQ', string>;
type Q = { rows: any[] };
export interface Harness {
  db: { query(sql: string, params?: unknown[]): Promise<Q>; exec(sql: string): Promise<Q[]> };
  check(name: string, fn: () => unknown, expectError?: string | boolean): Promise<void>;
  as(uid: string, sql: string, params?: unknown[]): Promise<Q>;
  tx(uid: string, sql: string): Promise<void>;
  asServer(sql: string, params?: unknown[]): Promise<Q>;
  one(uid: string, sql: string): Promise<any>;
  assert(cond: unknown, msg?: string): void;
  results: [string, string, unknown][];
  report(): void;
}
export function setup(dir?: string, opts?: { quiet?: boolean; order?: (files: string[]) => string[] }): Promise<Harness>;
export function seedFixtures(db: Harness['db']): Promise<void>;
