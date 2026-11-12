// Settings → System health (Super Admins): what system_health() reports, the newest client error
// reports, and the setup checklist. Everything is read from the database; nothing is assumed.
import { supabase } from '../lib/supabase';
import { rpcAny, toServiceError } from './core';

export interface CronJob { name: string; schedule: string; active: boolean; lastRun: string | null; lastStatus: string | null }
export interface BucketInfo { id: string; public: boolean; fileSizeLimit: number | null; allowedMimeTypes: string[] | null }
export interface SystemHealth {
  checkedAt: string;
  migrations: { count: number; latest: string | null } | null;
  cronJobs: CronJob[] | null;
  buckets: BucketInfo[] | null;
  clientErrors24h: number;
  clientErrors7d: number;
}
export interface ClientErrorRow { id: string; occurredAt: string; page: string | null; kind: string; message: string; appVersion: string | null }

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const r = await rpcAny<any>('system_health');
  return {
    checkedAt: r.checked_at,
    migrations: r.migrations ? { count: Number(r.migrations.count), latest: r.migrations.latest ?? null } : null,
    cronJobs: r.cron_jobs ? (r.cron_jobs as any[]).map(j => ({ name: j.name, schedule: j.schedule, active: !!j.active, lastRun: j.last_run ?? null, lastStatus: j.last_status ?? null })) : null,
    buckets: r.buckets ? (r.buckets as any[]).map(b => ({ id: b.id, public: !!b.public, fileSizeLimit: b.file_size_limit ?? null, allowedMimeTypes: b.allowed_mime_types ?? null })) : null,
    clientErrors24h: Number(r.client_errors_24h ?? 0),
    clientErrors7d: Number(r.client_errors_7d ?? 0),
  };
}

export async function fetchRecentClientErrors(limit = 20): Promise<ClientErrorRow[]> {
  const { data, error } = await (supabase as any).from('client_errors')
    .select('id, occurred_at, page, kind, message, app_version').order('occurred_at', { ascending: false }).limit(limit);
  if (error) throw toServiceError(error);
  return (data ?? []).map((r: any) => ({ id: String(r.id), occurredAt: r.occurred_at, page: r.page, kind: r.kind, message: r.message, appVersion: r.app_version }));
}

/** Jobs the migrations schedule (docs/OPERATIONS.md §9); a missing one is reported. */
export const EXPECTED_JOBS = ['refresh-expiry-notifications', 'daily-finance-jobs', 'purge-client-errors', 'purge-request-keys'];

/** Compare the build's newest migration with the newest applied one (timestamps, e.g. 20261113004000). */
export function migrationState(applied: string | null | undefined, inBuild: string): 'ok' | 'behind' | 'ahead' | 'unknown' {
  if (!applied || !inBuild) return 'unknown';
  if (applied === inBuild) return 'ok';
  return applied < inBuild ? 'behind' : 'ahead';
}
