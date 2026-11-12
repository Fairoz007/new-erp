import React, { useState } from 'react';
import { Upload, Trash2, AlertTriangle, FileText, CheckCircle2, Eye } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { DocumentItem } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { downloadDocument } from '../../services/documents';
import { formatDate } from '../../utils/date';
import { HR_DOCUMENT_CATEGORIES } from '../../components/common/DocumentUploadZone';
import { FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';

export const DocumentsPage: React.FC = () => {
  const { documents, deleteDocument, selectedCompanyId } = useFleet();
  const { openQuickModal, addToast, openVehicleDetail, openBillModal } = useUI();
  const { hasPermission } = useAuth();
  const canDelete = hasPermission('delete', 'documents');
  const canUpload = hasPermission('create', 'documents');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [pending, setPending] = useState<Record<string, 'download' | 'delete'>>({});

  const setBusy = (id: string, op?: 'download' | 'delete') =>
    setPending(p => { const n = { ...p }; if (op) n[id] = op; else delete n[id]; return n; });

  const handleDownload = async (d: DocumentItem) => {
    if (pending[d.id]) return;
    setBusy(d.id, 'download');
    try {
      await downloadDocument(d);
    } catch (e) {
      addToast({ type: 'error', title: 'Download failed', message: (e as Error).message });
    } finally {
      setBusy(d.id);
    }
  };

  const handleDelete = async (d: DocumentItem) => {
    if (pending[d.id]) return;
    if (!window.confirm(`Permanently remove "${d.documentName}" and its stored file? This cannot be undone.`)) return;
    setBusy(d.id, 'delete');
    try {
      const result = (await deleteDocument(d.id)) as { fileCleanupFailed?: boolean } | void;
      if (result && result.fileCleanupFailed) {
        addToast({ type: 'warning', title: 'Document removed', message: 'The record was deleted but its file could not be removed from storage. An administrator can clean it up.' });
      } else {
        addToast({ type: 'success', title: 'Document Removed', message: `"${d.documentName}" was deleted.` });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Delete failed', message: (e as Error).message });
    } finally {
      setBusy(d.id);
    }
  };

  const filteredDocs = documents.filter(d => {
    if (categoryFilter === 'hr') { if (!d.employeeId) return false; }
    else if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (selectedCompanyId !== 'all' && d.companyId !== selectedCompanyId) return false;
    return true;
  });

  const columns: Column<DocumentItem>[] = [
    {
      key: 'documentName',
      header: 'Document Name / Number',
      truncate: true,
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
        <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-forest-700 font-semibold text-[11px]">
          {d.category}
        </span>
      ),
    },
    {
      key: 'vehiclePlate',
      header: 'Linked to',
      value: (d) => d.vehiclePlate ?? d.employeeName ?? '',
      render: (d) => (
        d.employeeName && !d.vehiclePlate ? (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-slate-200 text-xs font-semibold">{d.employeeName}</span>
        ) : d.vehiclePlate ? (
          <button
            onClick={() => d.vehicleId && openVehicleDetail(d.vehicleId, 'documents')}
            className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-forest-700 font-mono text-xs font-bold hover:underline cursor-pointer"
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
          {!d.expiryDate ? (
            <p className="text-[10px] text-slate-500">No expiry</p>
          ) : d.isExpired ? (
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
      render: (d) => <span className="text-slate-400 text-xs">{d.fileSize || '-'}</span>,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      sortable: false,
      render: (d) => (
        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="xs"
            disabled={!d.documentUrl}
            onClick={() => openBillModal(d.documentUrl!, d.documentName, d.fileType, d.fileSize)}
            leftIcon={<Eye className="w-3.5 h-3.5" />}
          >
            View
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={!d.documentUrl || !!pending[d.id]}
            onClick={() => handleDownload(d)}
          >
            {pending[d.id] === 'download' ? 'Preparing...' : 'Download'}
          </Button>
          {canDelete && (
            <button
              onClick={() => handleDelete(d)}
              disabled={!!pending[d.id]}
              className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer disabled:opacity-50"
              title="Delete document"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Digital Document & Compliance Repository"
        description="Store and monitor Mulkiya registration cards, commercial vehicle insurance policies, road permits, and warranties."
        actions={
          <>
            {canUpload && (
              <Button
                variant="primary"
                size="md"
                onClick={() => openQuickModal('upload-document')}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Upload Document
              </Button>
            )}
          </>
        }
      />

      <DataTable
        data={filteredDocs}
        collection={'documents'}
        columns={columns}
        keyExtractor={d => d.id}
        title="Fleet Compliance & Document Registry"
        searchPlaceholder="Search documents by title, number, plate, employee, category..."
        searchFields={['documentName', 'documentNumber', 'vehiclePlate', 'employeeName', 'category']}
        exportFilename="Documents_Register"
        filterComponent={
          <FilterSelect
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Document Categories</option>
            <option value="Registration">Registration (Mulkiya)</option>
            <option value="Insurance">Insurance Policies</option>
            <option value="Warranty">Warranty Agreements</option>
            <option value="Inspection Report">Inspection Certificates</option>
            <option value="Accident Report">Accident Reports</option>
            <option value="Purchase Invoice">Purchase Agreements</option>
            <option value="hr">HR documents (any employee)</option>
            {HR_DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="Other">Other</option>
          </FilterSelect>
        }
      />
    </div>
  );
};
