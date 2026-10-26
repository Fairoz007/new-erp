import React, { useState } from 'react';
import { CheckSquare, CheckCircle2, XCircle, Clock, ShieldCheck, UserCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const ApprovalsPage: React.FC = () => {
  const { approvalRequests, processApproval, currency } = useFleet();
  const { currentUser, canApprove } = useAuth();
  const { addToast } = useUI();

  const [selectedRequest, setSelectedRequest] = useState<typeof approvalRequests[0] | null>(null);
  const [actionType, setActionType] = useState<'Approved' | 'Rejected'>('Approved');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpenActionModal = (req: typeof approvalRequests[0], action: 'Approved' | 'Rejected') => {
    setSelectedRequest(req);
    setActionType(action);
    setComment('');
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || submitting) return;
    const reqModule = selectedRequest.referenceType === 'WorkOrder' ? 'maintenance' : selectedRequest.referenceType === 'Invoice' ? 'invoice' : 'expense';
    if (!canApprove(reqModule, selectedRequest.amount)) {
      addToast({
        type: 'error',
        title: 'Authorization Required',
        message: `Your active role (${currentUser.role}) does not have signing authority for ${selectedRequest.referenceType} of ${formatCurrency(selectedRequest.amount, currency)}.`,
      });
      return;
    }

    if (!comment.trim()) {
      addToast({ type: 'warning', title: 'Comment Required', message: 'Please enter a signoff justification before confirming.' });
      return;
    }

    setSubmitting(true);
    try {
      // The database re-checks role, company and threshold and records the signer.
      await processApproval(selectedRequest.id, actionType, comment.trim(), currentUser);
      addToast({
        type: actionType === 'Approved' ? 'success' : 'warning',
        title: `Request ${actionType}`,
        message: `${selectedRequest.referenceNumber} has been ${actionType.toLowerCase()}.`,
      });
      setSelectedRequest(null);
    } catch (e) {
      addToast({ type: 'error', title: 'Approval failed', message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Multi-Tier Authorization & Approval Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Sign off on work orders, invoices and expenses that exceed the approval thresholds configured in Settings.
          </p>
        </div>
      </div>

      {/* Approval Requests List */}
      <div className="space-y-4">
        {approvalRequests.length === 0 && (
          <Card className="p-8 rounded-[20px] bg-white border border-slate-700 shadow-card text-center">
            <p className="text-sm font-semibold text-slate-200">No approval requests</p>
            <p className="text-xs text-slate-400 mt-1">Requests appear here when a work order, invoice or expense exceeds an approval threshold.</p>
          </Card>
        )}
        {approvalRequests.map(req => {
          const reqModule = req.referenceType === 'WorkOrder' ? 'maintenance' : req.referenceType === 'Invoice' ? 'invoice' : 'expense';
          const userCanSign = canApprove(reqModule, req.amount);

          return (
            <Card key={req.id} className="p-5 sm:p-6 rounded-[20px] bg-white border border-slate-700 shadow-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-100">{req.referenceNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-forest-700 font-mono text-xs font-semibold">
                      {req.referenceType}
                    </span>
                    <StatusBadge status={req.status} size="sm" />
                    <span className="text-xs text-slate-400">
                      Level {req.currentLevel} of {req.totalLevels}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200">{req.notes}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>Requested By: <strong>{req.requestedByName}</strong></span>
                    <span>Date: {formatDate(req.requestedDate)}</span>
                    <span>Required Roles: <strong>{req.requiredRoles.join(' → ')}</strong></span>
                  </div>

                  {/* History Logs */}
                  {req.history.length > 0 && (
                    <div className="p-3 bg-slate-850/80 rounded-xl border border-slate-700/80 space-y-1.5 mt-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Signoff History</p>
                      {req.history.map((h, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">
                            <strong>{h.approverName}</strong> ({h.approverRole}): <em>&ldquo;{h.comment}&rdquo;</em>
                          </span>
                          <span className="text-slate-500 font-mono">{formatDate(h.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Amount & Actions */}
                <div className="flex flex-row lg:flex-col items-end justify-between lg:justify-center gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-700/80">
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Expenditure Amount</p>
                    <p className="text-lg font-bold text-slate-100">{formatCurrency(req.amount, currency)}</p>
                  </div>

                  {req.status === 'Pending' && (
                    <div className="flex items-center gap-2">
                      {userCanSign ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            className="rounded-full"
                            onClick={() => handleOpenActionModal(req, 'Rejected')}
                            leftIcon={<XCircle className="w-4 h-4" />}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="success"
                            size="sm"
                            className="rounded-full shadow-sm"
                            onClick={() => handleOpenActionModal(req, 'Approved')}
                            leftIcon={<CheckCircle2 className="w-4 h-4" />}
                          >
                            Approve Signoff
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={`${actionType} Authorization Request: ${selectedRequest?.referenceNumber}`}
        description={`Sign as ${currentUser.name} (${currentUser.role})`}
        size="md"
      >
        <div className="space-y-4">
          <Textarea
            label="Signoff Comment / Audit Justification"
            placeholder="Add comments regarding approval or rejection rationale..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setSelectedRequest(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={actionType === 'Approved' ? 'success' : 'danger'}
              size="sm"
              onClick={handleConfirmAction}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : `Confirm ${actionType}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
