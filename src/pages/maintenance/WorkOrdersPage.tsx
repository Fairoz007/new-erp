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
  const { hasPermission } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const filteredOrders = workOrders.filter(wo => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && wo.companyId !== selectedCompanyId) return false;
    return true;
  });

  const handleStatusChange = (orderId: string, newStatus: WorkOrderStatus) => {
    updateWorkOrderStatus(orderId, newStatus);
    addToast({
      type: 'success',
      title: 'Work Order Updated',
      message: `Status updated to ${newStatus}${newStatus === 'Completed' ? ' and maintenance record/supplier invoice linked.' : '.'}`,
    });
  };

  const priorityColors = {
    Low: 'text-slate-400 bg-slate-800 border-slate-700',
    Medium: 'text-blue-300 bg-blue-950/70 border-blue-800/60',
    High: 'text-amber-300 bg-amber-950/70 border-amber-800/60',
    Critical: 'text-rose-300 bg-rose-950/70 border-rose-800/60 animate-pulse',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-amber-400" />
            <span>Maintenance Work Orders</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Dispatch, track workshop jobs, approve multi-tier repair estimates, and mark completed jobs to trigger automated AP cascade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs rounded font-medium cursor-pointer ${
                viewMode === 'list' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-xs rounded font-medium cursor-pointer ${
                viewMode === 'kanban' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kanban Board
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-work-order')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Work Order
          </Button>
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredOrders.map(wo => (
            <Card key={wo.id} className="p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-100">{wo.workOrderNumber}</span>
                    <button
                      onClick={() => openVehicleDetail(wo.vehicleId)}
                      className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-indigo-300 font-mono text-xs font-bold hover:border-indigo-500 cursor-pointer"
                    >
                      {wo.vehiclePlate}
                    </button>
                    <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${priorityColors[wo.priority]}`}>
                      {wo.priority} Priority
                    </span>
                    <StatusBadge status={wo.status} size="sm" />
                    {wo.approvalStatus !== 'Not Required' && (
                      <span className="text-[10px] text-amber-400 font-medium">
                        (Approval: {wo.approvalStatus})
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed font-medium">{wo.problemDescription}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>Workshop: <strong>{wo.workshop}</strong></span>
                    <span>Requested: {formatDate(wo.reportedDate)} by {wo.requestedByName}</span>
                    {wo.expectedCompletion && <span>Target Date: {formatDate(wo.expectedCompletion)}</span>}
                    {wo.partsRequired && <span>Parts: {wo.partsRequired}</span>}
                  </div>
                </div>

                {/* Right Cost & Status Action Buttons */}
                <div className="flex flex-row lg:flex-col items-end justify-between lg:justify-center gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] text-slate-400 uppercase">Estimated / Final</p>
                    <p className="text-sm font-bold text-slate-100">{formatCurrency(wo.finalCost || wo.estimatedCost, currency)}</p>
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
                        <Button
                          variant="success"
                          size="xs"
                          onClick={() => handleStatusChange(wo.id, 'Completed')}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Mark Completed
                        </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
          {(['Requested', 'Approved', 'In Progress', 'Completed'] as const).map(stage => {
            const stageOrders = filteredOrders.filter(w => w.status === stage);

            return (
              <div key={stage} className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-3 min-w-[260px]">
                <div className="flex items-center justify-between px-1 py-1 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">{stage}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh]">
                  {stageOrders.map(wo => (
                    <div
                      key={wo.id}
                      className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-slate-200">{wo.workOrderNumber}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${priorityColors[wo.priority]}`}>
                          {wo.priority}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{wo.problemDescription}</p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                        <span className="font-mono text-indigo-400 font-semibold">{wo.vehiclePlate}</span>
                        <span className="font-bold text-slate-100">{formatCurrency(wo.finalCost || wo.estimatedCost, currency)}</span>
                      </div>

                      {stage !== 'Completed' && (
                        <div className="pt-2 border-t border-slate-800 flex justify-end">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => handleStatusChange(wo.id, stage === 'Requested' ? 'Approved' : stage === 'Approved' ? 'In Progress' : 'Completed')}
                          >
                            Advance →
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {stageOrders.length === 0 && (
                    <p className="text-center text-[11px] text-slate-500 py-6">No jobs in {stage}</p>
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
