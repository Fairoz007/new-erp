import React, { useState } from 'react';
import { ClipboardList, Plus, CheckCircle2, Clock, AlertCircle, CheckSquare, Wrench } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { WorkOrder, WorkOrderStatus } from '../../types/maintenance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const WorkOrdersPage: React.FC = () => {
  const { workOrders, updateWorkOrderStatus, selectedCompanyId, currency } = useFleet();
  const { openQuickModal, addToast, openVehicleDetail } = useUI();
  const { hasPermission, canApprove } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const filteredOrders = workOrders.filter(wo => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && wo.companyId !== selectedCompanyId) return false;
    return true;
  });

  const handleStatusChange = (orderId: string, newStatus: WorkOrderStatus) => {
    const order = workOrders.find(w => w.id === orderId);
    if (!order) return;
    if (!hasPermission('edit', 'work-orders')) {
      addToast({ type: 'error', title: 'Permission denied', message: 'Your role cannot update work orders.' });
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
    updateWorkOrderStatus(orderId, newStatus);
    addToast({
      type: 'success',
      title: 'Work Order Updated',
      message: `Status updated to ${newStatus}${newStatus === 'Completed' ? ' and maintenance record/supplier invoice linked.' : '.'}`,
    });
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Maintenance Work Orders
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Dispatch, track workshop jobs, approve multi-tier repair estimates, and mark completed jobs to trigger automated AP cascade.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-slate-850 border border-slate-700 rounded-full">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-1.5 text-xs rounded-full font-bold cursor-pointer transition-all ${
                viewMode === 'list' ? 'bg-white text-slate-100 shadow-2xs' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3.5 py-1.5 text-xs rounded-full font-bold cursor-pointer transition-all ${
                viewMode === 'kanban' ? 'bg-white text-slate-100 shadow-2xs' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Kanban Board
            </button>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-work-order')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Work Order
          </Button>
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3.5">
          {filteredOrders.map(wo => (
            <Card key={wo.id} className="p-5 sm:p-6 bg-white border-slate-700">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-100">{wo.workOrderNumber}</span>
                    <button
                      onClick={() => openVehicleDetail(wo.vehicleId)}
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

                  <p className="text-xs text-slate-300 leading-relaxed font-semibold">{wo.problemDescription}</p>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400 font-medium">
                    <span>Workshop: <strong className="text-slate-200">{wo.workshop}</strong></span>
                    <span>Requested: {formatDate(wo.reportedDate)} by {wo.requestedByName}</span>
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
                    {wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
                      <>
                        {wo.status === 'Requested' && (
                          <Button variant="secondary" size="xs" onClick={() => handleStatusChange(wo.id, 'Approved')}>
                            Approve
                          </Button>
                        )}
                        {wo.status === 'Approved' && (
                          <Button variant="secondary" size="xs" onClick={() => handleStatusChange(wo.id, 'In Progress')}>
                            Start Work
                          </Button>
                        )}
                        {wo.status === 'In Progress' && (
                          <Button variant="outline" size="xs" onClick={() => handleStatusChange(wo.id, 'Waiting for Parts')}>
                            Wait Parts
                          </Button>
                        )}
                        {wo.status === 'Waiting for Parts' && (
                          <Button variant="secondary" size="xs" onClick={() => handleStatusChange(wo.id, 'In Progress')}>
                            Resume Work
                          </Button>
                        )}
                        {wo.status !== 'Requested' && (
                        <Button
                          variant="success"
                          size="xs"
                          onClick={() => handleStatusChange(wo.id, 'Completed')}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Mark Completed
                        </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* KANBAN BOARD VIEW */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {(['Requested', 'Approved', 'In Progress', 'Waiting for Parts', 'Completed'] as const).map(stage => {
            const stageOrders = filteredOrders.filter(w => w.status === stage);

            return (
              <div key={stage} className="bg-slate-850 border border-slate-700 rounded-[20px] p-4 flex flex-col gap-3 min-w-[270px]">
                <div className="flex items-center justify-between px-1 py-1 border-b border-slate-700">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">{stage}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-700 text-slate-300 text-[10px] font-bold">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[70vh]">
                  {stageOrders.map(wo => (
                    <div
                      key={wo.id}
                      className="p-4 bg-white border border-slate-700 hover:border-forest-500/40 rounded-2xl shadow-card space-y-2.5 transition-all"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-slate-100">{wo.workOrderNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${priorityColors[wo.priority]}`}>
                          {wo.priority}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-semibold">{wo.problemDescription}</p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-700">
                        <span className="font-mono text-[#086343] font-bold">{wo.vehiclePlate}</span>
                        <span className="font-extrabold text-slate-100">{formatCurrency(wo.finalCost || wo.estimatedCost, currency)}</span>
                      </div>

                      {stage !== 'Completed' && (
                        <div className="pt-2 border-t border-slate-700 flex justify-end">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => handleStatusChange(wo.id, stage === 'Requested' ? 'Approved' : stage === 'Approved' ? 'In Progress' : stage === 'Waiting for Parts' ? 'In Progress' : 'Completed')}
                          >
                            Advance →
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {stageOrders.length === 0 && (
                    <p className="text-center text-[11px] text-slate-400 py-6">No jobs in {stage}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
