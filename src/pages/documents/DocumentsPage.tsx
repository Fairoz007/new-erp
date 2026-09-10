import React, { useState } from 'react';
import { FolderOpen, Plus, Download, Upload, Trash2, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { DocumentItem } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatDate } from '../../utils/date';

export const DocumentsPage: React.FC = () => {
  const { documents, deleteDocument } = useFleet();
  const { openQuickModal, addToast, openVehicleDetail } = useUI();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredDocs = documents.filter(d => {
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    return true;
  });

  const columns: Column<DocumentItem>[] = [
    {
      key: 'documentName',
      header: 'Document Name / Number',
      render: (d) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-950/70 text-indigo-400 border border-indigo-800/60 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-slate-100">{d.documentName}</p>
            {d.documentNumber && <p className="text-[10px] text-slate-400 font-mono">Doc #{d.documentNumber}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (d) => (
        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 font-semibold text-[11px]">
          {d.category}
        </span>
      ),
    },
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      render: (d) => (
        d.vehiclePlate ? (
          <button
            onClick={() => d.vehicleId && openVehicleDetail(d.vehicleId, 'documents')}
            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-xs font-bold hover:underline cursor-pointer"
          >
            {d.vehiclePlate}
          </button>
        ) : (
          <span className="text-slate-500">Corporate Master</span>
        )
      ),
    },
    {
      key: 'expiryDate',
      header: 'Expiry Date / Alert',
      render: (d) => (
        <div>
          <span className="text-slate-300">{formatDate(d.expiryDate)}</span>
          {d.isExpired ? (
            <p className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Overdue Expiry
            </p>
          ) : d.isExpiringSoon ? (
            <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Expiring Soon
            </p>
          ) : (
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Valid
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'fileSize',
      header: 'File Size',
      render: (d) => <span className="text-slate-400 text-xs">{d.fileSize}</span>,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      sortable: false,
      render: (d) => (
        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => addToast({ type: 'info', title: 'Downloading file...' })}>
            Download
          </Button>
          <button
            onClick={() => {
              deleteDocument(d.id);
              addToast({ type: 'success', title: 'Document Removed' });
            }}
            className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <FolderOpen className="w-6 h-6 text-indigo-400" />
            <span>Digital Document & Compliance Repository</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Store and monitor Mulkiya registration cards, commercial vehicle insurance policies, road permits, and warranties.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('upload-document')}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            Upload Document
          </Button>
        </div>
      </div>

      <DataTable
        data={filteredDocs}
        columns={columns}
        keyExtractor={d => d.id}
        title="Fleet Compliance & Document Registry"
        searchPlaceholder="Search documents by title, number, plate, category..."
        searchFields={['documentName', 'documentNumber', 'vehiclePlate', 'category']}
        exportFilename="FleetX_Documents_Register"
        filterComponent={
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Document Categories</option>
            <option value="Registration">Registration (Mulkiya)</option>
            <option value="Insurance">Insurance Policies</option>
            <option value="Warranty">Warranty Agreements</option>
            <option value="Inspection Report">Inspection Certificates</option>
          </select>
        }
      />
    </div>
  );
};
