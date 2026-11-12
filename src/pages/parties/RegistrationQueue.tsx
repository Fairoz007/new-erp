// Client / supplier registrations waiting for approval (Approvals page tab). The database decides:
// review_party checks approve rights in the home office and blocks approving your own submission.
import React, { useState } from 'react';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { reviewParty } from '../../services/finance';
import { formatDate } from '../../utils/date';
import { ReviewModal } from './PartyDetailPage';
import type { Customer, Supplier } from '../../types/operations';

type Row = { kind: 'customer' | 'supplier'; party: Customer | Supplier; code: string };

export function usePendingRegistrations(): Row[] {
  const { customers, suppliers, selectedCompanyId } = useFleet();
  const rows: Row[] = [
    ...customers.filter(c => c.registration.status === 'Pending').map(c => ({ kind: 'customer' as const, party: c, code: c.customerId })),
    ...suppliers.filter(s => s.registration.status === 'Pending').map(s => ({ kind: 'supplier' as const, party: s, code: s.supplierId })),
  ];
  return selectedCompanyId === 'all' ? rows : rows.filter(r => r.party.officeId === selectedCompanyId);
}

export const RegistrationQueue: React.FC = () => {
  const { companies, reload } = useFleet();
  const { hasPermission, currentUser, isSuperAdmin, users } = useAuth();
  const { openPartyDetail, addToast } = useUI();
  const rows = usePendingRegistrations();
  const [review, setReview] = useState<{ row: Row; decision: 'Approved' | 'Rejected' } | null>(null);
  const officeName = (id: string) => companies.find(o => o.id === id)?.name ?? '—';
  const userName = (id: string | null) => (id && users.find(u => u.id === id)?.name) || 'Unknown user';

  if (rows.length === 0) {
    return <Card className="p-8 rounded-[20px] bg-white border border-slate-700 shadow-card text-center text-sm text-slate-400">No client or supplier registrations are waiting for approval.</Card>;
  }
  return (
    <div className="space-y-3">
      {rows.map(row => {
        const { party } = row;
        const module = row.kind === 'customer' ? 'customers' : 'suppliers';
        const own = party.registration.submittedBy === currentUser.id && !isSuperAdmin;
        const canSign = hasPermission('approve', module, party.officeId) && !own;
        return (
          <Card key={`${row.kind}:${party.id}`} className="p-4 rounded-[20px] bg-white border border-slate-700 shadow-card">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row.kind === 'customer' ? 'emerald' : 'blue'}>{row.kind === 'customer' ? 'Client' : 'Supplier'}</Badge>
                  <span className="font-mono text-[11px] text-slate-400">{row.code}</span>
                  <button type="button" className="font-bold text-slate-100 hover:text-forest-400 inline-flex items-center gap-1" onClick={() => openPartyDetail(row.kind, party.id)}>
                    {party.name} <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {officeName(party.officeId)} · VAT {party.vatNumber || '—'} · CR {party.crNumber || '—'} · {party.email || 'no email'}
                </p>
                <p className="text-[11px] text-slate-400">Submitted by {userName(party.registration.submittedBy)}{party.createdAt ? ` on ${formatDate(party.createdAt)}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {canSign ? (
                  <>
                    <Button variant="danger" size="sm" className="rounded-full" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => setReview({ row, decision: 'Rejected' })}>Reject</Button>
                    <Button variant="success" size="sm" className="rounded-full" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={() => setReview({ row, decision: 'Approved' })}>Approve</Button>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400">{own ? 'You submitted this; another approver must review it.' : 'Waiting for an approver in this office.'}</span>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      {review && (
        <ReviewModal decision={review.decision} name={review.row.party.name} onClose={() => setReview(null)}
          onSubmit={async note => {
            await reviewParty(review.row.kind === 'customer' ? 'Customer' : 'Supplier', review.row.party.id, review.decision, note);
            await reload([review.row.kind === 'customer' ? 'customers' : 'suppliers']);
            addToast({ type: review.decision === 'Approved' ? 'success' : 'warning', title: `Registration ${review.decision.toLowerCase()}`, message: review.row.party.name });
          }} />
      )}
    </div>
  );
};
