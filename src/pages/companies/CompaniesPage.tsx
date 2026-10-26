import React, { useState } from 'react';
import { Phone, Mail, MapPin, CreditCard, Users, Car, FileText, Layers, Plus, Pencil } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { Company } from '../../types/system';
import { CompanyFormModal } from './CompanyFormModal';

export const CompaniesPage: React.FC = () => {
  const { companies, vehicles, invoices, employees, selectedCompanyId, setSelectedCompanyId, addCompany, updateCompany } = useFleet();
  const { addToast } = useUI();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit', 'companies');
  const canCreate = hasPermission('create', 'companies');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | undefined>(undefined);

  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (c: Company) => { setEditing(c); setFormOpen(true); };

  const saveCompany = async (data: Omit<Company, 'id'>) => {
    if (editing) {
      await updateCompany(editing.id, data);
      addToast({ type: 'success', title: 'Office Updated', message: `${data.name} was saved.` });
    } else {
      await addCompany(data);
      addToast({ type: 'success', title: 'Office Created', message: `${data.name} was added.` });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Offices & Branches Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Corporate organizational structure: each office keeps its own fleet, records, chart of accounts and document numbering.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant={selectedCompanyId === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSelectedCompanyId('all')}
            className="cursor-pointer rounded-full"
          >
            <Layers className="w-4 h-4 mr-1.5" />
            {selectedCompanyId === 'all' ? 'Viewing Consolidated (All Offices)' : 'Switch to Consolidated View'}
          </Button>
          {canCreate && (
            <Button variant="primary" size="sm" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
              Add Office
            </Button>
          )}
        </div>
      </div>

      {/* Group totals (computed from the loaded records) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-700 rounded-[20px] p-5 shadow-card">
          <span className="text-slate-400 block text-[10px] uppercase font-medium">Offices</span>
          <span className="text-2xl font-bold text-slate-100">{companies.length}</span>
        </div>
        <div className="bg-white border border-slate-700 rounded-[20px] p-5 shadow-card">
          <span className="text-slate-400 block text-[10px] uppercase font-medium">Vehicles (all offices)</span>
          <span className="text-2xl font-bold text-slate-100">{vehicles.length}</span>
        </div>
        <div className="bg-white border border-slate-700 rounded-[20px] p-5 shadow-card">
          <span className="text-slate-400 block text-[10px] uppercase font-medium">Employees (all offices)</span>
          <span className="text-2xl font-bold text-slate-100">{employees.length}</span>
        </div>
      </div>

      {companies.length === 0 && (
        <div className="bg-white border border-slate-700 rounded-[20px] p-10 text-center text-sm text-slate-400">
          No offices are visible to your account yet.{canCreate ? ' Use "Add Office" to create the first one.' : ''}
        </div>
      )}

      {/* Offices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {companies.map(comp => {
          const compVehicles = vehicles.filter(v => v.companyId === comp.id);
          const compInvoices = invoices.filter(i => i.companyId === comp.id);
          const compStaff = employees.filter(e => e.companyId === comp.id);
          const isSelected = selectedCompanyId === comp.id;

          return (
            <Card
              key={comp.id}
              className={`rounded-[20px] bg-white border transition-all ${
                isSelected
                  ? 'ring-2 ring-forest-500 border-forest-500 shadow-card'
                  : 'border-slate-700 hover:border-slate-600 shadow-card'
              }`}
            >
              <CardHeader
                action={
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Button variant="ghost" size="xs" onClick={() => openEdit(comp)} leftIcon={<Pencil className="w-3.5 h-3.5" />}>
                        Edit
                      </Button>
                    )}
                    <Button
                      variant={isSelected ? 'primary' : 'outline'}
                      size="xs"
                      onClick={() => setSelectedCompanyId(isSelected ? 'all' : comp.id)}
                      className="cursor-pointer rounded-full"
                    >
                      {isSelected ? 'Active Filter (Click to Reset)' : 'Filter by this office'}
                    </Button>
                  </div>
                }
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-forest-100 text-forest-700 border border-forest-500/20 flex items-center justify-center font-bold text-base shrink-0">
                    {comp.code.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-100">{comp.name}</h3>
                      {!comp.active && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-850 text-slate-400 font-semibold border border-slate-700">
                          Inactive
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Code: {comp.code} • {comp.city}, {comp.state}, {comp.country}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {/* Office Role Description */}
                <p className="text-xs text-slate-300 bg-slate-850/60 p-3 rounded-xl border border-slate-700/80 leading-relaxed">
                  {comp.notes || 'No description recorded.'}
                </p>

                {/* Operational Stats Grid */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-850/60 rounded-xl border border-slate-700/80 text-center">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium flex items-center justify-center gap-1">
                      <Car className="w-3 h-3 text-forest-500" /> Assigned Fleet
                    </span>
                    <span className="text-lg font-bold text-slate-100 mt-0.5 block">{compVehicles.length} Vehicles</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium flex items-center justify-center gap-1">
                      <Users className="w-3 h-3 text-forest-500" /> Office Staff
                    </span>
                    <span className="text-lg font-bold text-slate-100 mt-0.5 block">{compStaff.length} Employees</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium flex items-center justify-center gap-1">
                      <FileText className="w-3 h-3 text-forest-500" /> Invoices Logged
                    </span>
                    <span className="text-lg font-bold text-slate-100 mt-0.5 block">{compInvoices.length} Invoices</span>
                  </div>
                </div>

                {/* Tax & Registration Details */}
                <div className="space-y-2 pt-1 bg-slate-850/40 p-3 rounded-xl border border-slate-700/60">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Commercial Registration (CR):</span>
                    <span className="font-mono font-semibold text-slate-200">{comp.registrationNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">VAT Identification:</span>
                    <span className="font-mono font-semibold text-slate-200">{comp.vatNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Financial Fiscal Period:</span>
                    <span className="text-slate-300 font-medium">{comp.financialYear}</span>
                  </div>
                </div>

                {/* Bank Account */}
                {comp.bankDetails?.bankName && (
                  <div className="p-3 bg-slate-850/60 rounded-xl border border-slate-700/80 space-y-1">
                    <p className="font-semibold text-forest-700 flex items-center gap-1.5 text-[11px]">
                      <CreditCard className="w-3.5 h-3.5 text-forest-500" /> {comp.bankDetails.bankName}
                    </p>
                    <p className="text-[10px] text-slate-300 font-mono">IBAN: {comp.bankDetails.iban}</p>
                    <p className="text-[10px] text-slate-400">Operating Branch: {comp.bankDetails.branch}</p>
                  </div>
                )}

                {/* Contact info */}
                <div className="pt-2 border-t border-slate-700/80 text-[11px] text-slate-400 space-y-1.5">
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{comp.address}, {comp.city}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{comp.phone}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{comp.email}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CompanyFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} company={editing} onSubmit={saveCompany} />
    </div>
  );
};
