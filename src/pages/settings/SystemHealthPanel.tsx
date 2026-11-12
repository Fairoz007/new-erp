// Settings → System health (Super Admins only; the database refuses everyone else).
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useQuery } from '../../lib/queryCache';
import { EXPECTED_JOBS, fetchRecentClientErrors, fetchSystemHealth, migrationState } from '../../services/systemHealth';
import { fetchSetupChecklist } from '../../services/org';
import { formatFileSize } from '../../services/storage';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '—');
const Ok = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) =>
  <Badge variant={ok === null ? 'slate' : ok ? 'emerald' : 'amber'}>{children}</Badge>;

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
      <CardHeader action={action}><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="text-xs">{children}</CardContent>
    </Card>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="text-slate-400">{head.map(h => <th key={h} scope="col" className="py-1.5 pr-4 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-700/60">{r.map((c, j) => <td key={j} className="py-1.5 pr-4 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function SystemHealthPanel() {
  const health = useQuery('system-health', ['client_errors'], fetchSystemHealth);
  const errors = useQuery('client-errors:20', ['client_errors'], () => fetchRecentClientErrors(20));
  const checklist = useQuery('setup-checklist', ['organizations', 'companies', 'accounts', 'bank_accounts'], fetchSetupChecklist);
  const refresh = () => { void health.refetch(); void errors.refetch(); void checklist.refetch(); };
  const h = health.data;

  if (health.error) return <Section title="System health"><p className="text-rose-600" role="alert">{health.error.message}</p></Section>;
  if (!h) return <Section title="System health"><p className="text-slate-400">Checking…</p></Section>;

  const mig = migrationState(h.migrations?.latest, __LATEST_MIGRATION__);
  const jobs = h.cronJobs ?? [];
  const missingJobs = h.cronJobs ? EXPECTED_JOBS.filter(j => !jobs.some(x => x.name === j)) : [];

  return (
    <div className="space-y-4">
      <Section title="Database" action={<Button variant="ghost" size="xs" onClick={refresh} leftIcon={<RefreshCw className="w-3.5 h-3.5" />} disabled={health.fetching}>Check again</Button>}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <dt className="text-slate-400">Checked</dt><dd>{when(h.checkedAt)}</dd>
          <dt className="text-slate-400">Migrations applied</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {h.migrations ? <span className="tabular-nums">{h.migrations.count} · newest {h.migrations.latest ?? '—'}</span> : <span>not readable on this database</span>}
            <Ok ok={mig === 'unknown' ? null : mig === 'ok'}>
              {mig === 'ok' ? 'up to date' : mig === 'behind' ? `this app expects ${__LATEST_MIGRATION__}` : mig === 'ahead' ? 'database is newer than this app' : 'not compared'}
            </Ok>
          </dd>
          <dt className="text-slate-400">Browser errors reported</dt>
          <dd className="tabular-nums">{h.clientErrors24h} in 24 hours · {h.clientErrors7d} in 7 days</dd>
        </dl>
      </Section>

      <Section title="Scheduled jobs">
        {h.cronJobs === null ? <p className="text-slate-400">pg_cron is not installed on this database; run the jobs from a scheduler (docs/OPERATIONS.md §9).</p> : (
          <>
            <Table head={['Job', 'Schedule', 'State', 'Last run', 'Result']} rows={jobs.map(j => [
              j.name, <code key="s">{j.schedule}</code>, <Ok key="a" ok={j.active}>{j.active ? 'active' : 'paused'}</Ok>, when(j.lastRun),
              j.lastStatus ? <Ok key="r" ok={j.lastStatus === 'succeeded'}>{j.lastStatus}</Ok> : 'never run',
            ])} />
            {missingJobs.length > 0 && <p className="mt-2 text-amber-600" role="alert">Not scheduled: {missingJobs.join(', ')}</p>}
          </>
        )}
      </Section>

      <Section title="File storage">
        {!h.buckets ? <p className="text-slate-400">Storage buckets are not readable on this database.</p> : (
          <Table head={['Bucket', 'Access', 'Size limit', 'Allowed types']} rows={h.buckets.map(b => [
            b.id, <Ok key="p" ok={!b.public}>{b.public ? 'public' : 'private'}</Ok>,
            b.fileSizeLimit ? formatFileSize(b.fileSizeLimit) : <Ok key="l" ok={false}>no limit</Ok>,
            b.allowedMimeTypes?.length ? b.allowedMimeTypes.join(', ') : <Ok key="t" ok={false}>any type</Ok>,
          ])} />
        )}
      </Section>

      <Section title="Setup checklist">
        {checklist.error ? <p className="text-rose-600" role="alert">{checklist.error.message}</p> : !checklist.data ? <p className="text-slate-400">Checking…</p> : (
          <ul className="space-y-1.5">
            {checklist.data.map(c => (
              <li key={c.key} className="flex flex-wrap items-center gap-2">
                <Ok ok={c.ok}>{c.ok ? 'done' : 'to do'}</Ok><span>{c.label}</span>{c.detail && <span className="text-slate-400">{c.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Latest browser errors">
        {errors.error ? <p className="text-rose-600" role="alert">{errors.error.message}</p> : !errors.data ? <p className="text-slate-400">Loading…</p> :
          errors.data.length === 0 ? <p className="text-slate-400">No errors reported.</p> : (
            <Table head={['When', 'Page', 'Kind', 'Message', 'Release']} rows={errors.data.map(e => [
              when(e.occurredAt), e.page ?? '—', e.kind, <span key="m" className="block max-w-[28rem] truncate" title={e.message}>{e.message}</span>, e.appVersion ?? '—',
            ])} />
          )}
      </Section>
    </div>
  );
}
