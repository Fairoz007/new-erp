import React from 'react';
import { ClipboardList, Car, Wrench, Calendar, DollarSign, User, MapPin, CheckCircle2, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { WorkOrder, WorkOrderStatus } from '../../types/maintenance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { DetailTitle } from '../../components/ui/DetailTitle';

interface WorkOrderDetailModalProps {
  order: WorkOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (orderId: string, status: WorkOrderStatus) => void;
  busy: boolean;
}

export const WorkOrderDetailModal: React.FC<WorkOrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  onStatusChange,
  busy,
}) => {
  const { vehicles, currency } = useFleet();
  const { openVehicleDetail } = useUI();
  const { hasPermission, canApprove } = useAuth();
  const canEdit = hasPermission('edit', 'work-orders');

  if (!order) return null;

  const vehicle = vehicles.find(v => v.id === order.vehicleId);

  const priorityStyles = {
    Low: 'bg-slate-800 text-slate-300',
    Medium: 'bg-blue-900/60 text-blue-300 border border-blue-700/60',
    High: 'bg-amber-900/60 text-amber-300 border border-amber-700/60',
    Critical: 'bg-rose-900/60 text-rose-300 border border-rose-700/60 animate-pulse',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <DetailTitle
          icon={<ClipboardList className="w-5 h-5" />}
          title={<>Work Order: {order.workOrderNumber}</>}
          badges={
            <>
              <StatusBadge status={order.status} size="sm" />
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${priorityStyles[order.priority]}`}>
                {order.priority}
              </span>
            </>
          }
          meta={<>Vehicle: {order.vehiclePlate || vehicle?.plateNumber || 'Not specified'} • Reported on {formatDate(order.reportedDate)}</>}
        />
      }
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {vehicle && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  openVehicleDetail(vehicle.id, 'maintenance');
                }}
                leftIcon={<Car className="w-4 h-4" />}
              >
                View Vehicle Profile
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && order.status !== 'Completed' && order.status !== 'Cancelled' && (
              order.approvalStatus === 'Pending' ? (
                <span className="text-xs font-bold text-amber-400">Awaiting approval in Approvals queue</span>
              ) : (
                <>
                  {order.approvalStatus !== 'Rejected' && order.status === 'Requested' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onStatusChange(order.id, 'Approved')}
                    >
                      Approve Order
                    </Button>
                  )}
                  {order.approvalStatus !== 'Rejected' && order.status === 'Approved' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onStatusChange(order.id, 'In Progress')}
                    >
                      Start Work
                    </Button>
                  )}
                  {order.approvalStatus !== 'Rejected' && order.status === 'In Progress' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onStatusChange(order.id, 'Waiting for Parts')}
                    >
                      Wait for Parts
                    </Button>
                  )}
                  {order.approvalStatus !== 'Rejected' && order.status === 'Waiting for Parts' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onStatusChange(order.id, 'In Progress')}
                    >
                      Resume Work
                    </Button>
                  )}
                  {order.approvalStatus !== 'Rejected' && order.status !== 'Requested' && order.status !== 'Draft' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onStatusChange(order.id, 'Completed')}
                      leftIcon={<CheckCircle2 className="w-4 h-4" />}
                    >
                      Complete & Post Record
                    </Button>
                  )}
                </>
              )
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* Cost & Estimates Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Estimated Repair Cost</span>
            <span className="text-xl font-bold text-slate-100 mt-1 block">
              {formatCurrency(order.estimatedCost, currency)}
            </span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Final Approved Cost</span>
            <span className="text-xl font-bold text-emerald-400 mt-1 block">
              {formatCurrency(order.finalCost || order.estimatedCost, currency)}
            </span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Approval Verification</span>
            <span className={`text-base font-bold mt-1 block ${order.approvalStatus === 'Approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {order.approvalStatus}
            </span>
            {order.approvalId && <span className="text-[10px] text-slate-500">Ref: {order.approvalId}</span>}
          </div>
        </div>

        {/* Vehicle & Workshop Assignment */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Job Routing & Assignment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Assigned Vehicle</span>
              <span className="font-bold text-slate-100">{vehicle ? `${vehicle.brand} ${vehicle.model}` : order.vehiclePlate}</span>
              <span className="text-[10px] font-mono text-slate-400 block">{order.vehiclePlate}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Workshop / Service Centre</span>
              <span className="font-semibold text-slate-200">{order.workshop || order.supplierName || 'Internal Workshop'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Target Completion</span>
              <span className="font-semibold text-slate-200">{order.expectedCompletion ? formatDate(order.expectedCompletion) : 'Not specified'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Requested By</span>
              <span className="text-slate-200">{order.requestedByName || 'Fleet Supervisor'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Creation Date</span>
              <span className="text-slate-200">{formatDate(order.reportedDate)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Office / Company</span>
              <span className="text-slate-200">{order.companyId || 'Corporate'}</span>
            </div>
          </div>
        </div>

        {/* Problem Description & Symptoms */}
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Problem Description & Fault Diagnosis</h3>
          <p className="text-xs text-slate-200 leading-relaxed font-medium bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
            {order.problemDescription}
          </p>
        </div>

        {/* Parts Required & Technicians Notes */}
        {(order.partsRequired || order.notes) && (
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            {order.partsRequired && (
              <div>
                <h4 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">Spare Parts & Components Required</h4>
                <p className="text-xs text-slate-200 mt-1">{order.partsRequired}</p>
              </div>
            )}
            {order.notes && (
              <div>
                <h4 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">Technician Instructions & Notes</h4>
                <p className="text-xs text-slate-300 mt-1 italic">{order.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
