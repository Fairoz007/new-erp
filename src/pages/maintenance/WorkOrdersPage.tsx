import React, { useState } from 'react';
import { useVehicleTypeFilter } from '../../hooks/useVehicleTypeFilter';
import { Plus, CheckCircle2, Eye } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import { WorkOrder, WorkOrderStatus } from '../../types/maintenance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { WorkOrderDetailModal } from './WorkOrderDetailModal';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { PageHeader } from '../../components/ui/PageHeader';
import { buttonLike, clickOnKey } from '../../lib/a11y';

export const WorkOrdersPage: React.FC = () => {
  const { workOrders, updateWorkOrderStatus, selectedCompanyId, currency } = useFleet();
  const { openQuickModal, addToast, openVehicleDetail } = useUI();
  const { hasPermission, canApprove } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [busyId, setBusyId] = useState<string | null>(null); // work order with a status change in flight
  const [viewingOrder, setViewingOrder] = useState<WorkOrder | null>(null);
  const canCreate = hasPermission('create', 'work-orders');
  const canEdit = hasPermission('edit', 'work-orders');

  const [statusFilter, setStatusFilter] = useState('open');
  const [shown, setShown] = useState(40);
  const OPEN_STATUSES = ['Draft', 'Requested', 'Approved', 'Scheduled', 'In Progress', 'Waiting for Parts'];
  const vt = useVehicleTypeFilter();
  const filteredOrders = workOrders.filter(wo => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && wo.companyId !== selectedCompanyId) return false;
    if (statusFilter === 'open' && !OPEN_STATUSES.includes(wo.status)) return false;
    if (statusFilter !== 'open' && statusFilter !== 'all' && wo.status !== statusFilter) return false;
    if (!vt.matches(wo.vehicleId)) return false;
    return true;
  });

  const handleStatusChange = async (orderId: string, newStatus: WorkOrderStatus) => {
    if (busyId) return;
    const order = workOrders.find(w => w.id === orderId);
    if (!order) return;
    if (!hasPermission('edit', 'work-orders')) {
      addToast({ type: 'error', title: 'Permission denied', message: 'Your role cannot update work orders.' });
      return;
    }
    if (order.approvalStatus === 'Pending' && newStatus !== 'Cancelled') {
      addToast({ type: 'warning', title: 'Approval pending', message: 'This work order must be approved in the Approvals module before work can start.' });
      return;
    }
    if (newStatus === 'Approved' && !canApprove('maintenance', order.finalCost || order.estimatedCost || 0)) {
      addToast({ type: 'error', title: 'Approval limit exceeded', message: 'Your role cannot approve a work order of this value.' });
      return;
    }
    if (newStatus === 'Completed' && order.status === 'Requested') {
      addToast({ type: 'error', title: 'Approval Required', message: 'Approve and start the work order before completing it.' });
      return;
    }
    if (newStatus === 'Cancelled' && !window.confirm(`Cancel work order ${order.workOrderNumber}?`)) return;
    setBusyId(orderId);
    try {
      await updateWorkOrderStatus(orderId, newStatus);
      addToast({
        type: 'success',
        title: 'Work Order Updated',
        message: `Status updated to ${newStatus}${newStatus === 'Completed' ? ' and the maintenance record was created.' : '.'}`,
      });
      if (viewingOrder?.id === orderId) {
        setViewingOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Could not update work order', message: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const priorityColors = {
    Low: 'text-slate-400 bg-slate-800 border-transparent',
    Medium: 'text-[#1E40AF] bg-[#DBEAFE] border-transparent',
    High: 'text-[#92400E] bg-[#FEF3C7] border-transparent',
    Critical: 'text-[#9F1239] bg-[#FFE4E6] border-transparent animate-pulse',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Maintenance Work Orders"
        description="Dispatch, track workshop jobs, approve multi-tier repair estimates, and mark completed jobs to generate their maintenance record."
        actions={
          <>
            <Tabs
              variant="segmented"
              activeTab={viewMode}
              onChange={id => setViewMode(id as 'list' | 'kanban')}
              tabs={[{ id: 'list', label: 'List View' }, { id: 'kanban', label: 'Kanban Board' }]}
            />
            {canCreate && (
              <Button
                variant="primary"
                size="md"
                onClick={() => openQuickModal('add-work-order')}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create Work Order
              </Button>
            )}
          </>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-700 rounded-2xl shadow-card text-xs">
        <span className="text-slate-400 font-semibold px-1">Filter View:</span>
        <Tabs
          variant="pills"
          ariaLabel="Work order status"
          className="pb-0 min-w-0 max-w-full"
          activeTab={statusFilter}
          onChange={id => { setStatusFilter(id); setShown(40); }}
          tabs={[
            { id: 'open', label: 'Open Jobs' },
            { id: 'all', label: 'All Jobs' },
            { id: 'Requested', label: 'Requested' },
            { id: 'Approved', label: 'Approved' },
            { id: 'In Progress', label: 'In Workshop' },
            { id: 'Waiting for Parts', label: 'Waiting for Parts' },
            { id: 'Completed', label: 'Completed' },
            { id: 'Cancelled', label: 'Cancelled' },
          ]}
        />
        <span className="ml-auto">{vt.ui}</span>
      </div>

      {/* Empty State */}
      {filteredOrders.length === 0 && (
        <Card className="p-8 rounded-[20px] bg-white border border-slate-700 shadow-card text-center">
          <p className="text-sm font-semibold text-slate-200">No work orders match the selected filter</p>
          <p className="text-xs text-slate-400 mt-1">Change the filter above or create a new work order.</p>
        </Card>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredOrders.slice(0, shown).map(wo => (
            <Card
              key={wo.id}
              className="p-5 rounded-2xl bg-white border border-slate-700 hover:border-forest-500/40 shadow-card transition-all"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div tabIndex={0} onKeyDown={clickOnKey} className="space-y-2 flex-1 min-w-0 cursor-pointer" onClick={() => setViewingOrder(wo)}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-100 hover:text-forest-400 transition-colors">
                      {wo.workOrderNumber}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openVehicleDetail(wo.vehicleId);
                      }}
                      className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono text-xs font-bold hover:border-[#086343] cursor-pointer"
                    >
                      {wo.vehiclePlate}
                    </button>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${priorityColors[wo.priority]}`}>
                      {wo.priority} Priority
                    </span>
                    <StatusBadge status={wo.status} size="sm" />
                    {wo.approvalStatus !== 'Not Required' && (
                      <span className="text-[10px] text-amber-700 font-bold px-2 py-0.5 rounded-full bg-amber-50">
                        Approval: {wo.approvalStatus}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-semibold break-words">{wo.problemDescription}</p>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400 font-medium">
                    <span>Workshop: <strong className="text-slate-200">{wo.workshop}</strong></span>
                    <span>Requested: {formatDate(wo.reportedDate)}{wo.requestedByName ? ` by ${wo.requestedByName}` : ''}</span>
                    {wo.expectedCompletion && <span>Target: {formatDate(wo.expectedCompletion)}</span>}
                    {wo.partsRequired && <span>Parts: {wo.partsRequired}</span>}
                  </div>
                </div>

                {/* Right Cost & Status Action Buttons */}
                <div className="flex flex-row lg:flex-col items-end justify-between lg:justify-center gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-700">
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estimated / Final</p>
                    <p className="text-sm font-extrabold text-slate-100">{formatCurrency(wo.finalCost || wo.estimatedCost, currency)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="xs" onClick={() => setViewingOrder(wo)} leftIcon={<Eye className="w-3.5 h-3.5" />}>
                      Details
                    </Button>
                    {canEdit && wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
                      wo.approvalStatus === 'Pending' ? (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">Awaiting approval (Approvals module)</span>
                      ) : (
                        <>
                          {wo.approvalStatus !== 'Rejected' && wo.status === 'Requested' && (
                            <Button variant="secondary" size="xs" disabled={busyId === wo.id} onClick={() => handleStatusChange(wo.id, 'Approved')}>Approve</Button>
                          )}
                          {wo.approvalStatus !== 'Rejected' && wo.status === 'Approved' && (
                            <Button variant="secondary" size="xs" disabled={busyId === wo.id} onClick={() => handleStatusChange(wo.id, 'In Progress')}>Start Work</Button>
                          )}
                          {wo.approvalStatus !== 'Rejected' && wo.status === 'In Progress' && (
                            <Button variant="outline" size="xs" disabled={busyId === wo.id} onClick={() => handleStatusChange(wo.id, 'Waiting for Parts')}>Wait Parts</Button>
                          )}
                          {wo.approvalStatus !== 'Rejected' && wo.status === 'Waiting for Parts' && (
                            <Button variant="secondary" size="xs" disabled={busyId === wo.id} onClick={() => handleStatusChange(wo.id, 'In Progress')}>Resume Work</Button>
                          )}
                          {wo.approvalStatus !== 'Rejected' && wo.status !== 'Requested' && wo.status !== 'Draft' && (
                            <Button
                              variant="success"
                              size="xs"
                              isLoading={busyId === wo.id}
                              disabled={busyId === wo.id}
                              onClick={() => handleStatusChange(wo.id, 'Completed')}
                              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                            >
                              Mark Completed
                            </Button>
                          )}
                          <Button variant="ghost" size="xs" disabled={busyId === wo.id} onClick={() => handleStatusChange(wo.id, 'Cancelled')}>Cancel</Button>
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {filteredOrders.length > shown && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setShown(n => n + 40)}>
                Show more ({filteredOrders.length - shown} remaining)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* KANBAN BOARD VIEW */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {(['Requested', 'Approved', 'In Progress', 'Waiting for Parts', 'Completed'] as const).map(stage => {
            const stageOrders = workOrders.filter(w => w.status === stage && vt.matches(w.vehicleId) && (!selectedCompanyId || selectedCompanyId === 'all' || w.companyId === selectedCompanyId));

            return (
              <div key={stage} className="bg-slate-850 border border-slate-700 rounded-[20px] p-4 flex flex-col gap-3 min-w-[270px]">
                <div className="flex items-center justify-between px-1 py-1 border-b border-slate-700">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">{stage}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-700 text-slate-300 text-[10px] font-bold">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[70vh]">
                  {stageOrders.slice(0, 25).map(wo => (
                    <div {...buttonLike}
                      key={wo.id}
                      onClick={() => setViewingOrder(wo)}
                      className="p-4 bg-white border border-slate-700 hover:border-forest-500/40 rounded-2xl shadow-card space-y-2.5 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-slate-100 group-hover:text-forest-400 transition-colors">
                          {wo.workOrderNumber}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${priorityColors[wo.priority]}`}>
                          {wo.priority}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-semibold">{wo.problemDescription}</p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/60 font-mono">
                        <span className="font-bold text-slate-200">{wo.vehiclePlate}</span>
                        <span className="font-bold text-slate-100">{formatCurrency(wo.finalCost || wo.estimatedCost, currency)}</span>
                      </div>
                    </div>
                  ))}
                  {stageOrders.length === 0 && (
                    <div className="py-8 text-center text-[11px] text-slate-500">
                      No jobs in this stage.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WorkOrderDetailModal
        order={viewingOrder}
        isOpen={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        onStatusChange={handleStatusChange}
        busy={!!busyId}
      />
    </div>
  );
};
