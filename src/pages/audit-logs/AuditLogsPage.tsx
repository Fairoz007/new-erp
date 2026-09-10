import React, { useState } from 'react';
import { History, Shield, Download, Filter, User } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { AuditLog } from '../../types/system';
import { useFleet } from '../../context/FleetContext';
import { formatDateTime } from '../../utils/date';

export const AuditLogsPage: React.FC = () => {
  const { auditLogs } = useFleet();
  const [actionFilter, setActionFilter] = useState<string>('all');

  const filteredLogs = auditLogs.filter(l => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    return true;
  });

  const columns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (l) => <span className="font-mono text-slate-300 text-xs">{formatDateTime(l.timestamp)}</span>,
    },
    {
      key: 'userName',
      header: 'User & Role',
      render: (l) => (
        <div>
          <span className="font-semibold text-slate-100">{l.userName}</span>
          <p className="text-[10px] text-indigo-400 font-mono">{l.userRole}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (l) => (
        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
          l.action === 'CREATE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
          l.action === 'UPDATE' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
          l.action === 'DELETE' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
          l.action === 'APPROVE' ? 'bg-purple-950 text-purple-400 border border-purple-800' :
          l.action === 'PAYMENT' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
          'bg-slate-800 text-slate-300'
        }`}>
          {l.action}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Target Entity',
      render: (l) => (
        <div>
          <span className="font-semibold text-slate-200">{l.entityType}</span>
          <p className="text-[10px] text-slate-400 font-mono">{l.entityName}</p>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Audit Event Details',
      render: (l) => <span className="text-slate-300 text-xs">{l.details}</span>,
    },
    {
      key: 'ipAddress',
      header: 'IP Address',
      render: (l) => <span className="font-mono text-slate-500 text-[11px]">{l.ipAddress || '192.168.1.100'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-indigo-400" />
            <span>Immutable Audit Trail & Activity Logs</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Non-repudiable audit logs recording all vehicle additions, mileage modifications, work order approvals, payments, and ledger entries.
          </p>
        </div>
      </div>

      <DataTable
        data={filteredLogs}
        columns={columns}
        keyExtractor={l => l.id}
        title="System Security & Change Ledger"
        searchPlaceholder="Search audit logs by user, action, entity, plate or details..."
        searchFields={['userName', 'userRole', 'action', 'entityType', 'entityName', 'details', 'ipAddress']}
        exportFilename="FleetX_Audit_Logs"
        filterComponent={
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Action Types</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="APPROVE">APPROVE</option>
            <option value="PAYMENT">PAYMENT</option>
            <option value="RECONCILE">RECONCILE</option>
          </select>
        }
      />
    </div>
  );
};
